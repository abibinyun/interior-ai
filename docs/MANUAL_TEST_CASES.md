# Manual Test Cases — Interior AI Journey Builder

Saved from the manual walkthrough on 2026-06-20. Use these as a regression
checklist before each release. The two bugs reported in the latest session
live under §5 (style 404) and §3 (polling 429 storm).

---

## §1 — F1 Foundation smoke

| # | Action | Expected | Pass |
|---|---|---|---|
| 1.1 | `GET /` | Landing page renders with 3 feature cards | ☐ |
| 1.2 | Press Tab once | "Skip to main content" link appears | ☐ |
| 1.3 | Press Enter on skip link | Focus moves to `<main>` | ☐ |

## §2 — F3 Project Flow smoke

| # | Action | Expected | Pass |
|---|---|---|---|
| 2.1 | Create project "My Dream House" | Project page shows status DRAFT | ☐ |
| 2.2 | Add style JAPANDI | Style section shows `JAPANDI` | ☐ |
| 2.3 | Reload page | All state persists (Postgres + Supabase) | ☐ |

## §3 — Generation polling (BUG: 429 storm after fix)

Repro from manual session on 2026-06-20:

> "at generate page 3 first request ar oke ... but after that tomany
> request ... and success again with image showing 1 of 3 ... and got
> to many request again ... and got success with 2 up image of 3"

Sequence observed in DevTools Network panel (BEFORE fix):
1. `GET /api/rooms/<id>/generations/batches/<batchId>` → 200 (x3)
2. `GET /api/rooms/<id>/generations/batches/<batchId>` → 429
3. `GET /api/rooms/<id>/generations/batches/<batchId>` → 200 (shows 1 of 3)
4. `GET /api/rooms/<id>/generations/batches/<batchId>` → 429
5. `GET /api/rooms/<id>/generations/batches/<batchId>` → 200 (shows 2 of 3)
6. Third card renders with `Provider returned malformed data / Myceli request failed`

**Root cause:** Two compounding issues:
1. The rate-limit bucket is per-session and shared across ALL
   `/api/rooms/.../generations*` calls. With max=5/min and 2 s
   polling, the bucket empties in ~6 s; every subsequent poll
   triggers 429.
2. The previous "back off to max(Retry-After, 30 s)" only kicked
   in AFTER the 429. The 30 s wait put the polling inside a still-
   full bucket window (60 s), so the next poll also 429'd.
   Perpetual ping-pong.

**Sequence observed in DevTools Network panel (AFTER fix, automated Playwright test 2026-06-20 14:58):**

```
   6265ms  POST   /api/rooms/.../generations            → 201  remaining=1  reset=21s
   6319ms  GET    /api/rooms/.../generations            → 200  remaining=0  reset=21s
  14349ms  GET    /api/rooms/.../generations/batches/.. → 429  remaining=0  Retry-After=13  reset=13s
  27427ms  GET    /api/rooms/.../generations/batches/.. → 200  remaining=4  reset=60s
  <batch done — all FAILED with Polinations 402 — polling stops>
```

ONE 429, not a perpetual cycle. The 13 s backoff (Retry-After value
floored at 5 s, so max(13000, 5000)=13000) waits long enough for the
bucket to reset. The next poll succeeds with a fresh bucket.

**Two-layer fix in `apps/frontend/src/hooks/useGenerations.ts`:**

1. **Proactive self-pacing**: `apiFetch` updates a module-level
   `getLastRateLimit()` cache on every response. When the latest
   `RateLimit-Remaining ≤ 1`, polling slows from 2 s → 8 s BEFORE
   the next request would 429. This is the main fix.
2. **Reactive backoff**: when a 429 slips through, honor the
   server's `Retry-After` (server knows exactly when the bucket
   resets — more accurate than a magic 30 s). Floor at 5 s.
3. **Stop polling on non-429 errors** (previously polled forever on
   500/404 — was the source of the "phantom poll" problem that
   burned the bucket before generation even started).

| # | Action | Expected | Pass |
|---|---|---|---|
| 3.1 | Generate a batch in a single tab. Watch DevTools Network panel. | At most 1 429 per batch (the first poll when the cache is still cold). After backoff, polling resumes cleanly. NO 429→200→429→200 interleaving. | ☑ (verified via Playwright 2026-06-20) |
| 3.2 | Open TWO tabs on the same `/rooms/<id>/generations` page (same session). | Polls from both tabs share the rate-limit bucket. After 5 polls, both tabs see 429 then both back off. | ☐ |
| 3.3 | When the third card shows `Myceli request failed`, verify it's not a polling issue but a provider-level fallback failure (M9 fallback path). | Card shows `Provider returned malformed data` with no spinner; user clicks "Generate" to retry. | ☑ (observed: Polinations 402, not Myceli) |
| 3.4 | Trigger a server error mid-batch (e.g. simulate 500). | Polling STOPS (not backoff — stop). User must re-trigger. | ☑ (verified by test `useGenerations.test.tsx > stops polling on non-429 errors`) |

## §4 — F5 Refinement smoke

| # | Action | Expected | Pass |
|---|---|---|---|
| 4.1 | Open approved generation detail | Lineage tree shows root | ☐ |
| 4.2 | Click Refine, fill 2 fields, submit | New batch creates | ☐ |
| 4.3 | Wait for new batch | 3 new images appear | ☐ |
| 4.4 | Open new batch detail | Lineage tree shows root → refinement → current | ☐ |

## §5 — Style page 404 (status quo: EXPECTED, but confusing)

From the manual session:
> "at open style after create project ... Status Code 404 Not Found"

**Root cause:** `useProjectStyle` correctly catches 404 and returns `null`.
The network response IS 404, but the UI then renders "No style set yet."
This is the **correct** behavior — the project has no style profile until
the user picks one. However, the 404 in the network panel is confusing and
clutters the failure surface audit.

| # | Action | Expected | Pass |
|---|---|---|---|
| 5.1 | Create a project, navigate directly to `/projects/<id>/style` | UI shows the catalog + "No notes" placeholder, NOT an error state. Network panel shows 200 OK with `null` body (no 404). | ☑ (verified via Playwright 2026-06-20 + curl `200 OK, body: "null"`) |
| 5.2 | Pick a style + save | Page flips to "Update style" mode. No 404 in network on subsequent loads. | ☐ |

**Fix applied (2026-06-20):** `GET /api/projects/:id/style` now returns
`200 OK` with a `null` body when no style is set. The 404 is reserved
for "the project itself doesn't exist." Two changes:
- `apps/backend/src/style-profiles/style-profiles.service.ts`:
  `get()` returns `null` instead of throwing `NotFoundError` when the
  profile is missing. The `requireOwnedProject` check still throws on
  "project not found" (the real 404 case).
- `apps/backend/src/projects/projects.controller.ts`: `getStyle()`
  uses `@Res({ passthrough: false })` to bypass NestJS's response
  transformer (which mangled `null` → `{}`). The response body is now
  the literal JSON `null` (4 bytes).
- `apps/frontend/src/api/client.ts`: `apiFetch` reads the response
  as text first; an empty or whitespace-only body returns
  `undefined as T` (defensive — handles any other endpoint that
  might also send empty 200s).

## §6 — F7 Cross-room UX smoke

| # | Action | Expected | Pass |
|---|---|---|---|
| 6.1 | Approve Living Room | Status flips to APPROVED | ☐ |
| 6.2 | Open Kitchen room | StyleAnchorBanner appears at top with `living room: ...` segment | ☐ |
| 6.3 | Generate + approve Kitchen | Progress bar = "2 of 2 approved" forest-green | ☐ |

## §7 — F8 References smoke (all 3 sources + validation)

| # | Action | Expected | Pass |
|---|---|---|---|
| 7.1 | Generated tab | Dropdown lists completed generations | ☐ |
| 7.2 | External link tab — paste `not-a-url` | Submit disabled | ☐ |
| 7.3 | External link tab — paste valid URL | Submit enables | ☐ |
| 7.4 | Upload tab — try 12 MB file | Client-side error "Up to 10 MB", NO network call | ☐ |
| 7.5 | Upload tab — try .txt file | Client-side error "JPEG, PNG, or WebP", NO network call | ☐ |
| 7.6 | Upload tab — upload valid PNG | Progress bar 0→100%, card appears | ☐ |
| 7.7 | Delete a reference | Card disappears after confirmation | ☐ |

## §8 — Multi-session isolation

| # | Action | Expected | Pass |
|---|---|---|---|
| 8.1 | Window A: note room ID | e.g. `/rooms/abc-123/...` | ☐ |
| 8.2 | Window B (different `sid`): navigate to `/rooms/abc-123` | "Not found" | ☐ |
| 8.3 | Window B: DevTools `fetch('/api/rooms/abc-123')` | 404 NOT_FOUND | ☐ |

## §9 — F9 Export UX smoke

| # | Action | Expected | Pass |
|---|---|---|---|
| 9.1 | "Mark house complete" with all rooms approved | CTA enabled | ☐ |
| 9.2 | Click → "Open exports →" | URL = `/projects/<id>/exports` | ☐ |
| 9.3 | "Create first bundle" → confirm | v1 created with manifest + download URL | ☐ |
| 9.4 | Click "Preview →" | Bundle preview page renders file list | ☐ |
| 9.5 | Click download → unzip from terminal | 5 files: `project-summary.json`, `style-profile.json`, `approved-images/<room>.jpg`, `prompts/<room>.json`, `room-notes/<room>.md` | ☐ |
| 9.6 | Re-export | v2 created, list shows v2 (Latest) + v1 | ☐ |
| 9.7 | "Reopen project" | Project goes back to DRAFT, bundles remain | ☐ |

## §10 — F10 Failure surface (one of each code)

| # | Trigger | Expected code + UI |
|---|---|---|
| 10.1 | Cross-room GENERATED ref (devtools POST) | 404 NOT_FOUND + "We couldn't find that." + "Go back" |
| 10.2 | POST `/references` with `externalUrl: "not-a-url"` | 400 VALIDATION_FAILED + field error + "Check the highlighted fields" |
| 10.3 | Duplicate project name | 409 CONFLICT + "Refresh and retry" |
| 10.4 | Rate limit (rapid 6× Generate) | 429 RATE_LIMITED + `Retry-After: <s>` header + "Wait a moment" |
| 10.5 | Visit `/projects/nonexistent` | 404 + role="alert" + traceId |

## §11 — F11 Polish smoke

| # | Action | Expected |
|---|---|---|
| 11.1 | Tab through any page | Forest-green ring on every focusable element |
| 11.2 | OS "Reduce motion" enabled | No skeleton pulse, no hover lift |
| 11.3 | Inspect `<main>` | `id="main-content"` |
| 11.4 | Trigger any error | `<div role="alert">` with traceId |
| 11.5 | Hover image thumbnail | Subtle scale transition (disabled under reduce-motion) |

## §12 — Replicate Flux 2 Pro generation

Flux 2 Pro is the primary provider in the homelab-public deploy. It's an async
prediction API (~9 s per image). Verified live on 2026-06-21 via Playwright.

### Sequence (observed)

```
POST /api/rooms/:id/generations  →  201  (batch created)
POST replicate /predictions     →  { id, status: "starting" }
GET  replicate /predictions/:id →  status: "processing"
GET  replicate /predictions/:id →  status: "succeeded", output: "https://..."
GET  output URL                  →  image bytes (1.6 MB PNG)
PUT  Supabase /upload           →  200
mark COMPLETED                   →  imageUrl in DB
Frontend polls /batches/:id     →  3 cards with images
```

| # | Action | Expected | Pass |
|---|---|---|---|
| 12.1 | Click "Generate 3 options" | Cards show spinner SVG + "Generating" label (PENDING/PROCESSING) | ☑ (verified via Playwright — all 3 cards have `svg.animate-spin` + `aria-busy="true"`) |
| 12.2 | Wait ~30 s | All 3 cards flip to COMPLETED with Flux 2 Pro images | ☑ (verified via Playwright — 3 images loaded via `/api/images/generations/...`) |
| 12.3 | Check backend log | `replicate download complete, predictionId=..., bytes=1,639,548, contentType=image/png, provider=replicate` | ☑ (verified via `docker compose logs interior-api`) |
| 12.4 | Open generation detail | Full-resolution image visible | ☐ |
| 12.5 | Approve one option | Room status flips to APPROVED, green ribbon on card | ☐ |
| 12.6 | Generate again (re-trigger) | New batch uses same Replicate provider | ☐ |
| 12.7 | Force fallback by setting `AI_PROVIDER=ai-horde` | If Horde 429s, fallback to Pollinations | ☐ |
| 12.8 | Verify AI Horde 429 retry | Backend log shows "AI Horde poll rate-limited; backing off" → retry after `Retry-After` → completes | ☐ |
| 12.9 | Console errors during entire flow | 0 errors | ☑ (verified via Playwright) |
| 12.10 | `← Room` back link | Navigates to room detail page | ☑ (verified via Playwright click) |
