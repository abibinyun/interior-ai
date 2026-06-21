# AI Interior Design Journey Builder

A guided, multi-room interior design planning platform — not a generic image generator. Walks a homeowner from *"I have no idea what my house should look like"* to *"complete, coherent, downloadable design plan"* via a 9-step journey with server-computed cross-room consistency.

Submission for the **Software Engineer Assignment** from **Actual Inc (Indonesia)**. See [`docs/Assessment Brief.md`](docs/Assessment%20Brief.md) and [`prompt.md`](prompt.md).

---

## What ships

- **Niche interior-design journey**: 9-step flow (Project → Style → Room → Brief → Generate → Refine → Approve → loop other rooms → Export).
- **Two real AI providers** behind an `AiProviderAdapter` interface (Pollinations primary, Myceli.ai fallback) — server-side calls only; the browser never sees an AI URL.
- **Server-computed consistency anchor** (CA-01…CA-05, ADR-011): when a room is approved, the next room's prompt inherits the project's style + the approved room's design language.
- **Three reference source types** per room: `GENERATED` (point at a saved generation), `EXTERNAL_URL` (paste a link), `UPLOADED` (multipart with client + server MIME/size validation).
- **Versioned ZIP export bundle** with deterministic manifest schema (ADR-010, ADR-015).
- **Full failure surface** — 13 `ErrorCode`s mapped to friendly titles + per-code recovery hints + 401 auto-redirect on session expiry.
- **Production-ready multi-stage Docker image** with nginx SPA fallback + 1y immutable asset caching + no-cache on `index.html`.

---

## Tech stack

| Layer | Choice | Why (see `docs/10-decisions.md` for ADRs) |
|---|---|---|
| Frontend | Vite + React 18 + TypeScript (strict) + TanStack Query v5 + React Router v6 + Tailwind CSS | ADR-006, ADR-007 |
| Backend | NestJS 10 modular monolith + Prisma 5 + PostgreSQL 16 | ADR-001, ADR-003 |
| AI providers | `PollinationsAdapter`, `MyceliAdapter` (behind `AiProviderAdapter`) | ADR-002 |
| Storage | Supabase Storage (one bucket per env) | ADR-004, ADR-012 |
| Identity | Anonymous `sid` httpOnly cookie sessions, CSRF via SameSite=Lax | ADR-007 |
| Infra | Docker Compose with `dev` and `prod` profiles; nginx:1.27-alpine for the production SPA | ADR-015 |

---

## Repository layout

```
.
├── apps/
│   ├── backend/              # NestJS API (M1–M18 all committed)
│   │   └── src/
│   │       ├── ai/           # AiProviderAdapter + PollinationsAdapter + MyceliAdapter
│   │       ├── common/       # error envelope, filters, middleware, sanitize
│   │       ├── exports/      # ZIP bundle assembly + signed download URLs (M14)
│   │       ├── generations/  # batch creation + pipeline + refinement + lineage (M8–M10)
│   │       ├── prisma/       # PrismaService + BaseRepository + session-scope
│   │       ├── projects/     # CRUD + complete/reopen lifecycle (M4)
│   │       ├── references/   # 3 source types (GENERATED/URL/UPLOADED) (M13)
│   │       ├── rooms/        # rooms + design briefs (M5)
│   │       ├── sessions/     # sid cookie + SessionGuard (M3)
│   │       ├── storage/      # StorageAdapter + Supabase impl (M7)
│   │       └── style-profiles/, styles/, health/, config/  …
│   └── frontend/             # Vite + React (F1–F12 all committed)
│       └── src/
│           ├── components/   # 20+ components incl. StyleAnchorBanner, ProjectCompletionCard, AddReferenceModal …
│           ├── routes/       # 14 routes incl. BundlePreviewPage at /exports/:bundleId
│           ├── hooks/        # useReferences, useExports, useProjectLifecycle, useUploadReferenceWithProgress …
│           ├── lib/          # apiFetch + ApiError + recoveryHints + sessionRecovery + format + upload-limits
│           └── styles/       # globals.css with focus rings + prefers-reduced-motion
├── packages/
│   └── shared/               # Cross-cutting types (placeholder)
├── infra/
│   └── docker/
│       ├── backend/          # Dockerfile + Dockerfile.dev
│       ├── frontend/         # Multi-stage Dockerfile + Dockerfile.dev + nginx.conf
│       └── postgres/init/     # pgcrypto bootstrap
├── docs/                     # 11 authoritative docs (00–10) + Assessment Brief
├── prisma/                   # schema.prisma + migrations
├── docker-compose.yml        # dev + prod profiles
└── .env.example
```

---

## Prerequisites

- Node.js 20+
- Docker + Docker Compose v2

---

## Documentation

- `docs/01–10` — authoritative design docs (10 files: 01-product-brief, 02-architecture, 03-frontend-roadmap, …, 10-deployment). The design docs win over the code; if they disagree, the docs are right and the code is wrong.
- `docs/MANUAL_TEST_CASES.md` — manual reproduction recipes for every user-reported bug (style 404, polling 429, signed-URL path, etc.) with the captured network-panel sequence.
- `docs/09-review-log.md` — audit trail of every review checkpoint (one entry per round).

## Configuration

All knobs live in `.env` (gitignored). `.env.example` is the documented template.

### AI provider (selectable per environment)

`AI_PROVIDER` chooses the primary adapter; the others are still registered and used as the AI-07 fallback when the primary fails with a transient error (timeout, 5xx, or 402/429):

| `AI_PROVIDER` | Endpoint shape | Notes |
|---|---|---|
| `replicate` (recommended) | `POST {base}/v1/models/{model}/predictions` → poll `/v1/predictions/{id}` — async, ~9 s | **Flux 2 Pro**. $10 free credits on signup. No hard rate limit. Register at https://replicate.com/signin |
| `pollinations` | `GET {base}/image/{prompt}?{...}` — sync, ~5–30 s | Free tier; can return `402` after burst traffic |
| `ai-horde` | `POST {base}/v2/generate/async` → poll `/v2/generate/status/{id}` — async, ~30–90 s | Free crowdsourced model; register at https://stablehorde.net/register. Retries on 429 during polling. |
| `myceli` | `POST {base}/v1/generate` — sync | Requires `AI_FALLBACK_API_KEY` |

The provider chain at submission (live deploy): **Replicate → Pollinations → AI Horde → Myceli**.

The orchestrator's `shouldFallback` triggers a single fallback attempt when:
- `PROVIDER_TIMEOUT` or `PROVIDER_BROKEN` (5xx, network)
- `PROVIDER_REJECTED` with `statusCode === 402` (Payment Required — primary account is out of credits)
- `PROVIDER_REJECTED` with `statusCode === 429` (provider-side rate limit)

Other 4xx codes (400 bad prompt, 401 missing key, 403 forbidden, 404 model not found) are treated as permanent and do NOT trigger fallback.

### Rate limit (tunable)

| Variable | Default | Notes |
|---|---|---|
| `RATE_LIMIT_GENERATIONS_MAX` | `5` | Per-window request count. Schema enforces `>= 3` (POST + refetch + poll cycle). |
| `RATE_LIMIT_GENERATIONS_WINDOW_MS` | `60000` | Window length in ms. Schema enforces `>= 1000` (1 s floor). |
| `RATE_LIMIT_DISABLED` | `false` | Set to `true` to bypass the limiter entirely (tests, benchmarks). |

The active config is logged at boot: `generations limiter: max=N per Nms (~Ns window)`. The frontend also reads `RateLimit-Limit / RateLimit-Remaining / RateLimit-Reset` from every response and self-paces polling — at `remaining <= 1`, polling slows from 2 s → 8 s before the next request would 429.

### `docker compose restart` does NOT re-read `.env`

To pick up new env values, use `docker compose up -d <service>` (recreates the container). The env block in `docker-compose.yml` interpolates `${VAR:-<default>}` at compose time.

## Quick start (dev mode — hot reload)

```bash
# 1. Copy env template (defaults are fine for local dev)
cp .env.example .env

# 2. Bring up postgres + backend (with watch reload) + frontend (Vite dev server)
docker compose --profile dev up --build

# 3. Verifycurl http://localhost:3000/api/health/live
# {"status":"ok","version":"0.1.0",...}

open http://localhost:5173/
```

## Quick start (prod mode — multi-stage build)

```bash
docker compose --profile prod up --build
# - postgres + migrate + backend + frontend-prod (nginx serving the SPA bundle)
# - SPA at http://localhost:5173
# - /api/* proxied by nginx to the backend
# - CORS is a non-issue: SPA and API share an origin
```

---

## Documentation

| File | Purpose |
|---|---|
| [`docs/00-product-vision.md`](docs/00-product-vision.md) | Product definition, scope, success criteria |
| [`docs/01-user-journey.md`](docs/01-user-journey.md) | The 9-step journey (create project → export bundle) |
| [`docs/02-domain-model.md`](docs/02-domain-model.md) | Entities, attributes, lifecycles |
| [`docs/03-business-rules.md`](docs/03-business-rules.md) | Invariants and policies (S-, P-, ST-, R-, B-, G-, CA-, A-, PC-, E-, AI-, SG-, C-, F-) |
| [`docs/04-system-architecture.md`](docs/04-system-architecture.md) | System structure |
| [`docs/05-api-contract.md`](docs/05-api-contract.md) | HTTP API contract (every endpoint + error envelope) |
| [`docs/06-database-design.md`](docs/06-database-design.md) | Postgres + Prisma schema |
| [`docs/07-backend-roadmap.md`](docs/07-backend-roadmap.md) | 18-milestone backend plan |
| [`docs/08-frontend-roadmap.md`](docs/08-frontend-roadmap.md) | 12-milestone frontend plan |
| [`docs/09-review-log.md`](docs/09-review-log.md) | Review checkpoints and decisions |
| [`docs/10-decisions.md`](docs/10-decisions.md) | Architecture Decision Records (ADRs, append-only) |
| [`docs/Assessment Brief.md`](docs/Assessment%20Brief.md) | The original assignment brief (preserved for context) |
| [`AGENT.md`](AGENT.md) | Authoritative rulebook for any AI/human working on this codebase |
| [`prompt.md`](prompt.md) | The master prompt that bootstrapped the project (untracked) |

---

## Architecture philosophy

```
Browser (React SPA)
      ↓ HTTPS
nginx (in prod) / Vite dev server (in dev)
      ↓
NestJS Backend (single source of truth)
      ↓
AI Provider Layer (Pollinations | Myceli)
      ↓
Storage Layer (Supabase Storage)
      ↓
PostgreSQL 16
```

- **Backend is the single source of truth.** All state, prompts, validation, and rules live in the backend.
- **Frontend is a consumer only.** No business logic in UI; never talks to AI / storage directly.
- **External services behind interfaces.** `AiProviderAdapter` and `StorageAdapter` mean provider swaps don't touch business logic.

---

## Engineering rules (encoded in `AGENT.md`)

- **Backend first** — every backend module implemented + verified before frontend consumes it.
- **Local first** — everything runs through Docker Compose.
- **Vertical slices** — each milestone ships a working slice through all layers.
- **Stop and review** — every milestone pauses for explicit approval before the next starts.
- **One milestone = one commit** (no batching unless asked).
- **Never commit without explicit approval.**
- **No secrets in git** — `.env` is gitignored; `.env.example` carries sanitized placeholders.

---

## Demo path (what the Loom / live verification should walk through)

A reviewer should be able to follow this exact sequence to exercise every surface:

1. **Land** on `/` → see the landing page with three "feature" cards. Press **Tab** → skip-to-content link appears.
2. **Click "Start a project"** → enter `"My Dream House"` → lands on the project dashboard.
3. **Click "Pick a style →"** → pick **Japandi** → save.
4. **Click "Manage (0)"** → add a **Living Room** → lands on the room detail page.
5. **Write the brief** in at least one field (e.g. `"family relaxation"`) → save.
6. **Click "Generate 3 options"** → wait 10–30 s → 3 options appear.
7. **Click "Refine"** on one option → tweak "colors" + "lighting" → submit → new batch appears with `parentGenerationId` linked (visible in `<LineageTree>` on the detail page).
8. **Click "Approve"** on a generation → status pill flips to **APPROVED**, room header updates.
9. **Go back to project** → click **Manage → Add room** → add **Kitchen** → write brief → generate.
10. **Observe the consistency anchor** at the top of the Kitchen room detail page — it should reference the Living Room's approved prompt snippet (per CA-04).
11. **Approve** the Kitchen → go back to project dashboard.
12. **Click "Mark house complete"** → click "Open exports →" → click "Create first bundle" → click "Preview →" → confirm the manifest + click the download link.
13. **Test failure paths**: in the kitchen room, click "+ Add reference" → switch to "Upload an image" tab → try to select a 12 MB file → confirm the friendly client-side error blocks it before any backend call.

---

## Tests

```bash
# All workspaces
npm run typecheck       # 0 errors
npm run lint            # 0 errors / 0 warnings
npm run test            # 144 FE tests + 220 BE tests pass

# Frontend only (Vitest)
cd apps/frontend && npm run test

# Backend only (Vitest, requires Postgres on 127.0.0.1:5432)
cd apps/backend && npm run test
```

Test discipline:
- SWC plugin (`unplugin-swc`) with `legacyDecorator: true` + `decoratorMetadata: true` is mandatory — without it, NestJS DI silently breaks.
- Cross-session isolation is asserted on every mutating endpoint (expected: `404 NOT_FOUND` for cross-session reads/writes).
- Every backend `CHECK` constraint is exercised by a "should-fail" test.

---

## Known shortcomings (recorded)

| Area | Limitation | Status |
|---|---|---|
| AI provider 402 | Pollinations returns `402` after burst traffic | Fixed — `PROVIDER_REJECTED` with 402/429 triggers AI-07 fallback to the other sync provider |
| AI provider 429 | Horde returns `429` during polling | Fixed — adapter now reads `Retry-After` and backs off (same pattern as frontend rate-limit self-pacing) |
| `/api/health/ready` flake | Returns 503 intermittently (Pollinations `healthcheck()` hits a real endpoint) | Documented in F2 review log; non-blocking; production cooldown makes it rare |
| Backend Dockerfile in prod | Uses `Dockerfile.dev` (with watch + bind mount) | Fixed — multi-stage prod image in `infra/docker/backend/Dockerfile` |
| Mobile layouts (<640px) | Not validated (F11 spec defers this) | Deferred per spec |
| Lighthouse a11y ≥ 90 | Not measured in CI | Deferred |
| Demo recording (Loom) | Not yet produced | Walk through the "Demo path" section above |
| Live URL | Was hosted on private home server | Fixed — `https://interior.cube.my.id` is live via homelab-public (Traefik + cloudflared) |
| Provider reliability | Single-provider dependency | Fixed — 4 providers with automatic fallback chain: Replicate → Pollinations → Horde → Myceli |

---

## Repository hygiene

- `node_modules/`, `dist/`, `.env` are gitignored.
- `AGENT.md` is the authoritative rulebook — read it before making any change.
- All commit messages follow `<scope>(<area>): <description>` with a body listing scope, verification, and bugs/lessons recorded during the milestone.
- One milestone = one commit (per R-W5). Never batch milestones.
