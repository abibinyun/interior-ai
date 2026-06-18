# Review Log — AI Interior Design Journey Builder

## Purpose

This document records **human review checkpoints** across the project lifecycle. Every implementation milestone in `07-backend-roadmap.md` and `08-frontend-roadmap.md` ends with a review entry here before the next milestone begins.

Each entry must capture:

- The milestone reviewed.
- The reviewer.
- The decision (Approved / Approved with notes / Rejected).
- The notes or requested changes.

This log is the audit trail that lets future sessions (or future humans) reconstruct what was decided and why.

---

## 1. Review Format

Each entry follows this template:

```text
### [DATE] [MILESTONE]
- Reviewer: <name or role>
- Decision: Approved | Approved with notes | Rejected
- Scope reviewed: <commit hash / branch / files>
- Notes:
  - <bullet>
  - <bullet>
- Action items (if any):
  - <bullet>
```

---

## 2. Reviews

### 2026-06-18 — M6 AI Provider Adapter

- Reviewer: Project Owner (self)
- Decision: **Approved**
- Scope reviewed: `apps/backend/src/ai/`
- Notes:
  - `AiProviderAdapter` interface with `GenerationRequest` / `GenerationResult` / `ProviderError`.
  - `PollinationsAdapter` — GET request to `${base}/image/{prompt}` with width/height/seed/negative query params.
  - `MyceliAdapter` — POST request to `${base}/v1/generate` with JSON body.
  - Both use an injectable `HttpFetcher` (default: native `fetch`) — unit tests pass a fake.
  - Both enforce `GENERATION_HARD_TIMEOUT_MS` via `AbortController`.
  - Both map provider errors to stable `ProviderError.code` enum: 4xx → `PROVIDER_REJECTED`, 5xx → `PROVIDER_BROKEN`, abort → `PROVIDER_TIMEOUT`, other network → `PROVIDER_BROKEN`.
  - `AiModule` exposes `AI_PROVIDER_ADAPTER` symbol; selection via `AI_PROVIDER` env (`pollinations` | `myceli`).
  - 15 unit tests (9 Pollinations, 6 Myceli) using fake HTTP fetcher.
  - No controller endpoint (per scope) — adapter is consumed by M8/M9.
- Action items:
  - M7 (Storage Adapter) will provide the upload target.
  - M8 (Generations Core) will consume `AI_PROVIDER_ADAPTER`.

---

### 2026-06-18 — M5 Rooms + Briefs

- Reviewer: Project Owner (self)
- Decision: **Approved**
- Scope reviewed: `apps/backend/src/rooms/`, `apps/backend/test/rooms.e2e-spec.ts`, updates to `apps/backend/src/projects/projects.controller.ts` and `apps/backend/src/app.module.ts`
- Notes:
  - `RoomsController` exposes `GET /api/rooms/:roomId` and `PUT /api/rooms/:roomId/brief`.
  - `ProjectsController` adds `GET /api/projects/:projectId/rooms` and `POST /api/projects/:projectId/rooms` (nested).
  - DTOs enforce R-02 (roomType enum), B-01 (length caps: purpose 1000, occupants 500, lighting 500, furniture 1000, constraints 1000).
  - Service enforces R-01 (belongs to one project), R-03 (unique roomType per project → 409), R-04 (1:1 brief, created empty), B-02 (editable before approval), B-03 (editing APPROVED brief → IN_REVIEW, clears `approvedGenerationId`).
  - Cross-session access returns 404 (S-05).
  - 14 e2e tests cover: CRUD, R-02/R-03, brief CRUD, B-01 length validation, B-03 transition, cross-session denial.
  - Room creation blocked in COMPLETED projects.
- Action items:
  - M6 (AI Provider Adapter) will introduce generation pipeline triggered from rooms.

---

### 2026-06-18 — M4 Project + Style

- Reviewer: Project Owner (self)
- Decision: **Approved**
- Scope reviewed: `apps/backend/src/styles/`, `apps/backend/src/projects/`, `apps/backend/src/style-profiles/`, `apps/backend/test/projects.e2e-spec.ts`
- Notes:
  - `GET /api/styles` returns hardcoded catalog (8 styles) without session guard.
  - `ProjectsController` exposes CRUD + lifecycle (`complete` / `reopen`) + style profile endpoints, all guarded by `SessionGuard`.
  - DTOs enforce P-02 (name 1–80 chars, trimmed), P-03 (description ≤ 1000 chars), ST-02 (styleKey must be in catalog).
  - Service enforces P-04 (unique name per session → 409), P-05 (reopen only from COMPLETED), and complete-requires-all-rooms-approved.
  - Cross-session access returns 404 (hides existence per S-05).
  - 20 e2e tests cover: catalog, CRUD, validation, duplicates, cross-session denial, lifecycle, style profile (ST-01..ST-03), cross-session style denial.
  - `styleKey` validation is done in the service layer against the catalog, not via class-validator enum (catalog is data, not a TS enum).
- Action items:
  - M5 (Rooms + Briefs) will add `RoomsController` and `DesignBriefsController`.

---

### 2026-06-18 — M3 Session

- Reviewer: Project Owner (self)
- Decision: **Approved with notes**
- Scope reviewed: `apps/backend/src/sessions/session.context.ts`, `session.guard.ts`, `sessions.module.ts`, `apps/backend/src/prisma/base.repository.ts`, `apps/backend/test/session-guard.e2e-spec.ts`
- Notes:
  - SessionGuard resolves the `sid` cookie, loads the session row, and populates the request-scoped `SessionContext`.
  - `BaseRepository.forSession()` now reads from `SessionContext` (no parameter threading).
  - **Design decision**: Guard is applied per-controller via `@UseGuards(SessionGuard)` rather than globally via `APP_GUARD`. Reason: the `useFactory`/`useClass` global-guard approaches had DI issues with the request-scoped `SessionContext` in the vitest/SWC test environment. Per-controller application is simpler, more explicit, and works reliably.
  - Public routes (health, session creation) simply do not apply the guard.
  - 8 e2e tests added covering: no cookie → 401, empty cookie → 401, unknown session id → 200 (session created), valid cookie → 200, session reuse, public routes.
  - The "unknown session id" test expects 200 (not 401) because the guard's `issueOrRefresh` is designed to create sessions for unknown ids (session recovery). This is intentional per rule S-02.
- Action items:
  - M4 (Projects) will apply `@UseGuards(SessionGuard)` to `ProjectsController`.
  - Consider a global guard in a future milestone if more controllers accumulate and the per-controller approach becomes verbose.

---

### 2026-06-17 — Documentation Set v1

- Reviewer: Project Owner (self)
- Decision: **Approved with notes**
- Scope reviewed: `docs/00–10` (initial set), `prompt.md`.
- Notes:
  - Master prompt in `/prompt.md` established the Journey Builder product definition, scope, stack, and engineering rules.
  - The full documentation set was authored from scratch against this definition; no prior docs are referenced.
- Action items:
  - Resolve the placeholder ADR in `06-database-design.md §6` (denormalized `session_id`) into a real ADR before M2.

---

## 3. Decisions

All open questions from the v1 documentation set have been resolved. Each decision is recorded here for the audit trail; the underlying rationale and tradeoffs are captured as ADRs in `10-decisions.md`.

### Q1 — Primary AI Provider

- **Decision**: Pollinations is the primary AI provider. Myceli.ai is the fallback adapter.
- **Status**: Approved → see ADR-002.
- **Rationale**: Faster MVP delivery, simpler integration. Provider abstraction enables future swaps without business-logic changes.

### Q2 — Export Bundle Format

- **Decision**: Export is a ZIP bundle.
- **Contents**: `approved-images/`, `references/`, `project-summary.json`, `style-profile.json`, `prompts/`, `room-notes/`.
- **Status**: Approved → see ADR-010.
- **Future**: PDF export may be added in v2.

### Q3 — Consistency Anchor Strategy

- **Decision**: Anchor = Style Profile + Approved Prompts.
- **Out of Scope (v1)**: Image embeddings, vector similarity engine.
- **Status**: Approved → see ADR-011.
- **Future**: Image embeddings may be introduced in v2.

### Q4 — Style Change After Approvals

- **Decision**: Allow style changes with an explicit warning.
- **Warning**: "Changing project style will NOT retroactively modify approved rooms. Only future generations and rooms will use the new style profile."
- **Status**: Approved → reflected in `03-business-rules.md` ST-04.

### Q5 — Uploaded References

- **Decision**: `UPLOADED` reference source is **included in v1**.
- **Supported sources**: `GENERATED`, `EXTERNAL_URL`, `UPLOADED`.
- **Status**: Approved → propagated to `02-domain-model.md`, `05-api-contract.md`, `06-database-design.md`, `08-frontend-roadmap.md`, and `07-backend-roadmap.md` (M13).
- **Rationale**: Most users already have inspiration images from Pinterest, Instagram, screenshots, or existing houses. Without uploads, the planning workflow is significantly weaker.

### Q6 — Storage Bucket Strategy

- **Decision**: One bucket per environment.
- **Examples**: `interior-dev`, `interior-staging`, `interior-prod`.
- **Status**: Approved → see ADR-012.

### Q7 — Frontend Styling

- **Decision**: Tailwind CSS.
- **Status**: Approved → reflected in `04-system-architecture.md` and `08-frontend-roadmap.md` (F1).

### ADR-001 — Application Architecture

- **Decision**: NestJS Modular Monolith.
- **Modules**: `projects`, `style-profiles`, `rooms`, `generations`, `references`, `exports`, `ai-provider`, `storage`.
- **Status**: Approved.

### ADR-005 — Defensive `session_id` Denormalization

- **Decision**: Include defensive `session_id` columns on `rooms`, `generations`, `references`, `export_bundles`. Maintained via DB triggers or Prisma middleware.
- **Status**: Approved (propagated to `06-database-design.md §6`).

---

## 4. Open Questions

All v1 open questions are resolved. New questions raised during implementation will be added here.

---

## 5. References

- Product vision: `00-product-vision.md`
- System architecture: `04-system-architecture.md`
- Backend roadmap: `07-backend-roadmap.md`
- Frontend roadmap: `08-frontend-roadmap.md`
- Decisions: `10-decisions.md`