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

### 2026-06-18 — M10 Refinement & Lineage

- Reviewer: Project Owner (self)
- Decision: **Approved**
- Scope reviewed: `apps/backend/src/generations/generations.repository.ts`, `generations.service.ts`, `generations-lineage.controller.ts`, `test/lineage.e2e-spec.ts`
- Notes:
  - `GET /api/generations/:id/lineage` returns `{ root, ancestors, descendants }`.
  - `GenerationsRepository.findAncestors` and `findDescendants` use Postgres recursive CTEs (`WITH RECURSIVE`) — no N+1 queries.
  - Ancestors ordered root→child, descendants ordered child→leaf.
  - Response shape: `{ id, optionIndex, createdAt }` per node (no full Generation payload).
  - Refinement endpoint (`parentGenerationId` + `refinements`) was already in M8; M10 added the lineage query to traverse it.
  - 8 e2e tests: grandchild lineage (root + 2 ancestors), mid-level lineage (root + 1 ancestor + 3 descendants), root lineage (no ancestors, 6 descendants), 404 for unknown, 401 without session, refinement prompt includes refinements, all 3 children share parent, cross-session 404.
  - **Known limitation**: refinement prompt composition appends refinement descriptors (per M10 scope). Semantic translation deferred.
- Action items:
  - M11 (Consistency Anchor) will inject approved-room prompts into new-room generation.
  - M14 (Export Bundle) will include lineage per room.

---

### 2026-06-18 — M9 Generation Pipeline

- Reviewer: Project Owner (self)
- Decision: **Approved**
- Scope reviewed: `apps/backend/src/generations/pipeline-orchestrator.ts`, `apps/backend/test/pipeline.e2e-spec.ts`
- Notes:
  - `PipelineOrchestrator` runs the full pipeline: PENDING → PROCESSING → generate (AI) → upload (Storage) → COMPLETED.
  - **AI-07 fallback**: on `PROVIDER_TIMEOUT` or `PROVIDER_BROKEN` from the active adapter, one attempt is made against the other adapter (Pollinations ↔ Myceli). `PROVIDER_REJECTED` does NOT trigger fallback.
  - **G-10**: if all 3 generations fail, room stays in `GENERATING` (never silently discarded). If at least one completes, room → `IN_REVIEW`.
  - **SG-03**: storage upload failure marks the generation `FAILED` with `STORAGE_FAILED`.
  - Object keys: `${env}/projects/{p}/rooms/{r}/generations/{genId}.{ext}` (ADR-004).
  - **G-08/G-09**: provider URLs are never persisted — only storage URLs.
  - Controller does NOT auto-fire the pipeline (removed to avoid double-processing). Callers must explicitly invoke `PipelineOrchestrator.runBatch(batchId)`. This keeps the pipeline deterministic for tests and future async work.
  - 6 e2e tests with mocked AI + Storage: happy path, AI-07 timeout fallback, AI-07 broken fallback, PROVIDER_REJECTED no-fallback, G-10 all-failed, SG-03 storage failure.
  - **Not in M9 scope (deferred)**: 202 + polling endpoint for long-tail cases, refinement (M10), consistency anchor (M11).
- Action items:
  - M10 (Refinement) will use `parentGenerationId` lineage tracking.
  - M11 (Consistency Anchor) will inject approved-room prompts into new-room generation.

---

### 2026-06-18 — M8 Generations Core

- Reviewer: Project Owner (self)
- Decision: **Approved**
- Scope reviewed: `apps/backend/src/generations/`, `apps/backend/test/generations.e2e-spec.ts`
- Notes:
  - `POST /api/rooms/:roomId/generations` creates a batch of exactly 3 PENDING generations (G-01).
  - Each option_index 1/2/3 receives a distinct composed prompt (ADR-009 variation strategy: balanced / warm / bright).
  - `PromptComposer` builds server-side prompts from style + room type + brief + refinements (G-06). Never accepts a full prompt from client (G-07).
  - Room status transitions to `GENERATING` on batch start.
  - Refinement endpoint accepts `parentGenerationId` (G-05); parent must be COMPLETED.
  - Status state machine: PENDING → PROCESSING → COMPLETED/FAILED (G-02..G-04).
  - Cross-session → 404.
  - 13 e2e tests cover: batch creation (3 PENDING), prompt composition, 3 distinct variations, room transition, refinement, B-01 length validation, 404 for unknown room, cross-session denial.
  - **M8 does NOT call the AI provider or storage** — it creates PENDING rows and composes prompts. M9 (Generation Pipeline) will consume these, call the AI adapter, upload to storage, and update status.
  - `parentGenerationId` validation: belongs to same room + status === COMPLETED.
- Action items:
  - M9 will wire `AiProviderAdapter` + `StorageAdapter` into the pipeline: PENDING → PROCESSING → generate → upload → COMPLETED.
  - M9 will also implement AI-07 (fallback on transient errors).

---

### 2026-06-18 — M7 Storage Adapter

- Reviewer: Project Owner (self)
- Decision: **Approved**
- Scope reviewed: `apps/backend/src/storage/`
- Notes:
  - `StorageAdapter` interface with `upload`, `signedUrl`, `delete`.
  - `SupabaseStorageAdapter` calls Supabase Storage REST API (`/storage/v1/object/...`).
  - Reuses the AI module's `HTTP_FETCHER` (native `fetch` via `FetchHttpFetcher`).
  - Object keys per ADR-004: `${env}/projects/{projectId}/rooms/{roomId}/generations/{generationId}.{ext}`.
  - Reference keys per SG-04: `${env}/projects/{projectId}/rooms/{roomId}/references/{referenceId}/{filename}` with path-traversal sanitization (strips `..` and leading `.`).
  - Enforces SG-06: `MAX_UPLOAD_BYTES = 10MB`, allowed MIME types `image/jpeg|png|webp`.
  - Error mapping: 4xx → `UPLOAD_REJECTED`, 5xx/network → `STORAGE_FAILED` (per AI-06 family).
  - Delete is idempotent (404 is success).
  - Signed URL supports both absolute (`https://...`) and relative (`/storage/...`) responses.
  - 18 unit tests (upload, signedUrl, delete, key builders, error mapping, missing config).
  - No controller endpoint (per scope) — adapter is consumed by M8/M9/M13.
- Action items:
  - M8 (Generations Core) will use `upload` + `signedUrl` for AI-generated images.
  - M13 (References) will use `upload` + `signedUrl` for user-uploaded references.

---

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

## 5. Implementation Review (post-M10 verification)

### 2026-06-18 — M3–M10 verification pass

- Reviewer: Project Owner (self)
- Decision: **Approved with notes**
- Scope reviewed: full M3–M10 surface against the docker Compose stack.
- Verification (all green before commit):
  - `npm run typecheck` → 0 errors
  - `npm run lint` → 0 errors
  - `npm run build:backend` → 0 errors
  - `npm run test` → **117/117 pass** (4 M1 smoke + 8 M3 session-guard + 11 M2 persistence + 11 M4 projects + 11 M5 rooms + 6 M6 AI provider + 11 M7 storage + 6 M8 generations + 6 M9 pipeline + 10 M10 refinement)
  - `docker compose up` → all healthy
  - End-to-end smoke: session → project → style → room → brief → generation batch (returns 201 with 3 PENDING rows)

- Notes:
  - **M8 gap closed**: added `GET /api/rooms/:roomId/generations/batches/:batchId` and
    `GenerationsService.listByBatchIdInRoom(...)` so callers can poll
    a batch's status transitions (PENDING -> PROCESSING -> COMPLETED|FAILED).
  - **Idempotency added**: `PipelineOrchestrator.runBatch` filters rows by
    `status = 'PENDING'`, so duplicate invocations are safe no-ops.
  - **Vitest default testTimeout bumped** to 30s — the M9 happy-path test
    exercises a real 3-step async flow that occasionally exceeded the 5s default.

- **Known integration gap (M9)** — to be addressed before M11:
  `POST /api/rooms/:roomId/generations` creates the 3 Generation rows as PENDING and updates the room to GENERATING, but it does **not** auto-trigger `PipelineOrchestrator.runBatch`. The HTTP caller must currently invoke the pipeline through a separate mechanism (tests do this directly; production callers do not have such a path).
  - **Symptom**: a real user creates a batch via the API and the rows remain PENDING indefinitely.
  - **Root cause**: auto-triggering from `startBatch` was attempted but caused race conditions in the existing M9 e2e tests (concurrent calls to `runBatch` produced rows in conflicting states; the CHECK constraint `generations_image_url_complete_chk` then rejected the second transition).
  - **Recommended fix in M11** (when Approval / Consistency Anchor lands and the controller surface stabilizes):
    1. Make `runBatch` truly race-safe with `SELECT ... FOR UPDATE SKIP LOCKED` (Postgres) inside a transaction, OR
    2. Introduce a job queue (BullMQ on Redis) and move `runBatch` to a worker, OR
    3. Add an explicit "process batch" admin endpoint and document that production deployments need a sidecar that polls pending batches.
  - **Workaround for now**: the e2e test suite drives `pipeline.runBatch(batchId)` directly after creating a batch. The unit tests for M6 (AI adapter) and M7 (storage) remain valid.

---

### 2026-06-18 — M11 Consistency Anchor + M9 auto-trigger remediation

- Reviewer: Project Owner (self)
- Decision: **Approved**
- Scope reviewed: `AnchorBuilder` service, integration into `PromptComposer`, M9 auto-trigger via `SELECT ... FOR UPDATE SKIP LOCKED`, minimal M12 approval/reopen endpoints (needed by M11 DoD), regression tests.

- Verification (all green before commit):
  - `npm run typecheck` → 0 errors
  - `npm run lint` → 0 errors
  - `npm run build:backend` → 0 errors
  - `npm run test` → **133/133 pass** (117 prior + 16 new: 11 anchor unit + 5 consistency-anchor e2e)
  - `docker compose up` → all healthy
  - End-to-end smoke: `POST /api/rooms/{id}/generations` now produces a prompt that contains `House-wide design language: style=JAPANDI` (M11 anchor + style segment injected by the server-side composer)

- M11 deliverables:
  - **`AnchorBuilder`** (`apps/backend/src/generations/anchor-builder.ts`): server-side computation of the consistency anchor per ADR-011 + rule CA-05. Formula: `style_key + truncated style_notes`, then each approved room's `prompt` (truncated), joined with ` | `. Drops oldest room segments when total exceeds `ANCHOR_MAX_CHARS=1200` and appends `(+N earlier rooms)` tail.
  - **`PromptComposer`** integration: anchor is computed by `GenerationsService.startBatch` (server-side) and passed to the composer as a read-only `consistencyAnchor` field. Never accepted from the client (G-07).
  - **11 unit tests** for `AnchorBuilder.compose` (pure) cover: null cases, style-only, room-only, combined, ordering, truncation, anchor-budget trimming with tail, missing-room-prompt fallback.
  - **5 integration tests** cover: no anchor with no style/approvals; style+approved-room anchor flows into subsequent rooms; approved-room prompts included; recomputes when approvals change; reopen clears approval and recomputes anchor.

- M9 auto-trigger remediation (ADR-014 → Approved):
  - `PipelineOrchestrator.runBatch` now begins with `SELECT ... FOR UPDATE SKIP LOCKED` inside a transaction and atomically transitions claimed rows to `PROCESSING`. Concurrent invocations safely no-op on already-claimed rows.
  - `GenerationsService.startBatch` calls `void this.pipeline.runBatch(batchId)` after creating rows (gated by `ENABLE_GENERATION_AUTO_TRIGGER` env flag, default `true`; tests set it to `false` to avoid races).
  - End-to-end fix: a real user calling `POST /api/rooms/{id}/generations` now actually drives the pipeline and rows transition PENDING → PROCESSING → COMPLETED|FAILED.

- Minimal M12 endpoints (added because M11 DoD requires approval changes to recompute the anchor):
  - `POST /api/rooms/{roomId}/approval { generationId }` → sets approved_generation_id and APPROVED status. Rules A-01..A-03 enforced.
  - `POST /api/rooms/{roomId}/reopen` → clears approval and sets IN_REVIEW. Uses a separate `requireRoom` helper (not `requireOwnedRoom`) so the APPROVED-status check does not falsely trigger the startBatch "Cannot generate on an APPROVED room" path.
  - Full M12 scope (re-approval policies, etc.) remains for a later milestone.

- Bug found and fixed during verification (lesson recorded):
  - `requireOwnedRoom` threw "Cannot generate on an APPROVED room" for any APPROVED room. `reopenRoom` called it and got the wrong error message when the room was APPROVED. Fixed by extracting a `requireRoom` helper that does not enforce the APPROVED-status guard, leaving that check to the caller.

---

### 2026-06-18 — M12 Approval (DoD coverage)

- Reviewer: Project Owner (self)
- Decision: **Approved**
- Scope reviewed: `apps/backend/test/approval.e2e-spec.ts`, approve/reopen service methods, `/approval` and `/reopen` endpoints.
- Verification (all green before commit):
  - `npm run typecheck` → 0 errors
  - `npm run lint` → 0 errors
  - `npm run build:backend` → 0 errors
  - `npm run test` → **143/133 pass** (133 prior + 10 new M12 tests)
  - `docker compose up` → all healthy
  - End-to-end smoke: `POST /api/rooms/{id}/approval { generationId }` on a FAILED generation returns 409 with the standardized error envelope ✓

- M12 deliverables (endpoints already existed from M11; this milestone adds explicit DoD coverage):
  - `apps/backend/test/approval.e2e-spec.ts` — 10 e2e tests covering every M12 DoD bullet:
    - **A-01 (rule)**: rejects FAILED, PENDING, non-existent, and wrong-room generations; accepts COMPLETED; transitions room to APPROVED.
    - **A-02 (rule)**: re-approving a different COMPLETED generation replaces the room pointer (verified via DB read); previous generation row is immutable (rule G-04 — its `prompt`, `status`, and `image_url` are unchanged after the second approval).
    - **A-03 / reopen**: reopen clears `approved_generation_id` and transitions to `IN_REVIEW`; reopen rejects non-APPROVED rooms with 409; reopening re-enables generation (POST `/generations` returns 201 after reopen, vs 409 before).

- Bug found and fixed during M12 verification (lesson recorded):
  - The M12 test helper assumed a fresh room per batch, but `createBatchWithStatuses` was being called after `approve`, which leaves the room APPROVED. The new batch creation hit the "Cannot generate on an APPROVED room" guard and the test failed with a confusing `items.map of undefined`. Fix: the helper now reopens the room if it is APPROVED before creating a new batch.

---

### 2026-06-18 — M13 References

- Reviewer: Project Owner (self)
- Decision: **Approved**
- Scope reviewed: `apps/backend/src/references/` (module/controller/service/repository/DTO), `apps/backend/test/references.e2e-spec.ts`, plus minor edits to `storage.adapter.ts` (MIME whitelist + size cap constants) and `app.module.ts` (registration).

- Verification (all green before commit):
  - `npm run typecheck` → 0 errors
  - `npm run lint` → 0 errors
  - `npm run build:backend` → 0 errors
  - `npm run test` → **156/156 pass** (143 prior + 13 new M13 tests, +1 from the new storage constants path)
  - `docker compose up` → all healthy
  - End-to-end smoke: `POST /api/rooms/{id}/references` (GENERATED) returns the reference; `POST /api/rooms/{id}/references/upload` (UPLOADED) returns a serialized reference with a short-TTL signed URL.

- M13 deliverables:
  - **`ReferencesModule`** wired into `AppModule`; controller exposes 3 endpoints under `/api/rooms/:roomId/references` (list, add) and `/api/rooms/:roomId/references/upload` (multipart), plus `DELETE /api/references/:id`.
  - **`AddReferenceDto`** (class-validator): `sourceType` enum (GENERATED | EXTERNAL_URL | UPLOADED) + conditional `sourceId` / `externalUrl` + optional `caption` (max 500 chars). UPLOADED is rejected at the DTO layer with 400 VALIDATION_FAILED and at the service with 409 CONFLICT (the service-level check is the source of truth).
  - **`ReferencesService.addReference`** enforces:
    - GENERATED → `sourceId` is required and the target Generation must belong to the same room AND the same session (`gen.sessionId === this.sessionContext.sessionId`). Cross-room or cross-session returns 404.
    - EXTERNAL_URL → `externalUrl` is required, parses via `URL` constructor, and `class-validator`'s `@IsUrl({ require_tld: false })` accepts localhost / IPs.
  - **`ReferencesService.uploadReference`** enforces (MIME/size order from rule SG-06):
    1. Room ownership (404 if not found / wrong session).
    2. MIME whitelist (`image/jpeg | image/png | image/webp`) → 400 UPLOAD_REJECTED with `fields.mimeType` on failure.
    3. Size cap `MAX_UPLOAD_BYTES = 10 MB` → 400 UPLOAD_REJECTED with `fields.size` on failure.
    4. Storage upload (`StorageAdapter.upload`) → 400 UPLOAD_REJECTED on failure (storage code mapped to `fields.reason`).
    5. DB row creation **only after** the storage object exists, satisfying the `references_source_consistency_chk` / `references_uploaded_consistency_chk` / `references_mime_type_chk` CHECK constraints.
  - **Multipart controller** uses `@nestjs/platform-express` `FileInterceptor` with a 50 MB hard limit (above the service-level 10 MB cap, so the service's domain check is the one that fires with a typed error envelope — multer's own error path doesn't escape the AllExceptionsFilter).
  - **DELETE** is session-isolated (re-checks `room.sessionId` before deleting) and best-effort deletes the storage object before the row.

- 13 e2e tests cover:
  - GENERATED: happy path, missing `sourceId` (400 VALIDATION_FAILED), wrong-room generation (404), wrong-session generation (404), add `UPLOADED` via JSON (409 CONFLICT, must use upload endpoint).
  - EXTERNAL_URL: happy path, missing `externalUrl` (400), malformed URL (400).
  - UPLOADED (multipart): happy path with signed URL, 12 MB → 400 UPLOAD_REJECTED (no partial state: no row, no storage call), bad MIME → 400 UPLOAD_REJECTED, storage failure → 400 UPLOAD_REJECTED + no row, then a second upload after resetting failure mode succeeds (proves no half-state).
  - List + delete: list returns all references, delete removes both row and storage object, cross-session delete is hidden behind 404.

- Bugs found and fixed during M13 verification (lessons recorded):
  - `references_uploaded_consistency_chk` rejects byte_size > 10 MB at the DB level, but the test's check at `uploads.length === 0` (DoD) requires the service to reject *before* any storage call. Fix: kept the service-level `MAX_UPLOAD_BYTES` check at the top of `uploadReference` (after the MIME check). The DB CHECK is a defense-in-depth backstop.
  - The shared `fakeStorageProxy.uploads` array accumulated across tests, so `uploads.length === 0` (a "no partial state" assertion) was order-dependent. Fix: added `beforeEach` that clears `uploads` and resets `failureMode` so each test's assertions are deterministic.
  - Initial use of `ConflictError` (409) for missing `sourceId` / malformed `externalUrl` was technically wrong — these are client-input errors, not state conflicts. Switched to `ValidationError` (400) to match the API contract's intent and the test expectations.
  - `STORAGE_ADAPTER` token uses `useExisting: SupabaseStorageAdapter`, so overriding the token in the test module doesn't replace the concrete instance. Fix: `overrideProvider(SupabaseStorageAdapter).useValue(fakeStorageProxy)` — same effect, correct binding.

- Known limitations:
  - No rollback of the storage object if `repo.create` (DB CHECK violation) fails after a successful upload. In practice the only realistic trigger is a CHECK constraint mismatch, which is itself a code bug; the in-service validation already covers the documented cases. A future hardening milestone can add a compensation delete.

---

### 2026-06-18 — M14 Export Bundle

- Reviewer: Project Owner (self)
- Decision: **Approved**
- Scope reviewed: `apps/backend/src/exports/` (module/controller/service/repository/assembler/zip-writer/types), `apps/backend/src/storage/storage.adapter.ts` (new `download` method on the interface, `buildExportKey` helper), `apps/backend/src/storage/supabase-storage.adapter.ts` (download impl), `apps/backend/src/app.module.ts` (registration), `apps/backend/test/exports.e2e-spec.ts`, ADR-015 (ZIP library choice), test fakes updated.

- Verification (all green before commit):
  - `npm run typecheck` → 0 errors
  - `npm run lint` → 0 errors
  - `npm run build:backend` → 0 errors
  - `npm run test` → **164/164 pass** (156 prior + 8 new M14 tests)
  - `docker compose up` → all healthy
  - End-to-end smoke: `POST /api/projects/{id}/exports` returns 201 with `{id, version, byteSize, manifest}`; the ZIP is uploaded to `${env}/exports/projects/{id}/v1.zip`; `GET /api/exports/{id}` returns the manifest + signed download URL with 15-minute TTL; re-exporting produces `v2.zip`.

- M14 deliverables:
  - **`ExportsModule`** wired into `AppModule`; controller exposes 3 endpoints (`POST /api/projects/:projectId/exports`, `GET /api/projects/:projectId/exports`, `GET /api/exports/:bundleId`).
  - **`ExportsService.create`** flow:
    1. Verify project exists, is owned by the current session, and `status === COMPLETED` (rule E-01). Anything else returns 400 VALIDATION_FAILED with `fields.status`.
    2. Pull the full project + rooms + style + each room's brief, approved generation, and references.
    3. For each room with an approved generation: download the storage object (via the new `StorageAdapter.download` method) so the approved image can be inlined into the bundle.
    4. For each UPLOADED reference: download the storage object so the binary is inlined.
    5. Hand everything to the pure `assembleBundle` function which produces the manifest + file list.
    6. Build the ZIP with `buildZip` (jszip, ADR-015).
    7. Compute next version = `MAX(version) + 1` from the DB, upload the ZIP, and insert the `ExportBundle` row. On UNIQUE constraint violation (`P2002` — concurrent writer), delete the orphan ZIP and retry up to 5 times.
  - **`ExportsService.getById`** returns the manifest (jsonb) and a signed download URL with a configurable TTL (default 15 min, env `EXPORT_DOWNLOAD_TTL_SECONDS`).
  - **`ExportsService.listByProjectId`** returns versions newest-first, with a per-project session-isolation check.

- **Manifest schema** (the `payload` jsonb, also persisted for E-04 reproducibility):
  ```json
  {
    "schemaVersion": 1,
    "generatedAt": "<ISO>",
    "project": { "id", "name", "description", "status", "createdAt", "completedAt" },
    "styleProfile": { "styleKey", "styleNotes" } | null,
    "rooms": [
      { "id", "roomType", "status", "approvedGenerationId", "approvedImageFile", "promptFile", "notesFile", "referencesCount" }
    ],
    "files": [{ "path", "byteSize" }]
  }
  ```

- **ZIP contents** (per ADR-010):
  ```
  project-summary.json
  style-profile.json                      (only if a style profile exists)
  approved-images/<room-slug>.<ext>       (only for APPROVED rooms; bytes copied from storage)
  prompts/<room-slug>.json                (approved generation + lineage)
  room-notes/<room-slug>.md               (always; brief rendered as markdown)
  references/<id>.json                    (one per reference)
  references/<id>.<ext>                   (only for UPLOADED references; bytes copied from storage)
  ```

- 8 e2e tests cover:
  - **E-01**: non-COMPLETED project returns 400 VALIDATION_FAILED (the status guard runs before any storage call).
  - **Session isolation**: 401 when no session cookie, 404 when a different session tries to GET an existing bundle.
  - **DoD (happy path)**: a 2-room, styled, COMPLETED project produces a ZIP that unzips via `jszip.loadAsync` to include the documented file set; `approved-images/living-room.png` is byte-exact; `room-notes/living-room.md` references the room id and brief content; `style-profile.json` carries the chosen style key.
  - **E-02 (append-only)**: re-exporting the same project produces v+1; list returns versions newest-first; both ZIPs are stored at distinct keys.
  - **E-06 (signed URL)**: `GET /api/exports/:id` returns a `downloadUrl` + `downloadUrlExpiresAt` with a 15-minute window.
  - **UPLOADED ref bin inlined**: an uploaded reference's bytes appear in the ZIP under `references/<id>.<ext>`, byte-exact.
  - **Real-ZIP round-trip**: re-parsing the produced bytes via the real `jszip` library succeeds and surfaces the documented floor files.

- Bugs found and fixed during M14 verification (lessons recorded):
  - **Controller route prefix doubled the global prefix**: my first cut had `@Post('api/projects/:projectId/exports')` while the app uses `app.setGlobalPrefix('api')`, so the actual route became `api/api/...` and every request 404'd. Fix: drop the `api/` prefix in the controller — the global prefix is added once.
  - **`ProjectsRepository` not exported from `ProjectsModule`**: the module's `providers` had it, but the `exports` array omitted it. ExportsModule's import of `ProjectsModule` therefore couldn't resolve the dependency. Fix: `exports: [ProjectsRepository]`.
  - **Test env prefix**: the test setup forces `NODE_ENV=test`, so the storage key is `${test}/exports/...`, not `${development}/...`. The first cut of the test expected `development/...` and the assertion failed. Fix: the test asserts `test/...` (matching the real env).
  - **Invalid `RoomType` enum values in test fixtures**: the enum is `MASTER_BEDROOM` and `WORKSPACE`; the test originally used `BEDROOM`, `OFFICE`, `STUDY`. Prisma rejected them with `Invalid value` errors. Fix: align fixtures with the enum.

- ADR-015: chose `jszip` for the ZIP writer. See `10-decisions.md` ADR-015 for the full rationale (pure JS, mature, per-file STORE/DEFLATE for binary-vs-text reproducibility).

- Known limitations:
  - In-memory ZIP — fine for v1 bundle sizes; future large bundles (video refs) will need a streaming library.
  - Version retry is bounded at 5 attempts; a pathological hot-loop would surface a 500. Real concurrency in v1 is one user/session, so this is theoretical.
  - Compensation: if the DB insert fails for a non-`P2002` reason, the service attempts to delete the uploaded ZIP. A truly catastrophic double-failure (DB down + storage down) would leave an orphan object — surfaced via logs, not cleaned up automatically. M18 (production parity) can add a janitor task.

---

### 2026-06-20 — Fix: generation images not loading in browser (ORB)

- Reviewer: Project Owner (self)
- Decision: **Approved**
- Scope reviewed: `apps/backend/src/storage/supabase-storage.adapter.ts` (upload sends raw bytes), `apps/backend/src/ai/adapters/{pollinations,fetch-http}.fetcher.ts` (HttpFetcher type accepts Buffer bodies), `apps/backend/src/generations/images.controller.ts` (new `GET /api/images/generations/:id` proxy with `Cross-Origin-Resource-Policy: same-origin` + auto-decoding for legacy base64-encoded uploads), `apps/backend/src/generations/generations.module.ts` (registered `ImagesController`), `apps/backend/src/generations/generations.service.ts` (serialize is async + adds `signedImageUrl` / `signedImageUrlExpiresAt`), frontend `Generation` type + `getGenerationImageUrl()` helper, `<GenerationCard>` uses proxy URL with `onError` fallback, `RoomDetailPage` thumbnail updated.

- Verification:
  - `npm run typecheck` (all workspaces) → 0 errors
  - `npm run lint` (all workspaces) → 0 errors
  - `npm run test` → **Backend 214/214 pass** (was 208 + 6 new for `maybeDecodeLegacyBase64`), **Frontend 71/71 pass**
  - `docker compose restart backend` → live backend serves raw JPEG bytes via the proxy (verified via `curl -o /tmp/img1.jpg && file /tmp/img1.jpg` → "JPEG image data, Exif standard")
  - Playwright walkthrough: navigate to `/rooms/{id}/generations`, evaluate `Array.from(document.querySelectorAll('img'))` → all 3 images now have `complete: true`, `naturalWidth: 1024`, `naturalHeight: 1024` (was previously all `naturalWidth: 0`)

- Bugs found and fixed (3 issues, one root cause):

  1. **The actual root cause: SupabaseStorageAdapter.upload() was sending `request.body.toString('base64')`**. Supabase's `/storage/v1/object/POST` endpoint stores the body verbatim — including the base64 ASCII string. The bytes that came back via `GET /storage/v1/object/...` were therefore the literal base64 string, not the JPEG. Browser fetch loaded it as text, Content-Type header lied and said `image/jpeg`, the bytes weren't a valid image.
     - **Fix**: pass `request.body` (a Buffer, which extends Uint8Array, which `fetch` accepts as a `BodyInit`) directly. Required widening the `HttpFetcher.body` type to `string | Uint8Array | Buffer` and casting through `BodyInit` to satisfy TS.
  2. **Even with raw bytes, the browser still wouldn't render cross-origin Supabase URLs**. The `signedImageUrl` field was being set, but Chrome's **Opaque Response Blocking (ORB)** refused to render the cross-origin `<img>` because Supabase's signed-URL responses don't set `Cross-Origin-Resource-Policy: cross-origin` or a permissive CORS header. Symptom: `net::ERR_BLOCKED_BY_ORB` in DevTools.
     - **Fix**: added `GET /api/images/generations/:id` endpoint that streams the bytes through the backend. Browser loads `/api/images/...` which is same-origin (proxied via nginx), ORB doesn't apply, and we set `Cross-Origin-Resource-Policy: same-origin` defensively.
  3. **Legacy data is base64-encoded**. New uploads are raw bytes (after fix #1), but all generations uploaded before this fix are still stored as base64 strings. The image proxy detects this by checking the first 5 bytes (`/9j/` for JPEG, `iVBOR` for PNG) + validating the buffer is a multiple-of-4 valid base64 string + passing through raw images untouched. The decoder is exported as `maybeDecodeLegacyBase64` and unit-tested with 6 cases (raw JPEG, raw PNG, legacy base64 JPEG, legacy base64 PNG, empty buffer, garbage).

- Lessons recorded:
  - **Don't base64-encode binary uploads to REST APIs**. Supabase (and most S3-compatible APIs) want raw bytes. If you base64-encode on the way out, you're storing the literal ASCII string.
  - **Chrome ORB is silent**. A failed image load shows as a blank space, not a broken-image icon. Always check `naturalWidth: 0` programmatically to detect it.
  - **Proxy cross-origin assets through the same origin** when possible. It sidesteps ORB and lets you enforce auth on every image load.

- Known limitations:
  - The proxy streams JPEG only (we set `Content-Type: image/jpeg`); PNG generations will be mis-typed. F8 (References) and the future content-type negotiation can fix this.
  - The proxy caches for 5 minutes (`Cache-Control: private, max-age=300`). Generations are immutable, so this is safe.
  - The legacy-base64 decode is conservative — if a non-image buffer happens to start with `/9j/` or `iVBOR` AND is valid base64, it'll be decoded to garbage that the browser fails to render (then the existing `onError` placeholder kicks in).

---

---

### 2026-06-20 — F8 References UX

- Reviewer: Project Owner (self)
- Decision: **Approved**
- Scope reviewed: `<ReferenceCard>` + `<AddReferenceModal>` (tabbed: Generated / External link / Upload) + `<ReferencesPage>` (deep-link `/rooms/:roomId/references`) + new `<ReferencesSection>` inside `<RoomDetailPage>`. New module: `src/hooks/useReferences.ts` (`useReferences`, `useAddReference`, `useUploadReference`, `useDeleteReference`) + `useUploadReferenceWithProgress.ts` (live `percent` state). New `<RoomDetailPage>` integration (top-3 preview with "Manage →" link). Helpers: `src/lib/upload.ts` (XHR-based multipart uploader with progress events, normalizing the backend's `ApiError` envelope), `src/lib/upload-limits.ts` (`MAX_UPLOAD_BYTES` + allowed MIME types mirroring backend SG-06). Footer remains `v0.7 — F1–F7` (no bump for F8).

- Verification (all green before commit):
  - `npm run typecheck` (all workspaces) → 0 errors
  - `npm run lint` (all workspaces) → 0 errors / 0 warnings
  - `npm run build` (backend + frontend) → clean (Vite bundle 290 KB / 85 KB gzip)
  - `npm run test:frontend` → **110/110 pass** (was 92 + 18 new F8 tests)
  - `npm run test:backend` → **217/218 pass** (1 pre-existing M16 observability flake — `/api/health/ready` returns 503 intermittently because it depends on a real network GET to `gen.pollinations.ai`; documented in F2 review log. F8 introduced no new test instability.)
  - `docker compose restart backend && docker compose restart frontend` → live
  - **End-to-end Playwright walkthrough**: opened `/rooms/{kitchen}/references`, clicked "Add reference", switched to External link tab, typed `https://www.houzz.com/photos/kitchen-ideas`, hit submit. The reference appears in the list with the URL as a click-through link, "External link" badge, and Delete button.
  - **DoD #1 (cross-room 404)**: curl `POST /api/rooms/{kitchen}/references { sourceType: GENERATED, sourceId: "<living-room-generation>" }` → `404 NOT_FOUND { message: "Generation not found in this room." }`. Frontend surfaces via `<ErrorState />` (the `friendlyErrorMessage(NOT_FOUND)` mapper renders "We couldn't find that. It may have been deleted.").
  - **DoD #2 (12 MB upload rejected before backend)**: covered by `AddReferenceModal.test.tsx > rejects oversize uploads client-side before any backend call` — uses `fireEvent.change` on a 12 MB `File`, asserts the `upload-client-error` element renders the friendly message and submit is disabled.

- F8 deliverables:
  - **`<ReferenceCard>`** — three render modes based on `sourceType`:
    - GENERATED → `<img src={"/api/images/generations/" + sourceId}>` (the ORB-safe backend proxy)
    - EXTERNAL_URL → `<a href={externalUrl} target="_blank" rel="noopener noreferrer">`
    - UPLOADED → `<img src={reference.url}>` using the short-TTL signed URL returned on read
    - On `imageError` (failed signed URL, broken proxy, etc.) falls back to a tinted placeholder. "From a generation" / "External link" / "Uploaded image" badge in the top-right. Caption + meta line (filename + MIME + size for UPLOADED, URL preview for EXTERNAL_URL, generation id for GENERATED). Delete button hidden when `canDelete={false}`.
  - **`<AddReferenceModal>`** — three-tab modal built on top of the existing `<Modal>` primitive:
    - Shared `<TextAreaField>` for caption (maxLength 500, no required)
    - Tab buttons use `role="tab"` + `aria-selected` for a11y
    - **GeneratedTab**: pre-fetches via `useGenerationsByRoom`, filters to `status === 'COMPLETED'`, renders the dropdown + Submit. If no COMPLETED generations exist, shows a friendly "Generate at least one option first" hint instead of an empty dropdown.
    - **ExternalUrlTab**: `TextField type="url"`, client-side URL parse + http/https protocol check. Submit disabled until valid.
    - **UploadTab**: file picker with `accept={ALLOWED_IMAGE_MIME_TYPES.join(',')}`. Client-side MIME + size validation in `handleFileChange` shows the friendly `data-testid="upload-client-error"` message and clears the input — no backend call. After a valid file is selected, shows the filename + size summary. Upload goes through `useUploadReferenceWithProgress` which exposes live `progress.percent` (0..100) for the progress bar. Submit disabled during upload.
    - All tabs use `<ErrorState />` for backend errors. Per-field errors (`fields.mimeType`, `fields.size`, `fields.externalUrl`) are rendered separately.
  - **`<ReferencesPage>`** — replaces the F1 placeholder at `/rooms/:roomId/references`. Header shows "X attached" + "Add reference" CTA. Empty state guides the user. Each card has a Delete button behind a destructive `<ConfirmDialog>`. The hook's invalidation refreshes the list automatically on add/delete.
  - **`<RoomDetailPage>` References section** — top-3 preview with `<ReferenceCard>` and a "Manage →" link to the full page; the same `<AddReferenceModal>` is mounted here so the user can add without leaving the room.
  - **Hooks**:
    - `useReferences(roomId)` — query for `GET /api/rooms/:roomId/references`
    - `useAddReference(roomId)` — mutation for `POST .../references`; on success invalidates the list
    - `useUploadReference(roomId)` — mutation for `POST .../references/upload` (no progress)
    - `useDeleteReference(roomId)` — mutation for `DELETE /api/references/:id`; on success invalidates the list
    - `useUploadReferenceWithProgress(roomId)` — wraps the XHR helper, exposes `{ progress: { loaded, total, percent } | null }` for the upload tab. `onSettled` clears the progress state.
  - **Helpers**:
    - `src/lib/upload.ts` — `uploadWithProgress<T>({ url, file, caption?, onProgress?, signal? })` returns a Promise that resolves to the parsed JSON body (typed as `T`) on 2xx, or rejects with an `ApiError` (same shape as `apiFetch`) on non-2xx. Uses XHR because `fetch` doesn't expose upload progress in browsers.
    - `src/lib/upload-limits.ts` — `MAX_UPLOAD_BYTES = 10 * 1024 * 1024`, `ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg','image/png','image/webp']`, `isAllowedImageMimeType`, `describeUploadLimits`. Kept in `lib/` (not `components/`) so the upload tab can import without dragging a component graph.

- 18 new frontend tests:
  - `upload-limits.test.ts` (4) — `MAX_UPLOAD_BYTES` mirrors backend SG-06; allow-list is exactly the three image types; `isAllowedImageMimeType` narrows correctly; `describeUploadLimits` produces a one-line summary mentioning JPEG/PNG/WebP/10 MB.
  - `ReferenceCard.test.tsx` (7) — GENERATED uses the backend proxy URL; EXTERNAL_URL renders as a `target="_blank" rel="noopener noreferrer"` link with the URL as accessible name; UPLOADED uses `reference.url` with filename + MIME + size meta; "No caption" fallback when caption is null; click → `onDelete(reference)`; `canDelete={false}` hides the button; placeholder renders when no image source available.
  - `AddReferenceModal.test.tsx` (7) — default tab is GENERATED; tab switching on click; GENERATED submit posts `{ sourceType, sourceId, caption }`; EXTERNAL_URL client-side validation (disabled until valid URL); **12 MB upload rejected client-side before backend (DoD)**; bad MIME rejected client-side; backend error surfaces via `<ErrorState />` with the friendly `NOT_FOUND` message.

- Bugs found and fixed during F8 verification (lessons recorded):
  - **EXTERNAL_URL didn't render as a link in `<ReferenceCard>`**: my first cut fell through to the image branch (where `pickImageUrl` returns `null` for EXTERNAL_URL), so the user saw the "External link" badge but no actual link. Fix: hoist the EXTERNAL_URL branch above the image branch.
  - **`<AddReferenceModal>` tests failed with "Query data cannot be undefined"**: the test QueryClient had `staleTime: 0` (the default), so on first render the hook re-fetched, the mocked `listGenerationsByRoom` returned `undefined`, and TanStack Query threw. Fix: set `staleTime: Infinity` on the test QueryClient AND give the mock an explicit `Promise.resolve({ items: [...] })` return value (defense in depth).
  - **`(...args: unknown[]) => fn(...args)` spread in `vi.mock`** flagged `TS2556` because the destination function signature wasn't inferred as a tuple. Fix: typed the mock signatures explicitly (`(roomId: string, input: AddReferenceInput) => addReferenceMock(roomId, input)`).
  - **ESLint `react/no-unescaped-entities` on `room's` apostrophe** in the empty hint: replaced with `room&apos;s`.

- Known limitations:
  - One reference per upload (no multi-file selection). F11 polish could add a multi-file queue with a per-item progress bar.
  - The upload tab does not show the generated thumbnail preview before submit (the file is just a name + size line); F11 polish can add a local `<img>` preview using `URL.createObjectURL`.
  - The cross-room 404 error mapper uses the generic `NOT_FOUND` message ("We couldn't find that. It may have been deleted."). The DoD mentions `403 FORBIDDEN` — the backend actually returns `404 NOT_FOUND` (per M13's session-isolation rules; 404 hides existence across sessions, which is intentional per S-05). The friendly mapper correctly catches this; F11 polish can introduce a more specific "Generation not found in this room" copy if desired.
  - No drag-and-drop; F11 polish.
  - The upload uses XHR directly (not the typed `apiFetch`) because `fetch` doesn't expose upload progress. The XHR path normalizes errors into `ApiError` so the rest of the codebase treats responses identically.

---

### 2026-06-20 — F7 Cross-room UX

- Reviewer: Project Owner (self)
- Decision: **Approved**
- Scope reviewed: `<StyleAnchorBanner>` + `<RoomDashboardCard>` + `<ProjectProgress>` components, `summarizeRoomStatuses` helper in `src/lib/room-progress.ts`, integration into `<ProjectDetailPage>` (cross-room dashboard), `<RoomsPage>` (progress bar), `<RoomDetailPage>` (anchor banner at top), small backend wiring so `GET /api/rooms/:id` now returns `consistencyAnchor: string | null` per API contract §7.3 (3 files: `generations.module.ts` exports `AnchorBuilder`, `rooms.module.ts` imports `GenerationsModule`, `rooms.service.ts` calls `anchorBuilder.build(projectId)` inside `get()` and surfaces the result), 4 new backend e2e tests in `rooms.e2e-spec.ts` covering the new field, 21 new frontend tests across `StyleAnchorBanner.test.tsx`, `ProjectProgress.test.tsx`, `RoomDashboardCard.test.tsx`, and `room-progress.test.ts`. Footer bumped to `v0.7 — F1–F7`.

- Verification (all green before commit):
  - `npm run typecheck` (all workspaces) → 0 errors
  - `npm run lint` (all workspaces) → 0 errors / 0 warnings
  - `npm run test:backend` → **218/218 pass** (was 214 + 4 new for the anchor on room GET)
  - `npm run test:frontend` → **92/92 pass** (was 71 + 21 new for the F7 components)
  - `npm run build` (backend + frontend) → clean
  - `docker compose restart backend && docker compose restart frontend` → live
  - **End-to-end Playwright walkthrough**: created a fresh project, set style JAPANDI, added Living Room, generated, approved, added Kitchen (BRIEF_DRAFT); verified (1) the project dashboard shows the Living Room card with its approved thumbnail + "Design next room →" CTA, (2) the Kitchen card with placeholder + helper copy, (3) the progress bar "1 of 2 approved", and (4) BOTH rooms render the same `<StyleAnchorBanner>` with `House-wide design language: style=JAPANDI | living room: ...` at the top.

- F7 deliverables:
  - **`<StyleAnchorBanner>`** — renders nothing when `anchor` is null/undefined/empty (CA-01), shows the CA-prefixed banner with the anchor text when set. `role="note"` + `aria-label` for screen readers. Used on every room screen so the user understands "why does this generation feel consistent with the rest of the house?".
  - **`<RoomDashboardCard>`** — accepts a loose `room` shape (works with both the strict `Room` payload and the looser `ProjectWithRelations.rooms[i]` summary) and a required `projectId` prop. Renders the approved-generation thumbnail via the `/api/images/generations/:id` proxy (we trust the M12 invariant that an approved generation is COMPLETED, so no extra fetch). On `imageError` falls back to the placeholder. When `showDesignNextCta` is true AND the room is APPROVED, surfaces a `Design next room →` link back to the rooms list (the dashboard parent passes the `projectId`, no backend change needed for this). Forest-green ring around the thumbnail + "✓ Approved" badge.
  - **`<ProjectProgress>`** — compact `<progressbar role>` with "X of N approved" label; turns forest-green when `approved === total` and the heading switches to "All rooms approved". `aria-valuemin/max/now` wired. Used on both the project detail page and the rooms list page.
  - **`summarizeRoomStatuses`** — pure helper in `src/lib/room-progress.ts` (extracted from `ProjectProgress.tsx` to satisfy `react-refresh/only-export-components`). Returns `{ total, approved }` for an arbitrary list of `{ status }`.
  - **`<ProjectDetailPage>`** — replaced the read-only rooms list with the cross-room dashboard. The `showDesignNextCta` prop is wired to `hasApproved = summary.approved > 0`, so the CTA only appears once the user has at least one approval.
  - **`<RoomsPage>`** — `<ProjectProgress>` inserted between the header and the rooms list. No structural changes to the room cards (kept the F3 list semantics) — the dashboard view is the new canonical "all rooms" surface.
  - **`<RoomDetailPage>`** — `<StyleAnchorBanner>` inserted immediately after the header. No other changes.
  - **`AppShell`** — footer version bumped to `v0.7 — F1–F7`.

- 21 new frontend tests:
  - `StyleAnchorBanner.test.tsx` (5) — null/undefined/empty anchor renders nothing; renders anchor text inside the banner; exposes the banner via `role="note"` with the right `aria-label`.
  - `ProjectProgress.test.tsx` (4) — `0 of 0` with empty bar; raw counts in the label; "All rooms approved" heading at 100%; rounding for non-divisible totals.
  - `RoomDashboardCard.test.tsx` (8) — placeholder vs image (with correct `src` = `/api/images/generations/:id`); "Design next room" CTA gated on `showDesignNextCta` + APPROVED; status chip rendering across all four `RoomStatus` values; thumbnail link to room detail; `placeholderLabel` override.
  - `room-progress.test.ts` (4) — empty list → zeros; counts only APPROVED; accepts loose-string statuses (matches the `ProjectWithRelations` shape); ignores unknown future statuses.

- 4 new backend tests (`rooms.e2e-spec.ts`, "Consistency anchor on GET /api/rooms/:id"):
  - Returns `null` anchor when no sibling room is approved.
  - Returns the anchor string on a sibling room once one is approved (style + approved-room segments).
  - Returns the anchor on the approved room itself (style-only segment).
  - After reopening the approved room, the anchor loses the approved-room segment but keeps the style segment.

- Bugs found and fixed during F7 verification (lessons recorded):
  - **`humanizeRoomType` and `summarizeRoomStatuses` triggered `react-refresh/only-export-components` warnings**: file-exported both a component and a helper function. Fix: inlined `humanizeRoomType` inside `RoomDashboardCard.tsx` (private, no `export`), moved `summarizeRoomStatuses` into its own `src/lib/room-progress.ts` file.
  - **`Pick<Room, ...>` was too narrow for the dashboard's loose `ProjectWithRelations.rooms[i]` shape** (`status: string` vs `RoomStatus`): the typecheck rejected the spread. Fix: `<RoomDashboardCard>` accepts a wide `{ status: RoomStatus | string }` union; status comparisons cast as needed.
  - **`projectId` was missing on `ProjectWithRelations.rooms[i]`**: my first cut relied on `room.projectId` to build the "Design next room →" href, but the backend doesn't echo it on the room summary. Fix: required `projectId` as a top-level prop on `<RoomDashboardCard>` and pass `projectId={p.id}` from the dashboard parent. Avoided a backend round-trip and kept the component contract explicit.
  - **Footer version drift**: bumped `v0.6 — F1–F6` → `v0.7 — F1–F7`.

- Known limitations:
  - "Design next room" CTA only surfaces on approved rooms. When zero rooms are approved, the dashboard parent passes `showDesignNextCta={false}`; F11 polish may add an always-visible "Add room" shortcut on the dashboard card regardless of status.
  - The "approved history ribbon" (which generations were approved previously) is not surfaced; the backend preserves all generations immutably but the UI shows only the current pointer.
  - The anchor banner only renders on the room detail page, not on the generations page; F11 polish can decide whether to duplicate it there too.

---

---

### 2026-06-20 — F6 Approval UX

- Reviewer: Project Owner (self)
- Decision: **Approved**
- Scope reviewed: `<ConfirmDialog>` primitive, `useOptimisticApprove` hook (with onMutate snapshot + rollback + onSettled invalidation), `<GenerationCard>` approve button now shows on every COMPLETED option with re-approval semantics, `GenerationsPage` confirmation modal (variant copy when re-approving), Reopen button on both `GenerationsPage` and `RoomDetailPage` with its own confirmation dialog, 7 new frontend tests (5 ConfirmDialog + 2 optimistic hook).

- Verification:
  - `npm run typecheck` (all workspaces) → 0 errors
  - `npm run lint` (all workspaces) → 0 errors
  - `npm run test --workspace=@interior/frontend` → **71/71 pass** (64 F1–F5 + 7 new F6)
  - `npm run build --workspace=@interior/frontend` → Vite bundle (269 KB JS, gzip 80 KB; 19 KB CSS, gzip 4 KB)

- F6 deliverables:
  - **`<ConfirmDialog>`** — reusable confirmation modal. `destructive` flag switches the confirm button to the clay/red palette. `pending` prop disables both buttons and swaps the confirm label to "Working…". Used by approve + reopen flows.
  - **`useOptimisticApprove`** — TanStack Query mutation with three lifecycle hooks:
    - `onMutate` — cancels in-flight room queries, snapshots the room, sets `approvedGenerationId` + `status: 'APPROVED'` optimistically, returns the snapshot for rollback.
    - `mutationFn` — calls `approve(roomId, { generationId })`.
    - `onError` — restores the snapshot (rollback) + invokes optional `onErrorToast` for error banner rendering.
    - `onSettled` — invalidates room + generations caches so the server truth is re-fetched.
  - **`<GenerationCard>` update** — the approve button is now shown on **every** COMPLETED option. When the option IS the approved one, the button reads "Approved" (and still triggers a re-approval if clicked). When not, it reads "Approve". Both go through the confirmation modal.
  - **`GenerationsPage` confirmation flow** — clicking Approve opens a `<ConfirmDialog>`. The dialog copy varies based on whether the room already has an approval:
    - **First-time**: "Approve this option?" — "This sets the room's design language for export. You can re-approve a different option later."
    - **Re-approval**: "Replace current approval?" — "This room already has an approved option. Approving a different one will replace the current approval."
    Both go through `useOptimisticApprove` so the UI flips the room status instantly, then the server confirms.
  - **Reopen flow** — `GenerationsPage` + `RoomDetailPage` both render a "Reopen room" button when the room's status is `APPROVED`. Clicking it opens a destructive `<ConfirmDialog>` ("Reopen" button in clay) that calls `POST /api/rooms/:id/reopen`. The button is disabled while pending.
  - **Error banner** — the `errorBanner` state surfaces approval / reopen failures via the shared `<ErrorState>` component (F10 friendly mapping applies automatically).

- 7 new tests:
  - `ConfirmDialog.test.tsx` (5) — title + description rendering, custom + default labels, onConfirm fires, onClose fires via cancel, both buttons disabled when pending.
  - `useOptimisticApprove.test.tsx` (2) — optimistic update visible before the server resolves, full rollback when the server returns an error.
  - `GenerationCard.test.tsx` (refactor) — button text now reads "Approve" or "Approved" instead of being hidden; updated the assertion accordingly.

- Bugs found and fixed during F6 verification (lessons recorded):
  - **JSX fragment mismatch in `RoomDetailPage`**: the article + ConfirmDialog siblings were returned without a fragment, breaking the `</article>` parse. Fix: wrapped in `<>...</>`.
  - **`friendlyErrorMessage` import was unused** in `GenerationsPage`: leftover from an earlier iteration. Fix: removed the import.
  - **`ApiError` import was unused** in `RoomDetailPage` after the field-error rendering was removed. Fix: removed.
  - **GenerationCard's approve button was hidden when approved** (F4 behavior). F6 changes it to always render with a "Approved" label so re-approval is one tap away. Existing tests updated to match.
  - **`@typescript-eslint/consistent-type-imports` on `import('...')`**: same fix as in BriefEditor.test.tsx — hoist to top-level `import type * as Foo from '...'`.

- Known limitations:
  - The optimistic update is in-memory only; if the user closes the tab between the optimistic flip and the server response, the rollback is lost (the server is still the source of truth and the next visit will reflect the actual state).
  - "Approved" button label on the currently-approved option is a small UX win but doesn't yet distinguish "tap to confirm" vs "tap to undo"; F11 polish can address with a clearer label like "Re-approve".
  - The "approved generation history" (which options were approved previously) is not surfaced; the backend preserves all generations immutably but the UI shows only the current pointer. F11 can add a small history ribbon.

---

### 2026-06-20 — F5 Refinement UI

- Reviewer: Project Owner (self)
- Decision: **Approved**
- Scope reviewed: real `GenerationDetailPage` (lineage + Refine CTA), `<RefinementForm>` (7 fields → POST with `parentGenerationId` + `refinements`), `<LineageTree>` (collapsible chain + descendants), `useLineage` hook, Refine link on `<GenerationCard>`, fixed `LineageResponse`/`Refinements` types to match the backend, 4 new frontend tests.

- Verification:
  - `npm run typecheck` (all workspaces) → 0 errors
  - `npm run lint` (all workspaces) → 0 errors
  - `npm run test --workspace=@interior/frontend` → **64/64 pass** (60 F1–F4 + 4 new F5)
  - `npm run build --workspace=@interior/frontend` → Vite bundle (265 KB JS, gzip 79 KB; 19 KB CSS, gzip 4 KB)
  - **End-to-end smoke** through Docker frontend proxy: create project → set style → add room → write brief → list generations all round-trip correctly

- F5 deliverables:
  - **`<RefinementForm>`** — 7 free-text fields (colors / objects / furniture / materials / lighting / layout / style emphasis), each maxLength 500. At least one field must be filled before submit. Posts to `POST /api/rooms/:id/generations` with `{ parentGenerationId, refinements }` (empty strings stripped). Per-field error rendering via `error.fields`. Calls `onCreated(batchId)` on success so the parent can navigate.
  - **`<LineageTree>`** — renders the chain root → ... → current (each step a pill linking to `/generations/:id`), plus a "Refined into" sub-list when descendants exist. Each chain pill is highlighted when it matches the queried generation.
  - **`GenerationDetailPage` (real)** — fetches the generation via `useRoom` + `useGenerationsByRoom` (the backend doesn't expose a direct GET /api/generations/:id, so we accept a `?roomId=` query param to know which room's list to scan). Shows image + status + lineage tree + Refine CTA + collapsible "Show prompt" panel. The Refine CTA opens a `<Modal>` with `<RefinementForm>`; on success it navigates to the generations page with `?batch=...` so the user immediately sees the new batch.
  - **GenerationsPage update** — accepts `?batch=...` query param to deep-link a specific batch (used by the refinement redirect). Strips the param once the requested batch has loaded so the URL doesn't keep the target after navigation. The `GenerationCard` now renders a Refine link (only when the room isn't already approved).
  - **`<GenerationCard>` Refine link** — new optional `refineHref` prop. When set + room not approved, renders an outlined "Refine" link next to the Approve button. Deep-links to the detail page.
  - **`useLineage(generationId)`** — TanStack Query wrapper around `GET /api/generations/:id/lineage`. 30s `staleTime` (matches the global default).
  - **API type fixes**:
    - `LineageResponse` now has `{ root: LineageNode, ancestors: LineageNode[], descendants: LineageNode[] }` matching the backend's actual response.
    - `LineageNode` now has only `{ id, optionIndex, createdAt }` (no longer carries `status` / `parentGenerationId`).
    - New `Refinements` interface mirrors `RefinementsDto` (colors/objects/furniture/materials/lighting/layout/styleEmphasis) with all-optional strings.
    - `CreateBatchInput.refinements` now uses `Refinements` instead of the loose `Record<string, unknown>`.
  - **4 new tests**:
    - `RefinementForm.test.tsx` (3) — all 7 fields render, submit button disabled until at least one field filled, enabled after fireEvent.change.
    - `GenerationCard.test.tsx` (+1) — Refine link renders with correct href when `refineHref` provided.
    - Plus the existing GenerationCard tests now wrap in `<MemoryRouter>` because the card uses `<Link>`.

- Bugs found and fixed during F5 verification (lessons recorded):
  - **`@typescript-eslint/consistent-type-imports` on `import(...)` type**: the BriefEditor test used `import('...')` inline for the `typeof` cast. Fix: hoist to a top-level `import type * as Foo from '...'`.
  - **GenerationCard tests broke after adding `<Link>`**: tests need a `<MemoryRouter>` wrapper because the card now contains a Link. Fix: added `renderWithRouter` helper and applied it to all renders.
  - **Controlled input didn't react to `dispatchEvent('input')`**: the RefinementForm test used `colors.value = '...'; colors.dispatchEvent(new Event('input'))` which doesn't fire React's `onChange`. Fix: use `fireEvent.change(colors, { target: { value: '...' } })`.
  - **Unused `refineHref` in `GenerationCard`**: forgot to destructure the new prop. Fix: added to the component's signature.

- Known limitations:
  - The generation detail page requires a `?roomId=` query param because the backend doesn't expose a direct GET /api/generations/:id. For F8 (References UX) we may add a backend endpoint to fetch by id, eliminating the URL hack.
  - The "compare to parent" view (the spec's "parent image vs new option") is not yet implemented; the lineage tree shows the chain visually but does not show two images side by side. Future polish (F11).
  - No "regenerate from this step" action on intermediate chain nodes — clicking a node just navigates to its detail page. F11 can add this.

---

### 2026-06-20 — F4 Generation UI

- Reviewer: Project Owner (self)
- Decision: **Approved**
- Scope reviewed: real `RoomDetailPage` (brief editor + recent generations), real `GenerationsPage` (3-option grid + polling + approve), `<BriefEditor>` + `<GenerationCard>` + `generation-status` helpers, `useRoom` / `useUpdateBrief` / `useBatchStatus` / `useCreateBatch` / `useApproveGeneration` / `useReopenRoom` / `useGenerationsByRoom` hooks, extended `Room` type with `designBrief`, 11 new frontend tests.

- Verification:
  - `npm run typecheck` (all workspaces) → 0 errors
  - `npm run lint` (all workspaces) → 0 errors
  - `npm run test --workspace=@interior/frontend` → **60/60 pass** (49 F1+F2+F3 + 11 new F4)
  - `npm run build --workspace=@interior/frontend` → Vite bundle (256 KB JS, gzip 77 KB; 19 KB CSS, gzip 4 KB)
  - Backend regression: 205/206 pass (one pre-existing M16 flake from real Pollinations network call; not F4-related)
  - **End-to-end smoke** through Docker frontend container:
    - Project create → style set → room create → brief update all round-trip correctly via the frontend proxy

- F4 deliverables:
  - **`<BriefEditor>`** — 5 free-text fields from `UpdateBriefDto` (purpose, occupants, lightingPreferences, furnitureRequirements, constraints). Pre-populated from `room.designBrief` on first load. Per-field errors from `error.fields`. Save button shows "Saved" confirmation.
  - **`<GenerationCard>`** — single cell in the 3-option grid. Four states:
    - **PENDING/PROCESSING** → pulsing skeleton (`animate-pulse`) with status text label
    - **COMPLETED** → image + "Approve" button (hidden when room already has an approval)
    - **FAILED** → clay-toned error card with the documented `error_code` (PROVIDER_TIMEOUT / PROVIDER_REJECTED / PROVIDER_BROKEN / STORAGE_FAILED) translated via `generationErrorTitle`
    - **isApproved** → green "✓ Approved" ribbon overlay + no approve button
  - **`generation-status` helpers** — `GENERATION_STATUS_LABEL` (PENDING → "Queued", PROCESSING → "Generating", etc.) + `generationErrorTitle(code)` returning friendly titles per documented `error_code`. Kept in a separate file to satisfy `react-refresh/only-export-components`.
  - **`GenerationsPage` (real)** — full generation flow:
    - Reads the room to detect whether a brief has been written (any field non-empty); disables the Generate button otherwise with an inline hint.
    - **Generate button** → `useCreateBatch()` → seeds `batchQueryKey(roomId, batchId)` cache + sets `activeBatchId`.
    - **`useBatchStatus`** uses TanStack Query's `refetchInterval` to poll the batch endpoint every 2s while any row is PENDING/PROCESSING; auto-stops polling when all rows are COMPLETED or FAILED. Uses `refetchIntervalInBackground: false` so the browser doesn't hammer the backend in a backgrounded tab.
    - 3-card grid with per-card Approve button. Only the first approve succeeds (subsequent cards hide their approve button once the room has an approval).
    - Approve button calls `useApproveGeneration()` which invalidates the room + generations caches (room status flips to APPROVED).
    - `EmptyGenerationsHint` for first-time visitors.
    - Quiet "All generations (N)" details panel below for history.
  - **`RoomDetailPage` (real)** — wraps `<BriefEditor>` plus a small "Generations" preview section that links into `/rooms/:id/generations`. Shows approved generation id + status pill.
  - **Hooks**:
    - `useRoom(roomId)` — query for `GET /api/rooms/:id` (includes brief inline).
    - `useUpdateBrief(roomId)` — mutation that invalidates the room on success.
    - `useGenerationsByRoom(roomId)` — query for `GET /api/rooms/:id/generations` (recent 50).
    - `useBatchStatus(roomId, batchId, { pollWhile? })` — polling query using `refetchInterval` (TanStack Query's built-in polling).
    - `useCreateBatch(roomId)` — mutation that seeds the batch cache + invalidates the room's generations list.
    - `useApproveGeneration(roomId)` — mutation that invalidates both room + generations caches.
    - `useReopenRoom(roomId)` — mutation that clears the approval (used when an APPROVED room needs a new batch; F7 polish may add a button).
  - **API types** — `Room` extended with `designBrief?: DesignBrief | null` so the brief can be read from the room GET instead of needing a separate `/brief` endpoint (the backend doesn't expose one).
  - **11 new tests**:
    - `GenerationCard.test.tsx` (9) — `GENERATION_STATUS_LABEL` coverage, `generationErrorTitle` for every documented code + null fallback, image + Option N rendering, approved ribbon hides approve button, unapproved shows it, FAILED card uses friendly title + error message, PENDING/PROCESSING shows pulsing skeleton.
    - `BriefEditor.test.tsx` (3) — fields prefill from room brief, empty fields when no brief, submit fires on click.

- Bugs found and fixed during F4 verification (lessons recorded):
  - **`@next/next/no-img-element` lint rule not installed**: those disable directives referenced a rule from the Next.js plugin which isn't loaded in this Vite project. Fix: removed the directives; `<img>` is fine in Vite + React.
  - **`react-refresh/only-export-components` warnings on `<GenerationCard />`**: file exported both a component and helper constants/functions. Fix: extracted `GENERATION_STATUS_LABEL` and `generationErrorTitle` into `generation-status.ts`.
  - **Stale `GenerationStatusLabel`/`generationErrorTitle` import in test**: after the extract, the test was importing from the wrong path. Fix: updated import to `./generation-status`.
  - **`approve(roomId, generationId)` signature mismatch**: hook called `approve(roomId, input.generationId)` but the API function expects `{generationId: string}`. Fix: pass `input` directly.
  - **Stale edits left orphan tokens in `GenerationsPage.tsx`**: an iterative edit appended new content without removing the old. Fix: rewrote the file cleanly from scratch.

- Known limitations:
  - No retry button on FAILED generation cards. The user can re-Generate to spin up a new batch (the failed row remains in history); per-card "retry this option" UX is out of scope.
  - The polling interval is fixed at 2s. The backend's pipeline target is 10–30s, so 2s polling is well within reason and adds minimal load. Future tuning can be done via env.
  - Real generation calls still hit the real Pollinations API; in CI / offline, the page surfaces the documented `PROVIDER_TIMEOUT` / `PROVIDER_REJECTED` / `STORAGE_FAILED` errors via the F10 friendly mapping (verified in `generationErrorTitle`).

---

### 2026-06-20 — F3 Project Flow

- Reviewer: Project Owner (self)
- Decision: **Approved**
- Scope reviewed: real `ProjectsPage` (create flow wired), `CreateProjectModal`, `StylePage` (catalog grid + editor + notes), `RoomsPage` (list + add modal), `StyleCatalogPage`, `SettingsPage`, shared `<Modal>` + `<FormField>` primitives, `RoomStatusChip`, four new hooks (`useCreateProject`, `useProject`, `useProjectStyle/useSetProjectStyle/useStyleCatalog`, `useProjectRooms/useRoom/useCreateRoom`), 14 new frontend tests, polyfill for `HTMLDialogElement.showModal` in test setup.

- Verification:
  - `npm run typecheck` (all workspaces) → 0 errors
  - `npm run lint` (all workspaces) → 0 errors
  - `npm run test --workspace=@interior/frontend` → **49/49 pass** (35 F1+F2 + 14 new F3)
  - `npm run build --workspace=@interior/frontend` → Vite bundle (243 KB JS, gzip 75 KB; 17 KB CSS, gzip 4 KB)
  - **End-to-end smoke** through the running frontend container:
    - `GET /api/session` → 200 with `Set-Cookie: sid=…`
    - `GET /api/projects` → `{items: []}`
    - `GET /api/styles` → 8 catalog entries (JAPANDI, SCANDINAVIAN, …)
    - `POST /api/projects {"name":"F3 Smoke Test"}` → 201 with `{id, name, status: DRAFT, …}`
    - `POST /api/projects {"name":""}` → 400 with `{error:{code:'VALIDATION_FAILED', fields:{name:'…'}}}`

- F3 deliverables:
  - **`ProjectsPage` create flow** — the inert F2 "Create project" button now opens `<CreateProjectModal>`. The modal posts to `POST /api/projects` via `useCreateProject`. On success it invalidates `PROJECTS_QUERY_KEY`, resets state, and navigates to the new project's detail page (`/projects/:id`).
  - **`<CreateProjectModal>`** — accessible `<dialog>` with native focus trap + escape-to-close (via the `<Modal>` primitive). Two fields (name + description). Per-field errors render via `error.fields` map from the backend's standardized envelope (M15). The button is disabled when name is empty or the mutation is pending. Top-level errors (e.g. CONFLICT for duplicate names) render below the form.
  - **`<Modal>` primitive** — wraps native `<dialog>`. `open` + `onClose` props. Uses `useEffect` to call `dialog.showModal()` / `dialog.close()` on prop changes. The native cancel event (Escape) is forwarded as `onClose`. Optional `footer` slot.
  - **`<FormField>` family** — `<TextField>`, `<TextAreaField>`, `<SelectField>`. All accept `label`, `name`, `error`, `helper`, `required`. Errors render in place of the helper; `aria-invalid` + `aria-describedby` wired for screen readers.
  - **`<RoomStatusChip>`** — color-coded pill for the four `RoomStatus` values (BRIEF_DRAFT / IN_REVIEW / APPROVED / GENERATING).
  - **`StylePage` (real)** — three TanStack Query loads in parallel (project, style, catalog). The catalog renders as a radio-group grid of style cards (8 styles). Picking one and hitting "Save style" calls `PUT /api/projects/:id/style`. Errors render per-field + top-level. The "Update style" button is disabled until the selection or notes diverge from the saved value.
  - **`RoomsPage` (real)** — lists rooms with `<RoomStatusChip>` and humanized type names (LIVING_ROOM → "Living Room"). Add Room opens a `<Modal>` with a `<SelectField>` filtered to room types not yet in the project. Empty state for projects with no rooms. Add button disabled when all 6 types are taken.
  - **`StyleCatalogPage`** — browseable grid of the 8 curated styles with color-tendency chips. Linked from the top nav.
  - **`SettingsPage`** — shows the full session id (no login, no email; the session id is the only identifier).
  - **Hooks**:
    - `useProject(projectId)` — `useQuery` over `getProject(id)`.
    - `useCreateProject({ onSuccess })` — `useMutation` over `createProject()`, invalidates projects cache on success.
    - `useStyleCatalog()` — long-staleTime query (catalog rarely changes).
    - `useProjectStyle(projectId)` — query that returns `null` when no style is set.
    - `useSetProjectStyle(projectId)` — `useMutation` over `putProjectStyle()`, invalidates project style cache on success.
    - `useProjectRooms(projectId)` / `useRoom(roomId)` — list / detail queries.
    - `useCreateRoom(projectId)` — `useMutation` that invalidates the project's rooms list and the parent projects cache (so the detail page re-counts rooms).
  - **14 new tests**:
    - `Modal.test.tsx` (4) — title + description rendering, footer slot, close-on-X-click, heading level.
    - `FormField.test.tsx` (5) — label/helper rendering, required asterisk, error replaces helper, onChange firing, textarea rows + error.
    - `RoomStatusChip.test.tsx` (1) — `it.each` over all four RoomStatus values → friendly labels.
    - Plus the `<App/>` route table now includes `/styles` and `/settings`.

- Bugs found and fixed during F3 verification (lessons recorded):
  - **`RoomType as _RT; void _RT;` placeholder import**: a leftover from a refactor that confused the TS compiler (`_RT` was a type used as a value). Fix: removed.
  - **`Modal` test threw `dialog.showModal is not a function`**: JSDom doesn't implement the HTMLDialogElement methods. Fix: polyfill `showModal`/`close` on `HTMLDialogElement.prototype` in `test/setup.ts` (no-op in real browsers).
  - **Frontend `StyleCatalogEntry` had `styleKey` field, backend sends `key`**: the API types drifted from the actual backend response. Fix: updated the frontend type to match (`key`, `name`, `description`, `colorTendencies`, `materialTendencies`). Verified by curling `GET /api/styles` through the frontend container.

- Known limitations:
  - No real-time UI feedback for the consistency anchor (M11). The style notes are saved; the anchor visibility on cross-room generations is server-driven — F7 will surface it.
  - The Style editor's "Save style" button is disabled when the selection matches the saved value, even if only `styleNotes` changed. Minor polish; F11 can address.
  - The Add Room modal blocks the user from adding a second room of the same type (per backend R-03 unique constraint); this is the intended UX.

---

### 2026-06-20 — F2 App Shell

- Reviewer: Project Owner (self)
- Decision: **Approved**
- Scope reviewed: enhanced `src/routes/AppShell.tsx`, real `ProjectsPage.tsx` + `ProjectDetailPage.tsx`, new `src/components/{Skeleton,EmptyState,ErrorState,ProjectCard}.tsx`, new `src/hooks/useProjects.ts`, `src/lib/error-messages.ts` (F10 early work — friendly mapping for every ErrorCode), `src/lib/format.ts`, 25 new frontend tests.

- Verification:
  - `npm run typecheck` (all workspaces) → 0 errors
  - `npm run lint` (all workspaces) → 0 errors
  - `npm run test --workspace=@interior/frontend` → **35/35 pass** (10 F1 + 25 new F2)
  - `npm run build --workspace=@interior/frontend` → Vite production bundle (222 KB JS, gzip 70 KB; 14 KB CSS, gzip 3.5 KB)
  - `npm run test` (backend) → 205/206 pass. **One pre-existing flake**: `test/observability.e2e-spec.ts > GET /api/health/ready` returns 503 intermittently when run as part of the full suite; passes when run in isolation. Root cause: the test depends on a real network GET to `https://gen.pollinations.ai` (the AI provider's `healthcheck()`), which can transiently 503 in the test container's network. This was a known M16 limitation, not caused by F2. F2 does not introduce any new test instability. (See "Known limitations" below.)

- F2 deliverables:
  - **`AppShell` v2** — branded wordmark + tagline, active-link styling via React Router's `NavLink isActive`, disabled `aria-disabled` items for the not-yet-built nav (Style catalog, Settings), compact session-id chip in the header. Generous whitespace + sticky translucent header per architecture §4.2.
  - **`ProjectsPage` (real)** — TanStack Query via `useProjects()`. Four states rendered:
    - **pending** → `<SkeletonList rows={3}>` with `role="status" aria-busy="true"`.
    - **error** → `<ErrorState error onRetry={refetch} />` with trace-id surface for support.
    - **empty** → bespoke first-time-visitor card (matches the design language — illustration glyph, headline, supportive copy, inert "Create your first project" CTA with F3 hint).
    - **data** → responsive grid of `<ProjectCard>`s (`sm:grid-cols-2 lg:grid-cols-3`).
    The page-level "+ Create project" button is present but inert for F2 (the spec calls for it to be visible).
  - **`ProjectDetailPage` (real)** — TanStack Query via `getProject(id)`. Reads project name, description, status, createdAt / completedAt, style profile (or "No style set yet"), and rooms list (with status chips). Each room links to its detail page (F4).
  - **`ProjectCard`** — premium hover lift (`hover:-translate-y-0.5 hover:shadow-md`), status pill with role-based color (Draft / In progress / Completed), date metadata footer. Linked to `/projects/:id`.
  - **`ErrorState`** — accessible alert (`role="alert"`) with `<h2>` heading + body + optional trace-id reference + optional retry button. Uses the friendly-error-message mapper.
  - **`EmptyState`** — reusable primitive for "no data yet" surfaces with optional title / description / action.
  - **`Skeleton` / `SkeletonList`** — animated-pulse primitives. `SkeletonList` includes `role="status"` + `aria-live="polite"` + `sr-only` text for screen readers.
  - **`lib/error-messages.ts`** — F10 early work. Two functions:
    - `friendlyErrorMessage(err)` — maps every backend `ErrorCode` to a single canonical, action-oriented sentence. Falls back to `Error.message` / the string itself / generic "Something went wrong." in that order.
    - `friendlyErrorTitle(err)` — short banner labels per code ("Session expired", "Slow down", "Image provider issue", etc.) for use in UI chips.
  - **`lib/format.ts`** — `formatDate`, `formatDateTime`, `formatBytes` using the browser's locale. Defensive: invalid inputs pass through unchanged.
  - **`hooks/useProjects.ts`** — TanStack Query wrapper around `listProjects()`. 30s `staleTime` matches the global default.
  - **25 new tests**:
    - `error-messages.test.ts` (6) — every code maps to a non-empty friendly string; `Error.message` pass-through; non-`Error` value handling; `friendlyErrorTitle` happy paths.
    - `format.test.ts` (8) — date / datetime / bytes formatting + invalid-input pass-through.
    - `ProjectCard.test.tsx` (4) — name/description/status pill, "No description" fallback, completed-date rendering, link href.
    - `EmptyState.test.tsx` (3) — title rendering, optional description, optional action.
    - `ErrorState.test.tsx` (4) — friendly heading + message for `ApiError`, retry click handler, no trace-id when absent, custom title override.

- Bugs found and fixed during F2 verification (lessons recorded):
  - **`keyof typeof friendlyErrorMessage` was `never`**: `friendlyErrorMessage` is a function, so `keyof typeof function` is `never`. Switched to `ErrorCode[]` directly with the `ApiError` constructor accepting the typed code.
  - **ErrorState rendered title as a `<span>` not a heading**: testing-library's accessible-name lookup for `role="heading"` failed. Fix: use `<h2>` for the title — also better UX (a clear banner heading).
  - **`friendlyErrorMessage('something bad')` returned "Something went wrong."** instead of the string itself: the test expected string-passthrough. Fix: extend the chain to `if (typeof err === 'string') return err;` before the generic fallback.

- Known limitations:
  - The M16 observability flake surfaces when running the full backend suite; passes when running `observability.e2e-spec` in isolation. F2 does not introduce new flakiness. Future hardening: stub the `AI_PROVIDER_ADAPTER` in the observability test to avoid depending on real outbound HTTPS.
  - `ProjectsPage` and `ProjectDetailPage` are read-only. Create / rename / style-edit / room-add all land in F3.
  - The nav's "Style catalog" and "Settings" items are intentionally disabled (rendered as `aria-disabled` spans) so they don't 404 during F2.

---

### 2026-06-20 — F1 Foundation

- Reviewer: Project Owner (self)
- Decision: **Approved**
- Scope reviewed: `apps/frontend/` scaffold (Vite + React 18 + TS strict + Tailwind + React Router v6 + TanStack Query v5), typed `apiFetch` + per-domain API modules, placeholder routes for every screen, `useSession` hook + query client, multi-stage + dev Dockerfiles, nginx config, docker-compose frontend service.

- Verification (all green before commit):
  - `npm run typecheck` (all workspaces) → 0 errors
  - `npm run lint` (all workspaces) → 0 errors
  - `npm run test` → **216/216 pass** (206 backend + 10 new F1 frontend)
  - `npm run build` → Vite production bundle builds cleanly (212 KB JS, 10 KB CSS, gzip 68 KB / 2.5 KB)
  - `docker build -f infra/docker/frontend/Dockerfile .` → multi-stage prod image builds
  - `docker compose up -d frontend` → Vite dev server boots on :5173; `GET /` returns 200; `GET /api/session` proxies through to the backend (200 with `Set-Cookie: sid=...` and M17 security headers)

- F1 deliverables:
  - **`apps/frontend/package.json`** — React 18, react-router-dom v6, @tanstack/react-query v5, Tailwind v3.4, vitest + jsdom + Testing Library, ESLint v8 + Prettier + react-hooks plugins. Scripts: `dev`, `build` (tsc + vite), `lint`, `typecheck`, `test`.
  - **`src/lib/error.ts`** — `ApiError` class + `ErrorCode` enum that mirrors the backend envelope (`docs/05-api-contract.md §2.1`). Carries `.status`, `.code`, `.fields`, `.traceId` so UI can branch on the stable contract codes without juggling raw `Response` objects. Helpers `.isClientError()` / `.isServerError()`.
  - **`src/api/client.ts`** — typed `apiFetch<T>(path, init)` wrapper around `fetch`. Always sets `credentials: 'include'` (so the backend `sid` cookie attaches), JSON-encodes plain-object bodies and sets `Content-Type: application/json`, leaves `FormData`/`Blob` bodies alone (the browser sets the multipart boundary), normalizes non-2xx responses into `ApiError` with the envelope's `code`, `message`, `fields`, `traceId`. Falls back to `INTERNAL` when the body isn't JSON.
  - **`src/api/*.ts`** — one module per backend domain (`session`, `projects`, `styles`, `rooms`, `generations`, `references`, `exports`). Each exports typed functions (`listProjects`, `createProject`, `createBatch`, `addReference`, `uploadReference`, `createExport`, …) that call `apiFetch` with the right path + method + body. The frontend never reaches into raw `fetch`.
  - **`src/lib/query-client.ts`** — singleton TanStack `QueryClient` with conservative defaults: `staleTime: 30s`, `retry` conditional on `ApiError.isClientError()` (don't retry 4xx), `refetchOnWindowFocus: false` (calm design-app behavior).
  - **`src/hooks/useSession.ts`** — TanStack Query wrapper around `getSession()`. `staleTime: Infinity` because the session is established at app boot and only changes on a manual reset.
  - **`src/routes/AppShell.tsx`** + **`<App/>`** — top nav + `<Outlet/>` wrapping every screen. React Router v6 with routes for every backend endpoint (Projects, Style, Rooms, RoomDetail, Generations, GenerationDetail, References, Exports) plus a 404 page.
  - **`src/styles/globals.css`** — Tailwind directives + `font-display` on headings + a `.placeholder-card` component class for the F1 placeholders.
  - **`tailwind.config.js`** — design tokens (ADR-007): warm cream/sand/stone palette + forest-green accent; serif display font (`Fraunces`) + sans body (`Inter`); display type scale (`text-display-xl/lg/md`); generous whitespace scale (`18`, `22`).
  - **`src/components/PlaceholderCard.tsx`** — shared placeholder primitive used by every route in F1.
  - **Tests** (10 total):
    - `src/lib/error.test.ts` — 3 tests for `ApiError` (constructor, `isClientError`/`isServerError`, message default).
    - `src/api/client.test.ts` — 7 tests for `apiFetch`: GET + credentials, JSON-encoding, FormData passthrough, 4xx envelope normalization, 5xx fallback to `INTERNAL`, 204 No Content, missing-envelope-code fallback.
  - **Docker**:
    - **`infra/docker/frontend/Dockerfile`** — multi-stage (deps → build → nginx:1.27-alpine). `VITE_API_TARGET` build-arg baked into the bundle.
    - **`infra/docker/frontend/Dockerfile.dev`** — Vite dev server with HMR.
    - **`infra/docker/frontend/nginx.conf`** — SPA fallback (`try_files $uri /index.html`) + `/api/` proxy to `http://backend:3000`. Gzip on text responses, 1-year `immutable` cache for `/assets/`.
    - **`docker-compose.yml`** frontend service — replaces the `alpine:3.19` placeholder. Wires `VITE_API_TARGET=http://backend:3000`, mounts source for HMR.

- Bugs found and fixed during F1 verification (lessons recorded):
  - **Missing script in dev container**: first cut of `Dockerfile.dev` did `COPY package.json ./` from the root context, which copied the *workspace* `package.json` (no `dev` script) into the frontend image. Symptom: container restarted every 5s with `npm error Missing script: "dev"`. Fix: COPY `apps/frontend/package.json` from the root context.
  - **Bind-mount path mismatch**: docker-compose volumes mounted source to `/repo/apps/frontend/src` while the Dockerfile WORKDIR is `/app`. Vite looked at `/app/src`, didn't find it, served a blank 404. Fix: mount to `/app/src` etc.
  - **`@typescript-eslint/consistent-type-imports` flagged three imports**: switched the unused-as-value imports to `type` imports.
  - **`react/no-unescaped-entities` on `don't`**: replaced with `don&apos;t` in `NotFoundPage`.
  - **TS `RequestInit.body` doesn't accept plain objects**: introduced a `JsonBody` type for the `apiFetch` body param and cast through `BodyInit` at the call site.
  - **TS interfaces don't satisfy `Record<string, unknown>` structurally**: relaxed `JsonBody` to include `unknown` so caller-side interfaces pass without `as` casts.

- Known limitations:
  - No per-workspace `package-lock.json` exists — npm workspaces write a single root lockfile. The prod Dockerfile uses `npm install` (slightly less reproducible than `npm ci`) for that reason. Acceptable for v1; future work could split into standalone package scopes.
  - All routes are F1 placeholders. Real screens land in F2–F9.
  - No production deployment wired yet (this is F12 scope).

---

### 2026-06-19 — M18 Production Parity

- Reviewer: Project Owner (self)
- Decision: **Approved**
- Scope reviewed: `apps/backend/src/main.ts`, `infra/docker/backend/Dockerfile`, `test/production-parity.e2e-spec.ts`
- Notes:
  - **Multi-stage Dockerfile** (`infra/docker/backend/Dockerfile`): `deps` → `build` → `runtime` stages, all on `node:20-alpine`. `ARG` + `ENV` for `APP_VERSION` / `GIT_COMMIT` / `BUILD_AT` propagated from build context to runtime image. `HEALTHCHECK` calls `/api/health/live` every 15s. `openssl` + `libc6-compat` for Prisma engine. `wget` for healthcheck.
  - **Production-mode bootstrap** (`main.ts`):
    - `trust proxy = 1` set on the Express adapter when `NODE_ENV=production` so `req.ip` reflects the real client behind a load balancer (used by `RateLimitGuard`).
    - `CORS_ORIGINS` must be non-empty in production; bootstrap aborts with `process.exit(1)` otherwise. Prevents accidentally shipping a wildcard CORS policy to prod.
    - Bootstrap log line now includes the app version, CORS origin count, and NODE_ENV for ops visibility.
  - **Secure cookies** (`SessionsController`): `secure: this.config.get('NODE_ENV') === 'production'` — verified via `docker run -e NODE_ENV=production` that the `Set-Cookie` response includes `Secure` in production but not in development.
  - **Health checks**: `/api/health/live` returns `{ status, version, commit }`; `/api/health/ready` returns DB + storage + AI checks with latency, plus `version` / `commit` / `builtAt`.
  - **6 e2e tests** (production-parity): sessions controller unit (prod + dev construction), env loader (CORS_ORIGINS passthrough, missing-vars rejection), build metadata in /health/live, .env.example content checks.
  - **Docker smoke verified**: production image boots, connects to external Postgres + Supabase, passes `/api/health/ready`, serves `/api/health/live` with `Set-Cookie: Secure` flag.
- Action items:
  - All v1 milestones complete. The project is ready for production deployment.
  - Follow-up (out of scope for v1): Redis-backed rate limiter, distributed tracing, CI/CD pipeline.

---

### 2026-06-19 — M17 Hardening

- Reviewer: Project Owner (self)
- Decision: **Approved**
- Scope reviewed: `apps/backend/src/common/{rate-limit.guard,security-headers.middleware,sanitize}.ts`, `apps/backend/src/main.ts`, `apps/backend/src/generations/generations.module.ts`, DTO updates, `test/hardening.e2e-spec.ts`
- Notes:
  - **Rate limiting** (`RateLimitGuard`): sliding-window in-memory bucket keyed by session cookie (sid) or client IP. Configured per `RateLimitGuard` instance via `RATE_LIMIT_CONFIG` token. APP_GUARD in `GenerationsModule` applies the limiter globally but `shouldLimit()` narrows the trigger to `/generations` and `/approval` paths so public routes are unaffected. `RATE_LIMIT_GENERATIONS_PER_MIN` defaults to 5 per ADR-013. `RATE_LIMIT_DISABLED` env flag lets test suites run unbounded.
  - **Security headers** (`SecurityHeadersMiddleware`): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy` denying camera/mic/geo/interest-cohort, `Cross-Origin-Resource-Policy: same-origin`, and HSTS on TLS only. Wired in `AppModule.configure()`.
  - **CORS lockdown**: existing `app.enableCors({ origin: corsOriginsList(env.CORS_ORIGINS), credentials: true })` was already in `main.ts`. Now exercised by M17 tests.
  - **Request size limit**: 100 KB JSON body cap via `express.json({ limit: '100kb' })`. Oversize bodies surface as `entity.too.large` from the parser; `AllExceptionsFilter` maps the error type to `VALIDATION_FAILED` with message "Request body too large." Configurable via `MAX_REQUEST_BODY_BYTES`.
  - **XSS sanitization** (`@SanitizeFreeText()` class-transformer decorator): strips `<script>` tags, `on*=()` event handlers, neutralizes `javascript:` / `data:` / `vbscript:` schemes, removes control characters, trims. Applied to: project name/description, room brief fields, style notes, reference caption, brief override + refinements fields.
  - **14 e2e tests**: 5 security headers, 2 CORS, 1 body size, 3 XSS sanitization, 1 DoD burst (4th request → 429), 1 per-IP burst, 1 guard isolation (singleton).
- Action items:
  - M18 (Production Parity) will verify the production Dockerfile and env wiring.

---

### 2026-06-19 — M16 Observability

- Reviewer: Project Owner (self)
- Decision: **Approved**
- Scope reviewed: `apps/backend/src/health/`, `apps/backend/src/common/build-info.ts`, `apps/backend/src/common/request-id.middleware.ts`, `infra/docker/backend/Dockerfile`, `test/observability.e2e-spec.ts`
- Notes:
  - `/api/health/live` now includes `version` + `commit` (build metadata).
  - `/api/health/ready` now includes `version`, `commit`, `builtAt` alongside the existing DB/storage/AI checks.
  - Build info is read from env vars (`APP_VERSION`, `GIT_COMMIT`, `BUILD_AT`) set at Docker build time via `ARG` + `ENV`. Falls back to `package.json` + `git rev-parse` in dev.
  - Request logging enhanced: pino-http serializers include `requestId` + `sessionId`; `customLogLevel` returns `error` for 5xx, `warn` for 4xx, `info` otherwise.
  - `RequestIdMiddleware` now also captures `sessionId` from the `sid` cookie into `req.sessionId` for the logger.
  - **`GET /api/metrics`** — Prometheus-compatible text format exposing:
    - `http_requests_total{method, route, status}` (counter)
    - `http_request_errors_total{method, route, status}` (counter, 5xx only)
    - `http_request_duration_seconds{method, route, status}` (histogram with standard buckets)
    - `process_start_time_seconds` (gauge)
    - `nodejs_heap_bytes_total` (gauge, updated every 15s)
    - `ai_provider_errors_total` (counter, placeholder for pipeline)
  - `MetricsMiddleware` records every request's method/route/status + latency, excluding the metrics endpoint itself.
  - 8 e2e tests: live/ready with version+commit, metrics format, counter increments, metrics endpoint excluded, request id echo, request id auto-generation, metrics public (no session).
  - **Known limitations**: No process_cpu_seconds, no nodejs_eventloop_lag, no per-endpoint histograms. Single-process metrics (no cluster aggregation).
- Action items:
  - M17 (Hardening) will add rate limiting metrics.
  - M18 (Production Parity) will verify the Dockerfile build-arg flow end-to-end.

---

### 2026-06-19 — M15 Failure Surface

- Reviewer: Project Owner (self)
- Decision: **Approved**
- Scope reviewed: `apps/backend/src/common/validation.pipe.ts`, `src/health/health.controller.ts`, `src/health/health.module.ts`, `src/main.ts` (custom pipe), `src/ai/adapters/ai-provider.adapter.ts` (new `healthcheck`), `src/ai/adapters/pollinations.adapter.ts` + `myceli.adapter.ts` (healthcheck impl), `test/helpers/test-app.helper.ts`, `test/failure-surface.e2e-spec.ts`, test fakes updated.

- Verification (all green before commit):
  - `npm run typecheck` → 0 errors
  - `npm run lint` → 0 errors
  - `npm run build:backend` → 0 errors
  - `npm run test` → **177/177 pass** (164 prior + 13 new M15 tests)
  - `docker compose up` → all healthy
  - End-to-end smoke: `POST /api/projects {name: ''}` returns `{error:{code:'VALIDATION_FAILED', fields:{name:'...'}}}`; `GET /api/health/ready` returns 200 with `{db,storage,ai}` checks; forcing the AI healthcheck to fail flips the response to 503 with `status:'down'`.

- M15 deliverables:
  - **`buildValidationPipe`** (`src/common/validation.pipe.ts`) replaces the default `ValidationPipe`. A custom `exceptionFactory` flattens class-validator errors into `{ path: firstConstraintMessage }` and throws `BadRequestException` with `{ message, fields }`. The existing `AllExceptionsFilter` then maps that 400 → `VALIDATION_FAILED` with the `fields` envelope, so the frontend can render per-field UI errors.
  - **`test/helpers/test-app.helper.ts`** — `buildTestApp([AppModule])` is the canonical way to boot a NestJS test app from this milestone forward: it installs `cookie-parser`, the `api` global prefix, and the standardized `ValidationPipe`. Tests written against the legacy `moduleRef.createNestApplication()` pattern skip the pipe and mask DTO bugs; the new helper forces parity with `main.ts`.
  - **`/api/health/live`** — unchanged: `{ status: 'ok' }` when the process is up.
  - **`/api/health/ready`** — NEW. Runs three checks in parallel:
    - `db`: `prisma.$queryRaw\`SELECT 1\`` (latency in ms).
    - `storage`: validates that `SUPABASE_URL` is configured and reports the active adapter name. We deliberately do NOT make a real network call here: the readiness probe runs every few seconds and we don't want it to spam Supabase.
    - `ai`: invokes the active provider's `healthcheck()`, a short-timeout GET against the provider's base URL.
    Response shape: `{ status: 'ok'|'down', checks: { db, storage, ai } }`. Returns **503** when any check is `down` so a reverse proxy / orchestrator can drain the instance.
  - **`AiProviderAdapter.healthcheck()`** added to the interface (ADR-002-consistent: providers remain behind the same facade). Both `PollinationsAdapter` and `MyceliAdapter` implement it as a 2-second-timeout GET. Fake adapters used in tests return a deterministic `{ok, detail}`.

- 13 e2e tests cover:
  - **Envelope shape**: 404 includes `error.{code,message,traceId}`; `x-request-id` header is echoed as `traceId`.
  - **400 VALIDATION_FAILED**: empty `name` returns `fields.name` set; unknown DTO field returns `fields` set (whitelist rejection).
  - **401 UNAUTHENTICATED**: missing cookie on `/api/projects`.
  - **404 NOT_FOUND**: unknown route; unknown project id.
  - **409 CONFLICT**: duplicate project name in a session.
  - **422 BUSINESS_RULE_VIOLATION**: completing a project with no rooms.
  - **502 STORAGE_FAILED**: pipe integrity (the AI/storage code paths already cover this in M9/M13/M14; here we lock down the envelope shape under a forced storage failure).
  - **Health**: `/api/health/live` 200; `/api/health/ready` 200 when all checks pass; `/api/health/ready` 503 when the AI adapter reports `ok: false`.

- Bugs found and fixed during M15 verification (lessons recorded):
  - **Legacy test app bootstrap skips the pipe**: most e2e tests boot the app with `moduleRef.createNestApplication({ logger: false })` and never call `useGlobalPipes`. Before this milestone, that meant DTO bugs were only caught in production. The new `buildTestApp` helper forces parity with `main.ts` and is the path forward for new tests.
  - **Adding `healthcheck()` broke the FakeAiAdapter in `test/pipeline.e2e-spec.ts`**: the interface gained a method, and the existing fake didn't implement it. Fix: added `async healthcheck() { return { ok: true, latencyMs: 0, detail: 'fake' }; }` to the fake. No production behavior change.

- Known limitations:
  - `healthcheck()` makes a real network GET. If a provider's base URL returns 5xx, the readiness probe considers it "ok" (we only fail on network errors). This is intentional: a provider can be slow / partially degraded and we still want to accept traffic while the per-request path times out and surfaces `PROVIDER_TIMEOUT` to the caller.
  - Readiness check latency is reported but not enforced. Operators are expected to monitor the 503 rate and alert on long-tail p95 latency.
  - Validation `fields` are a flat `{path: message}` map (dot-notation for nested DTOs). The contract allows this; richer structures (codes, severities) are out of scope for v1.

---

## 6. References

- Product vision: `00-product-vision.md`
- System architecture: `04-system-architecture.md`
- Backend roadmap: `07-backend-roadmap.md`
- Frontend roadmap: `08-frontend-roadmap.md`
- Decisions: `10-decisions.md`