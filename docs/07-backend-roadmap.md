# Backend Roadmap — AI Interior Design Journey Builder

## Purpose

This document is the **milestone-based implementation plan** for the NestJS backend. Each milestone is independently reviewable, ships production-aligned code (no throwaway), and follows the dependency order. Milestones are not skipped; each must be reviewed and approved before the next begins.

This plan follows the engineering rules in the master brief: backend first, local-first through Docker, incremental delivery with stop-and-review.

---

## 1. Strategy

```text
M1  Foundation          → monorepo, backend skeleton, docker, CI lint
M2  Persistence         → Prisma schema, migrations, base repositories
M3  Session             → session issuance, guard, isolation primitives
M4  Project + Style     → project and style profile modules
M5  Rooms + Briefs      → room module, design brief module
M6  AI Provider Adapter → provider interface + 1 concrete adapter
M7  Storage Adapter     → storage interface + Supabase adapter
M8  Generations Core    → batch creation, status state machine
M9  Generation Pipeline → end-to-end generate: prompt → provider → storage → DB
M10 Refinement          → parent_generation lineage, refinements endpoint
M11 Consistency Anchor  → server-computed anchor for subsequent rooms
M12 Approval            → room approval flow
M13 References          → generated and external URL references
M14 Export Bundle       → bundle assembly and versioning
M15 Failure Surface     → error envelope, status codes, health checks
M16 Observability       → structured logs, request ID, basic metrics
M17 Hardening           → rate limiting, validation depth, security headers
M18 Production Parity   → multi-stage Dockerfile, prod env wiring
```

Each milestone ends with: **STOP → explain changes → wait for approval**.

---

## 2. Dependency Order

```text
M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8 → M9 → M10 → M11 → M12 → M13 → M14 → M15 → M16 → M17 → M18
```

Branching / parallel work is permitted **only** for independent adapter spikes (e.g., M6 and M7 can be developed in parallel after M5), but each is its own review checkpoint.

---

## 3. Milestones

---

### M1 — Foundation

**Objective**: Establish the monorepo skeleton, backend bootstrap, Docker Compose, and engineering tooling.

**Scope**

- Monorepo layout (see `04-system-architecture.md` §3.1).
- NestJS app scaffold with strict TypeScript.
- ESLint, Prettier, `lint`, `test`, `build` scripts.
- `docker-compose.yml` with `postgres`, `backend` (dev), `frontend` placeholder.
- `.env.example` and Zod-validated env loader.
- Pino logger with request ID.
- `AllExceptionsFilter` skeleton returning the standardized error envelope (no domain mapping yet).

**Out of Scope**

- No domain modules.
- No database.
- No frontend code.

**DoD**

- `docker compose up` starts the backend on `:3000` with `/api/health/live` returning `200`.
- Lint passes, build passes.
- README documents the `up` command.

---

### M2 — Persistence

**Objective**: Set up Prisma + PostgreSQL with the schema in `06-database-design.md`.

**Scope**

- Add Prisma; configure `schema.prisma` with all entities and enums.
- Initial migration; verify on a clean DB.
- Defensive denormalization of `session_id` (per §6 of DB design) — include from start.
- Indexes per DB design §5.
- `PrismaService` shared module.
- Base `BaseRepository` with `forSession(sessionId)` guard.

**Out of Scope**

- No HTTP endpoints yet beyond `/api/health/live`.

**DoD**

- `prisma migrate deploy` runs cleanly from empty DB.
- Repositories compile; sample query (list sessions) returns expected shape in a temporary debug endpoint.
- `CHECK` constraints validated by inserting a deliberately-bad row.

---

### M3 — Session

**Objective**: Issue, resolve, and validate session identifiers.

**Scope**

- `SessionModule` (controller + service + repository).
- `SessionGuard` (global).
- Cookie issuance via `Set-Cookie` per rule S-03.
- `GET /api/session` endpoint.

**Out of Scope**

- No project logic yet.

**DoD**

- `GET /api/session` on a fresh browser creates a session and sets `sid` cookie.
- Subsequent requests without cookie → `401 UNAUTHENTICATED`.
- Subsequent requests with cookie → `200` and same `sessionId`.

---

### M4 — Project + Style

**Objective**: Implement project and style profile modules.

**Scope**

- `ProjectsModule` (CRUD, lifecycle transitions `complete` / `reopen`).
- `StyleModule` (set/get style profile per project).
- `StylesModule` (read-only catalog endpoint `GET /api/styles`).
- Hardcoded style catalog in code (data seed deferred to M4.x).
- DTOs with validation per API contract §4, §5, §6.

**Out of Scope**

- No rooms yet.
- No AI yet.

**DoD**

- `POST /api/projects`, `GET /api/projects`, `GET /api/projects/:id`, `PATCH /api/projects/:id` work end-to-end.
- `PUT /api/projects/:id/style` enforces ST-01..ST-05.
- Cross-session access returns `403 FORBIDDEN`.

---

### M5 — Rooms + Briefs

**Objective**: Implement room and design brief modules.

**Scope**

- `RoomsModule` (add room, list rooms, get room).
- Design brief edit endpoint.
- R-03 enforcement (unique `room_type` per project).
- R-04 (1:1 brief).

**Out of Scope**

- No generations.
- No references yet.

**DoD**

- Room created with empty brief; brief updateable.
- Editing brief on `APPROVED` room transitions to `IN_REVIEW` (B-03).

---

### M6 — AI Provider Adapter

**Objective**: Provider-agnostic generation interface + concrete adapters.

**Scope**

- `AiProviderModule` with `AiProviderAdapter` interface (per architecture §3.4).
- Concrete `PollinationsAdapter` (primary per ADR-002).
- Concrete `MyceliAdapter` (fallback per ADR-002; may be invoked once per AI-07 on transient primary failure).
- Configuration via env (`AI_PROVIDER`, provider-specific keys).
- Internal timeout (target 60s, hard 90s).
- Internal error mapping to `error_code` enum from rules §11.
- Unit tests with a fake adapter and a recorded HTTP fixture.

**Out of Scope**

- No additional providers in v1.
- No controller endpoint — the adapter is consumed by M8/M9 only.

**DoD**

- Adapter interface compiles; both adapters return a `Buffer` for a fixed prompt in unit tests.
- Adapter maps provider HTTP errors to the internal error codes correctly.

---

### M7 — Storage Adapter

**Objective**: Storage-agnostic interface + Supabase adapter.

**Scope**

- `StorageModule` with `StorageAdapter` interface (per architecture §3.5).
- Concrete `SupabaseStorageAdapter` (object key naming convention: `projects/{projectId}/rooms/{roomId}/generations/{generationId}.{ext}`).
- Signed URL support for read access.
- Delete method.

**Out of Scope**

- No upload endpoint yet (no UPLOADED reference source in v1).

**DoD**

- Adapter unit test uploads a buffer and returns a public URL via Supabase (test project).
- Adapter maps S3-compatible errors to `STORAGE_FAILED`.

---

### M8 — Generations Core

**Objective**: Generation batch creation and status state machine.

**Scope**

- `GenerationsModule` with batch creation endpoint `POST /api/rooms/:roomId/generations`.
- Creates 3 Generation records with shared `batch_id`.
- Initial status `PENDING`.
- Status transitions PENDING → PROCESSING → (COMPLETED|FAILED).
- Repository enforces immutability after terminal states.
- `GET /api/rooms/:roomId/generations/batches/:batchId`.

**Out of Scope**

- No AI calls yet (returns `PENDING` records and lets M9 wire them).
- No image URLs yet.

**DoD**

- Calling the endpoint creates 3 Generation rows with shared `batch_id` and `option_index` 1/2/3.
- Terminal state rows reject further updates (test by trying to mutate `status` after `COMPLETED`).

---

### M9 — Generation Pipeline

**Objective**: End-to-end generation: prompt composition → provider → storage → DB.

**Scope**

- Prompt composition service:
  - Pulls `StyleProfile.style_key`, `Room.room_type`, `DesignBrief` fields.
  - Composes a single `composedPrompt` string per project conventions.
  - Stores the composed prompt on each Generation row.
- Pipeline: for each of the 3 Generation rows:
  - Call AI adapter → image `Buffer`.
  - Upload to storage → public URL.
  - Update row to `COMPLETED` with `image_url` and `storage_object_key`.
- On any failure (per option): row goes to `FAILED` with stable `error_code` and `error_message`.
- Synchronous response by default; 202 + polling endpoint ready for long-tail cases.

**Out of Scope**

- No refinements yet (covered M10).
- No consistency anchor yet (M11).

**DoD**

- Real end-to-end run: 3 options appear with stable `image_url`s pointing to Supabase storage.
- Provider timeout → all 3 rows `FAILED` with `PROVIDER_TIMEOUT`.
- Provider URL never persisted as `image_url`.

---

### M10 — Refinement

**Objective**: Refinement endpoint and lineage tracking.

**Scope**

- Accept `parentGenerationId` and structured `refinements` object.
- Create a new batch with 3 new Generation rows, each with `parent_generation_id` set.
- `GET /api/generations/:id/lineage` returns ancestors and descendants (recursive CTE in repository).

**Out of Scope**

- No semantic translation of refinements yet (basic prompt composition that appends refinement descriptors).

**DoD**

- Refinement creates lineage: root → child → grandchild navigable via `/lineage`.

---

### M11 — Consistency Anchor ✅ Completed 2026-06-18

**Objective**: Server-computed anchor injected into subsequent rooms' prompts.

**Scope**

- Anchor computation service per ADR-011 and rule CA-05:
  - Pull `StyleProfile.style_key` + truncated `style_notes`.
  - For each approved room in the project, append the approved Generation's `prompt` (truncated).
  - Concatenate with separators.
- Inject anchor into composed prompt for non-approved rooms in the same project.
- Anchor is read-only and never returned to client as raw editable input.

**DoD**

- Two-room project: room 2's generated images visibly follow the style of room 1 (manual visual check + log inspection).
- Removing room 1 approval and approving room 2 instead yields an updated anchor.

---

### M12 — Approval ✅ Completed 2026-06-18

**Objective**: Room approval flow and consistency anchor recomputation.

**Scope**

- `POST /api/rooms/:roomId/approval` endpoint with rules A-01..A-03.
- Trigger anchor recomputation on approval change.

**DoD**

- Approving a `COMPLETED` generation sets `approved_generation_id` and status `APPROVED`.
- Re-approving with a different generation replaces pointer; old record unchanged.
- Approving a `FAILED` generation → `409 CONFLICT`.

---

### M13 — References ✅ Completed 2026-06-18

**Objective**: Reference management for all three source types.

**Scope**

- Reference add/list/delete per API contract §9.
- `source_type=GENERATED` validation: FK to a Generation owned by same room.
- `source_type=EXTERNAL_URL` validation: well-formed URL.
- `source_type=UPLOADED` validation (Q5):
  - Multipart upload endpoint.
  - MIME and size validation (rule SG-06).
  - Storage object key naming: `references/{projectId}/{roomId}/{referenceId}/{filename}`.
  - Signed URL generation for client display.
  - `error_code=UPLOAD_REJECTED` on validation failure.

**DoD**

- Adding a reference to a generation in another room → `403 FORBIDDEN` (session-isolation regression test).
- Uploading a 12 MB file → `400 UPLOAD_REJECTED` (without persisting partial state).
- Uploaded references are visible in the room reference list via short-TTL signed URLs.

---

### M14 — Export Bundle

**Objective**: Assemble, store, and version ZIP export bundles.

**Scope**

- `ExportsModule` per API contract §10 and ADR-010.
- Bundle assembly: pulls project, style guide, rooms + approved generations, lineage, references, notes; writes a ZIP with the documented folder structure.
- ZIP is uploaded to storage at `exports/projects/{projectId}/v{version}.zip` (rule E-05).
- Append-only versioning (`UNIQUE (project_id, version)`).
- `manifest` (jsonb) describes ZIP contents and is returned by the GET endpoint.
- `POST /api/projects/:projectId/exports` requires `project.status = COMPLETED`.
- Signed download URL with short TTL (rule E-06).

**DoD**

- A completed project exports a valid ZIP; re-exporting produces version+1 with the same content (modulo `createdAt`).
- Bundle ZIP unzips on a reviewer's machine and contains all promised files.

---

### M15 — Failure Surface

**Objective**: Stabilize the public error envelope and health checks.

**Scope**

- `AllExceptionsFilter` complete mapping per architecture §3.7.
- Validation pipe global; field-level errors returned in `error.fields`.
- `/api/health/live` and `/api/health/ready` (DB + storage + AI reachability).

**DoD**

- Triggering each error code in `02 §2.1` returns the documented HTTP code and stable error envelope.

---

### M16 — Observability

**Objective**: Production-grade observability basics.

**Scope**

- Structured logs (pino) with request ID, session ID, route, status, latency.
- `/api/health/ready` extended with version + commit SHA.
- Optional: Prometheus metrics endpoint.

**DoD**

- Logs are JSON, one per request, include trace ID.
- Filtering by `traceId` reconstructs a single request flow.

---

### M17 — Hardening

**Objective**: Validation depth and security baselines.

**Scope**

- Rate limiting on AI-touching endpoints (per session, per IP).
- Helmet-equivalent security headers.
- CORS lockdown to configured origins.
- Request size limits.
- DTO XSS sanitization for free-text fields.

**DoD**

- Burst test: 5 concurrent `/generations` from one session → at most 1 active batch; excess returns `429 RATE_LIMITED`.

---

### M18 — Production Parity

**Objective**: Production-ready container and env wiring.

**Scope**

- Multi-stage Dockerfile for backend (build → runtime on alpine).
- Health checks wired into container.
- Production env schema (Zod).
- Production-mode CORS, cookies (`Secure`), logging.

**DoD**

- Production image boots, connects to external Postgres and Supabase, passes readiness, serves `/api/health/live`.

---

## 4. Per-Milestone Definition of Done

Every milestone is complete when:

- Code is committed (only when explicitly approved).
- Lint passes; typecheck passes; relevant tests pass.
- README section updated (if user-visible change).
- Manual smoke checklist executed (documented in `09-review-log.md`).

---

## 5. Risk Controls During Execution

- **AI integration drift** — adapter isolated; concrete adapters are testable in isolation.
- **Schema drift** — all changes via Prisma migrations; never edit runtime logic to compensate.
- **Cross-session leakage** — every repository method takes `sessionId`; integration tests cover cross-session denial.
- **Long generation latency** — synchronous with timeout; polling path ready (deferred activation).
- **Adapter unavailability** — mapped to stable error codes; UI states for every code.

---

## 6. References

- Product vision: `00-product-vision.md`
- User journey: `01-user-journey.md`
- Domain model: `02-domain-model.md`
- Business rules: `03-business-rules.md`
- System architecture: `04-system-architecture.md`
- API contract: `05-api-contract.md`
- Database design: `06-database-design.md`
- Frontend roadmap: `08-frontend-roadmap.md`
