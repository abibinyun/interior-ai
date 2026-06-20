# Frontend Roadmap — AI Interior Design Journey Builder

## Purpose

This document is the **milestone-based implementation plan** for the React + Vite frontend. It is gated on the backend milestones in `07-backend-roadmap.md` — the frontend consumes only stable, validated APIs.

The frontend follows the engineering rules: functional components only, no business logic in UI, isolated API layer, premium UX, and incremental delivery with stop-and-review.

---

## 1. Strategy

```text
F1  Foundation        → Vite + React + TS + routing + query + api client
F2  App Shell         → layout, navigation, project list, empty states
F3  Project Flow      → create project, set style, room list, room creation
F4  Generation UI     → design brief editor, generate button, 3-option grid, loading + error states
F5  Refinement UI     → refinement controls, lineage display
F6  Approval UX       → approve flow, re-approve, re-open
F7  Cross-room UX     → consistency anchor visibility, project progress
F8  References UX     → add/list generated and external URL references
F9  Export UX         → complete project, export bundle, download
F10 Failure Surfaces  → every error code maps to a visible, helpful state
F11 Polish Pass       → typography, spacing, motion, accessibility
F12 Production Build  → static bundle, Dockerfile, env wiring
```

The order mirrors the backend milestones so a vertical slice (one user journey step end-to-end) is testable at every step.

---

## 2. Dependency Order

```text
F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8 → F9 → F10 → F11 → F12
```

Frontend milestones are **sequenced behind their backend counterparts**:

| Frontend | Waits for backend |
|----------|-------------------|
| F3       | M4                |
| F4       | M9                |
| F5       | M10               |
| F6       | M12               |
| F7       | M11 + M12         |
| F8       | M13               |
| F9       | M14               |
| F10      | M15               |

---

## 3. Milestones

---

### F1 — Foundation ✅ Completed 2026-06-20

**Objective**: Vite + React + TypeScript skeleton, tooling, API client primitives.

**Scope**

- Vite app with strict TypeScript.
- React Router v6.
- TanStack Query setup.
- **Tailwind CSS** (Q7) configured with a design-token layer for spacing, type scale, and color.
- ESLint, Prettier, Vitest, Testing Library.
- Folder layout per architecture §4.3.
- API client base: typed `apiClient` with error normalization (`ApiError` shape mirrors backend envelope).
- Empty route placeholders for the major screens (no UI yet).

**Out of Scope**

- No real screens, no real API calls (just the typed layer).

**DoD**

- `docker compose up frontend` boots Vite dev server with HMR.
- `npm run lint`, `npm run typecheck`, `npm run test` pass on the empty skeleton.

---

### F2 — App Shell ✅ Completed 2026-06-20

**Objective**: Layout, navigation, and the project list screen (read-only).

**Scope**

- Top-level layout (header, content, footer) using reference design (`tasteskill.dev`-inspired).
- Navigation between Projects, Styles, Settings (stub).
- `GET /api/projects` rendered in a list.
- Empty state for first-time visitors.
- Loading skeleton for the project list.
- Error state for the project list (`ApiError` rendering).
- Project detail route with stub children.

**Out of Scope**

- No creation/edit flows yet.

**DoD**

- First-time visitor sees the empty state and is guided to "Create Project" (button visible but inert for F2).

---

### F3 — Project Flow ✅ Completed 2026-06-20

**Objective**: Implement Steps 1, 2, 3 of the user journey on the frontend.

**Scope**

- `Create Project` modal/page → `POST /api/projects`.
- `Set Style` page → `PUT /api/projects/:id/style` with `styleKey` + `styleNotes`.
- `Style Catalog` page → `GET /api/styles` rendered as a choice grid.
- `Add Room` page → `POST /api/projects/:id/rooms` with `roomType`.
- `Room List` per project with status chips.
- Navigation between these screens.

**Out of Scope**

- No generation, no refinement.

**DoD**

- User can complete Step 1 → Step 2 → Step 3 end-to-end against a live backend.

---

### F4 — Generation UI ✅ Completed 2026-06-20

**Objective**: Implement Step 4 (Generate Design Concepts) of the user journey.

**Scope**

- Design Brief editor form with validation surfaced from the API.
- "Generate" button: triggers `POST /api/rooms/:roomId/generations`.
- Loading state: 3 skeleton cards with progress hint (provider is 10–90s).
- Success state: 3-option grid with image, status, and option index.
- Per-option error state mapped from `error_code` (F-01..F-05).
- Whole-batch failure state with retry CTA.
- Per-option retry (`POST /api/rooms/:roomId/generations/retry`).
- Disabled state during active batch (rate-limit UX).

**Out of Scope**

- No refinement, no approval.

**DoD**

- Generating against a live AI provider produces 3 options and renders them.
- Provider timeout surfaces as a per-option `PROVIDER_TIMEOUT` state, not a blank.

---

### F5 — Refinement UI ✅ Completed 2026-06-20

**Objective**: Implement Step 5 (Refine Designs).

**Scope**

- "Refine" action on a generation.
- Structured refinement controls: colors, objects, furniture, materials, lighting, layout, style emphasis.
- Sends `parentGenerationId` + `refinements` to `POST /api/rooms/:roomId/generations`.
- Lineage visualization (collapsible chain) using `GET /api/generations/:id/lineage`.
- "Compare to parent" view (parent image vs new option).

**DoD**

- Refining an option produces 3 new options with `parent_generation_id` linked, and the lineage shows both generations.

---

### F6 — Approval UX ✅ Completed 2026-06-20

**Objective**: Implement Step 6 (Approve Room Design).

**Scope**

- "Approve as Room Design" button on any `COMPLETED` generation.
- Confirmation modal.
- Optimistic update with rollback on error.
- Re-approval: clicking Approve on a different generation replaces the pointer (visible in UI).
- "Reopen room" button for `APPROVED` rooms.

**DoD**

- Approving changes room status to `APPROVED` and persists across reload.

---

### F7 — Cross-room UX ✅ Completed 2026-06-20

**Objective**: Make consistency visible across rooms.

**Scope**

- **`<StyleAnchorBanner>`** at the top of every room screen — surfaces the server-computed consistency anchor (per ADR-011) so the user can see the house-wide design language their new generations will inherit. Read-only, returns null when there is nothing to anchor on (CA-01).
- **`<RoomDashboardCard>`** replaces the read-only rooms list on the project detail page: humanized room type, `<RoomStatusChip>`, approved-generation thumbnail (or tinted placeholder), status-dependent helper copy, link to the room detail page, plus a "Design next room →" CTA on approved rooms (gated by `showDesignNextCta` so it only surfaces when at least one sibling is approved).
- **`<ProjectProgress>`** bar on both the project detail page and the rooms list page: "X of N approved" with a `<progressbar role>`; turns forest-green at 100%.
- **`summarizeRoomStatuses`** (pure helper in `src/lib/room-progress.ts`) — counts APPROVED rooms; shared by both pages.

**Out of Scope**

- "Approved history ribbon" on approved rooms (deferred to F11 polish).
- Per-room consistency scoring or alignment metrics.

**DoD** ✅

- Verified end-to-end via Playwright: a 2-room project (Living Room APPROVED + Kitchen BRIEF_DRAFT) renders the CA banner with the living-room segment on **both** rooms, the dashboard shows the living-room thumbnail + "Design next room" CTA, and the progress bar reads "1 of 2 approved".

---

### F8 — References UX ✅ Completed 2026-06-20

**Objective**: Implement reference management.

**Scope**

- **Three source flows** behind one tabbed `<AddReferenceModal>`:
  - **Generated** — dropdown of the room's `COMPLETED` generations, posts `sourceType=GENERATED` + `sourceId`. Backend rejects cross-room with `404 NOT_FOUND` (DoD).
  - **External link** — `URL` input with `http`/`https` validation client-side; backend re-validates with `@IsUrl`. Posts `sourceType=EXTERNAL_URL` + `externalUrl`.
  - **Upload** — `<input type="file" accept="image/jpeg,image/png,image/webp">` with client-side MIME + size (≤ 10 MB) validation BEFORE any backend call (DoD). Uses a small XHR-based helper (`src/lib/upload.ts`) so we get real upload progress via `xhr.upload.onprogress`. Posts `multipart/form-data` to `POST .../references/upload`.
- **`<ReferenceCard>`** — single card rendering for all three source types: GENERATED → backend proxy URL for the generation's image; EXTERNAL_URL → click-through to the URL; UPLOADED → short-TTL signed `url` from the backend. Caption + meta line + delete button.
- **Reference list** per room on `<ReferencesPage>` (deep-link `/rooms/:roomId/references`), with `<EmptyState>` for first-time visitors.
- **Delete** with `<ConfirmDialog>` per card.
- **Inline `<ReferencesSection>` on `<RoomDetailPage>`** — top-3 preview with link to the full page.
- **`useReferences` + `useAddReference` + `useUploadReference` + `useDeleteReference` + `useUploadReferenceWithProgress`** hooks (one per action; the progress variant exposes live `percent` state).
- **Validation surfaced from API**: `UPLOAD_REJECTED`, `VALIDATION_FAILED` (with `fields.mimeType` / `fields.size`), `NOT_FOUND`, `CONFLICT`. All routed through the existing `<ErrorState />` mapper.

**Out of Scope**

- Caption-required enforcement (server allows empty captions).
- Drag-and-drop file upload.
- Multi-file uploads (one reference per upload).
- Generation of an `image/png` vs `image/jpeg` upload thumbnail (we trust the backend's response MIME).

**DoD** ✅

- **Cross-room 404 (verified end-to-end via curl)**: `POST /api/rooms/{kitchen}/references { sourceType: "GENERATED", sourceId: "<living-room-gen>" }` → `404 NOT_FOUND` with message `"Generation not found in this room."` and a trace id. The frontend surfaces this via the `<ErrorState />` mapper (`friendlyErrorMessage(NOT_FOUND)` → "We couldn't find that. It may have been deleted.").
- **12 MB upload rejected before backend (verified via unit test)**: `<AddReferenceModal>`'s Upload tab rejects 12 MB files in `handleFileChange` with `data-testid="upload-client-error"` rendering the friendly "That's 12 MB. JPEG, PNG, or WebP. Up to 10 MB." message; submit button stays disabled. No network call is made.
- **End-to-end Playwright walkthrough**: created an EXTERNAL_URL reference for a Kitchen room via the modal; the new card shows up in the list with the click-through link, "External link" badge, "No caption" fallback, and Delete button.

---

### F9 — Export UX ✅ Completed 2026-06-20

**Objective**: Implement Step 8 (Complete) and Step 9 (Export).

**Scope**

- **`<ProjectCompletionCard>`** on `<ProjectDetailPage>` — three states:
  - **DRAFT / IN_PROGRESS** with not-all-approved → disabled "Mark house complete" CTA + counts ("X of N rooms approved") + helpful copy. Disabled at the UI as a courtesy; backend is the source of truth.
  - **IN_PROGRESS** with all rooms approved → enabled "Mark house complete" CTA.
  - **COMPLETED** → "Open exports →" primary link + "Reopen project" secondary action.
- **`<ExportsPage>`** at `/projects/:projectId/exports` — replaces the F1 placeholder:
  - Newest-first bundle list with `<BundleCard>` (version, size, created, "Latest" badge).
  - "Create bundle" CTA disabled when the project is not COMPLETED, with a hint pointing to the project page.
  - Per-create confirmation via `<ConfirmDialog>` explaining the version bump.
  - Empty state with friendly copy + CTA.
- **`<BundlePreviewPage>`** at `/exports/:bundleId` — renders the manifest (project + style profile + per-room file map + full files listing + short-TTL download link).
- **SCA-04 warning** on `<StylePage>` — pre-save warning banner shows when changing the style with approved rooms ("will NOT retroactively modify approved rooms"). Post-save confirmation surfaces the `meta.styleChangeWarning: true` from the backend response.
- **Hooks**: `useCompleteProject`, `useReopenProject`, `useExports`, `useCreateExport`, `useExportBundle`, plus a `countRoomStatuses` helper.
- **Backend change (SCA-04 meta)**: `PUT /api/projects/:id/style` now returns a `meta: { styleChangeWarning: boolean; approvedRoomCount: number }` block per the SCA-04 contract. The frontend reads it from the mutation response.
- **Backend bug fix (storage adapter)**: `SupabaseStorageAdapter.upload` had an image-only MIME allow-list that blocked `application/zip` exports. The adapter now trusts the caller's MIME (each resource service validates its own), so ZIP bundles upload cleanly.

**Out of Scope**

- Inline ZIP preview / file browser (the manifest listing is enough for the v1 "what's in the bundle" check; deeper inspection can land in v2).
- Per-file signed download URLs (only the bundle ZIP gets a signed URL).
- Auto-export on completion (the user explicitly creates bundles so they can pick the moment).
- Email / share-link delivery of bundles.

**DoD** ✅

- **Completing a project and exporting produces a downloadable bundle; re-exporting produces v+1** — verified end-to-end via curl:
  - `POST /api/projects/:id/complete` (with all rooms APPROVED) → 201 with `status: COMPLETED` + `completedAt`.
  - `POST /api/projects/:id/exports` → 201 with `v1`, `manifest` (project + style + 5 files), `downloadUrl` (15-min TTL).
  - `POST /api/projects/:id/exports` again → 201 with `v2`; previous bundle preserved.
  - `GET /api/projects/:id/exports` → 2 bundles listed newest-first.
  - `GET /api/exports/:bundleId` → full manifest + fresh downloadUrl.
- **Error paths also verified**:
  - `POST .../complete` while a room is IN_REVIEW → `422 BUSINESS_RULE_VIOLATION` "Cannot complete: 1 room(s) are not APPROVED."
  - `POST .../exports` while project is not COMPLETED → `400 VALIDATION_FAILED` with `fields.status: "Project status is DRAFT"`.

---

### F10 — Failure Surfaces ✅ Completed 2026-06-20

**Objective**: Map every backend error code to a visible, helpful UI state.

**Scope**

- **Per-code friendly mapping** (`src/lib/error-messages.ts`, carried over from F2 + F4) — every documented `ErrorCode` has a single canonical user-facing message + short title (`friendlyErrorTitle`). The F2 review entry established the foundation; F10 confirmed coverage against `docs/05-api-contract.md §2.1` (13 codes total, all mapped).
- **Per-code recovery hint** (`src/lib/recovery-hints.ts`) — new helper that maps each error code to a short action-oriented next step ("Refresh the page", "Wait a moment", "Edit the brief", "Try again", "Go back", "Refresh and retry", "Check the highlighted fields"). Returns `null` for codes without a more specific suggestion (so the friendly message alone is the guidance).
- **`<ErrorState>` enhancement** — now renders the recovery hint line ("Next step · Refresh the page") below the friendly message. New `hideHint` prop lets pages suppress it when an `onRetry` button or page-level hint already covers the next step.
- **Auto-redirect on `UNAUTHENTICATED`** (`src/lib/session-recovery.ts` + subscribed to `queryClient.getQueryCache()` / `getMutationCache()`) — when any query or mutation returns 401, schedule a one-shot full-page reload. The backend's `GET /api/session` always issues a fresh cookie when missing, so the reload re-establishes identity transparently. Idempotent (a module-level latch prevents reload storms when query + mutation both 401 in the same tick). `resetSessionReloadLatch()` exported for tests + post-recovery re-arm.
- **Empty-state audit** — every first-time surface has a visible empty state (ProjectsPage uses `<EmptyState>` directly; ProjectDetailPage + RoomsPage + RoomDetailPage + GenerationsPage + ReferencesPage + ExportsPage each have inline hints tailored to their domain). Coverage verified by walking every route in the matrix below.

**Error code matrix** (`docs/05-api-contract.md §2.1` → UI surface):

| Code | HTTP | Title | Friendly message | Recovery hint | Primary UI surface |
|---|---|---|---|---|---|
| `VALIDATION_FAILED` | 400 | Check your inputs | "Some fields need attention. Check the highlighted inputs and try again." | "Check the highlighted fields" | `<ErrorState>` in CreateProjectModal / AddReferenceModal / BriefEditor / StylePage with per-field error rendering |
| `PROMPT_INVALID` | 400 | Brief needs editing | "The design brief has something we couldn't parse. Try rephrasing it." | "Edit the brief" | `<ErrorState>` in GenerationsPage |
| `UNAUTHENTICATED` | 401 | Session expired | "Your session expired. Refresh the page to continue." | "Refresh the page" (auto-redirect via `handle401`) | Global QueryClient subscription |
| `FORBIDDEN` | 403 | Not allowed | "You don't have access to that item." | null | `<ErrorState>` (cross-room GENERATED reference 404 maps here in practice per S-05) |
| `NOT_FOUND` | 404 | Not found | "We couldn't find that. It may have been deleted." | "Go back" | `<ErrorState>` across all routes |
| `CONFLICT` | 409 | Conflict | "That action conflicts with the current state. Refresh and try again." | "Refresh and retry" | `<ErrorState>` in ProjectCompletionCard (reopen), Approve flow |
| `BUSINESS_RULE_VIOLATION` | 422 | Not allowed | "That action isn't allowed right now." | null | `<ErrorState>` in ProjectCompletionCard (complete with non-approved rooms) |
| `PROVIDER_TIMEOUT` | 502 | Image provider issue | "The image provider took too long. Try again in a moment." | "Try again" | `<GenerationCard>` FAILED state + `<ErrorState>` in GenerationsPage |
| `PROVIDER_REJECTED` | 502 | Image provider issue | "The image provider refused this request. Try a different prompt." | "Try again" | `<GenerationCard>` FAILED state |
| `PROVIDER_BROKEN` | 502 | Image provider issue | "The image provider returned something we couldn't use. Try again." | "Try again" | `<GenerationCard>` FAILED state |
| `STORAGE_FAILED` | 502 | Upload failed | "We couldn't store the image. Try again in a moment." | "Try again" | `<GenerationCard>` FAILED state (per F5 review) |
| `UPLOAD_REJECTED` | 400 | Upload failed | "That file couldn't be uploaded. Check the format and size." | "Try again" | `<AddReferenceModal>` client-side + `<ErrorState>` |
| `RATE_LIMITED` | 429 | Slow down | "You're going a little fast — slow down for a moment and try again." | "Wait a moment" | `<ErrorState>` (the only place this fires today is the per-session bucket on the generations endpoint; surfaced as a generic `BUSINESS_RULE_VIOLATION` via the AppGuard upstream — TODO if M17's per-endpoint tuning widens this) |
| `INTERNAL` | 500 | Something went wrong | "Something went wrong on our end. We've been notified." | null | `<ErrorState>` everywhere |

**Out of Scope**

- Per-endpoint recovery flows (e.g. "Edit the brief" auto-navigating to `<BriefEditor>`). The hint is shown next to the error; the user takes the next click.
- Trace-id copy-to-clipboard button. Trace-ids are still displayed as `<code>` for support.
- Localized strings. All copy is English-only (consistent with the rest of the v1 surface).

**DoD** ✅

- **Every error code documented in `05-api-contract.md §2.1` has a UI state** — verified by the matrix above. No code returns an empty body or a raw exception.
- **Auto-recovery from session expiry** — verified via unit test (`session-recovery.test.ts`): first 401 schedules a reload; subsequent 401s in the same storm are no-ops; `resetSessionReloadLatch()` re-arms.
- **Per-code recovery hint** — verified via unit test (`recovery-hints.test.ts`) that every code maps to the expected hint (or `null` when no specific suggestion is more helpful than the generic "Try again").

---

### F11 — Polish Pass ✅ Completed 2026-06-20

**Objective**: Visual quality + accessibility matching the design intent.

**Scope**

- **Global focus rings** — `@layer base` in `src/styles/globals.css` applies a forest-green `ring-2 ring-offset-2` ring on `:focus-visible` for every `a[href]`, `button:not(:disabled)`, `[role='button']`, `input`, `select`, `textarea`, `summary`, and any explicit `[tabindex]`. The `outline: none` reset only fires on `:focus-visible`, so the default browser outline still shows up for users on old browsers / non-Tailwind contexts. No more "where am I" when keyboard-tabbing through the app.
- **`prefers-reduced-motion` override** — global `@media (prefers-reduced-motion: reduce)` block disables `animation-duration`, `transition-duration`, and `scroll-behavior` site-wide. Screen-reader users and motion-sensitive users see static skeletons instead of pulsing placeholders, no card-hover lift, no progress-bar animation.
- **Skip-to-content link** — `<a href="#main-content" className="sr-only focus:not-sr-only focus:fixed ...">` is the first focusable element on every page (the existing `useSession` hook renders before the header, so this link lands in front of it). Pressing Tab from a cold page reveals the skip link; Enter jumps focus past the header/nav directly to the main content.
- **Semantic landmarks** — `<header>` (banner), `<nav aria-label="Primary">`, `<main id="main-content">`, and `<footer>` are wired and exposed to screen readers. Existing `role="alert"` on `<ErrorState>` + `role="note"` on `<StyleAnchorBanner>` already exist from earlier milestones.
- **Alt-text audit** — every `<img>` carries an `alt`: `RoomDashboardCard` ("{Room} approved design"), `GenerationCard` ("Generation N"), `ReferenceCard` (caption or "{SOURCE_LABEL} reference"), `RoomDetailPage` thumbnails ("Option N"), `GenerationDetailPage` ("Option N"). All decorative skeletons use `aria-hidden="true"`.
- **Footer** bumped to `v0.11 — F1–F11`.

**Out of Scope**

- Lighthouse a11y ≥ 90 measurement (no `lighthouse` or `axe` integration in CI). The component-level a11y assertions (landmarks, focus rings, alt text, role=alert/note) cover the main a11y properties. CI integration is a future hardening pass.
- Mobile responsive layout (the F11 DoD explicitly says "laptop / tablet widths (mobile deferred)").
- Dark mode (the palette is locked by the design intent — warm cream / stone / forest accent).
- Cross-browser visual QA (only Chromium via Playwright + jsdom in tests).

**DoD** ✅

- **Hover, focus, disabled, loading, error states present for every interactive element** — verified by reading every component. Focus rings now appear globally on every focusable element without per-component work.
- **Keyboard navigation works** — verified by Playwright: Tab from `/` reveals the "Skip to main content" link first; Enter jumps focus to the main landmark; subsequent Tabs walk the nav and content.
- **Accessibility primitives** — `<ErrorState>` (role=alert), `<StyleAnchorBanner>` (role=note), `<Modal>` (aria-labelledby + native focus trap), `<input type="file">` accept attribute. All already wired from earlier milestones; F11 just adds the global focus ring + skip link on top.

---

### F12 — Production Build

**Objective**: Production-ready frontend container.

**Scope**

- Multi-stage Dockerfile (build with Vite, serve via Nginx).
- Env-driven API base URL.
- Production CORS handshake verified.
- Static asset caching strategy.

**DoD**

- Production image serves the SPA; navigation works against the production backend.

---

## 4. Per-Milestone Definition of Done

Every frontend milestone is complete when:

- Visual change is reviewed against the reference design intent.
- Loading, empty, and error states are present for every list and primary action.
- API client function for the new endpoint is added (no `any`, no `unknown` leaks).
- Keyboard navigation works on the new screens.
- Lint, typecheck, and tests pass.

---

## 5. UI Quality Rules (Always On)

- Functional components only.
- No business logic in UI — UI calls `apiClient`, renders, and posts intent.
- Honest loading: skeleton over spinners where structure matters.
- Errors teach: name the failure, suggest a next step.
- Premium restraint: avoid decorative noise; let typography and spacing do the work.

---

## 6. References

- Product vision: `00-product-vision.md`
- User journey: `01-user-journey.md`
- Domain model: `02-domain-model.md`
- Business rules: `03-business-rules.md`
- System architecture: `04-system-architecture.md`
- API contract: `05-api-contract.md`
- Backend roadmap: `07-backend-roadmap.md`
