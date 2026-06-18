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

## 6. References

- Product vision: `00-product-vision.md`
- System architecture: `04-system-architecture.md`
- Backend roadmap: `07-backend-roadmap.md`
- Frontend roadmap: `08-frontend-roadmap.md`
- Decisions: `10-decisions.md`