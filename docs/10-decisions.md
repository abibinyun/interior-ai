# Decisions — AI Interior Design Journey Builder

## Purpose

This document records **Architecture Decision Records (ADRs)** in chronological order. Each ADR captures the context, considered options, decision, status, and tradeoffs. ADRs are append-only; reversing a decision requires a new ADR that supersedes the prior one.

---

## ADR-001 — Backend Topology: Modular Monolith

**Status**: Approved

**Context**

The product is a single-product web application in v1, owned by a small team, with a clear bounded context (project / room / generation). The question is whether to start as a monolith, modular monolith, or microservices from day one.

**Options Considered**

1. Single deployable Next.js-style monolith (frontend + backend + DB).
2. **Modular monolith NestJS** with feature modules, separate from frontend.
3. Microservices (one service per bounded context).

**Decision**

Option 2: NestJS modular monolith, deployed separately from the frontend.

**Tradeoffs**

- (+) Clear module boundaries via NestJS feature modules; easier to split later if needed.
- (+) Strict backend-first rule satisfied; frontend remains a thin consumer.
- (-) Requires discipline to avoid module creep.
- (-) If the product grows beyond v1, extraction work will be non-trivial (acceptable risk for v1).

---

## ADR-002 — AI Provider Routing in v1

**Status**: Approved

**Context**

The architecture abstracts providers behind an `AiProviderAdapter` interface. The question is which concrete provider(s) are wired in v1 and how fallback is handled.

**Decision**

- **Primary adapter**: Pollinations.
- **Fallback adapter**: Myceli.ai.
- Selection is controlled by env (`AI_PROVIDER`); the inactive adapter is present but not invoked under normal operation.

**Tradeoffs**

- (+) Adapter abstraction is exercised by the real fallback path, not just by tests.
- (+) Simpler ops; one provider active at a time.
- (-) No automatic failover in v1; user retry path is the recovery mechanism.

---

## ADR-003 — Database: PostgreSQL + Prisma

**Status**: Approved

**Context**

Need a relational store with strong typing, schema migrations, and stable tooling. The team's familiarity favors Prisma on top of PostgreSQL.

**Decision**

PostgreSQL 16 + Prisma. Schema is the projection of `02-domain-model.md` documented in `06-database-design.md`.

**Tradeoffs**

- (+) Strong typing, migration history, predictable performance.
- (+) Postgres features (`CHECK` constraints, recursive CTEs, `jsonb`) cover lineage and export payload needs.
- (-) Prisma can hide SQL cost; mitigation via repository pattern + occasional raw SQL where needed.

---

## ADR-004 — Storage: Supabase Storage

**Status**: Approved

**Context**

Need application-controlled image persistence independent of AI provider URLs.

**Decision**

Use Supabase Storage with a single bucket, namespaced object keys: `projects/{projectId}/rooms/{roomId}/generations/{generationId}.{ext}`.

**Tradeoffs**

- (+) Off-the-shelf S3-compatible storage with signed URL support.
- (+) Frees the backend from running an object store.
- (-) Cloud dependency outside Docker; mitigated by adapter interface (alternative storage can be added).

---

## ADR-005 — Defensive Denormalization of `session_id`

**Status**: Approved

**Context**

Cross-session leakage is the highest-severity risk (rule S-05). Relying solely on FK navigation for isolation is correct but adds query complexity to every read.

**Decision**

Denormalize `session_id` into `rooms`, `generations`, `references`, and `export_bundles` as a defensive column maintained via DB triggers or Prisma middleware. Indexes support fast session-scoped lookups.

**Tradeoffs**

- (+) Cheaper, safer session-scoped reads.
- (+) Independent defense layer if FK joins are accidentally omitted in a query.
- (-) Requires strict write discipline to keep the column in sync.
- (-) Adds a small migration cost.

Implementation: Postgres triggers preferred for v1 to avoid coupling denormalization to application code paths.

---

## ADR-006 — Frontend Bundler and Stack

**Status**: Approved (per master prompt)

**Context**

Frontend stack was mandated by the master prompt.

**Decision**

- React + TypeScript (functional components only).
- Vite as the bundler.
- TanStack Query for server state.
- React Router v6.
- Styling decision deferred to F1 (Tailwind vs CSS Modules) — see `09-review-log.md` Q7.

**Tradeoffs**

- (+) Vite's dev loop is fast; production builds are small.
- (+) TanStack Query removes most manual state management concerns.
- (-) Styling decision pending (low impact at this stage).

---

## ADR-007 — Session Identification Without Authentication

**Status**: Approved

**Context**

v1 has no user accounts. Users must still be isolated from each other.

**Decision**

Session-based identification via opaque, server-generated, CSPRNG-backed session ID delivered in an `httpOnly`, `Secure` (prod), `SameSite=Lax` cookie. No PII collected.

**Tradeoffs**

- (+) Zero-friction onboarding.
- (+) Simple model that meets the "multiple concurrent users" constraint.
- (-) Lost cookie = lost project. Documented as out-of-scope mitigation for v1.

---

## ADR-008 — Error Envelope

**Status**: Approved

**Context**

Frontend needs a stable error shape to render helpful UI states. Free-form errors (e.g., provider raw messages) are unsuitable.

**Decision**

Standardized envelope per `05-api-contract.md §2`:

```json
{ "error": { "code": "...", "message": "...", "traceId": "..." } }
```

Stable `code` values listed in the API contract; `message` is human-friendly; `traceId` enables log correlation.

**Tradeoffs**

- (+) Decouples frontend from provider-specific wording.
- (+) Trace correlation across frontend and backend logs.
- (-) Risk of new error codes creeping in uncontrolled; mitigated by review at API-contract changes.

---

## ADR-009 — Three-Option Generation Batch

**Status**: Approved

**Context**

A single option per Generate call forces the user into a binary accept/reject decision, which conflicts with the product's "exploration" intent (Step 4).

**Decision**

Every Generate action creates exactly 3 Generation records under one `batch_id`, indexed 1–3. The server composes the prompt with controlled variation across the three so they explore the option space rather than producing near-duplicates.

**Tradeoffs**

- (+) Encourages comparison, supports the product principle "one decision at a time."
- (-) Higher provider cost per generation; acceptable for free-tier usage at v1 scale.

**Variation strategy**

Final variation strategy is to be defined in M9 (e.g., varying one or two semantic anchors such as layout density or accent color while keeping the style profile constant).

---

## ADR-010 — Export Bundle Format

**Status**: Approved

**Context**

The export bundle is the final artifact (Step 9). The format affects portability and reviewability.

**Decision**

Export is a **ZIP archive** containing:

```text
bundle.zip
├── project-summary.json
├── style-profile.json
├── approved-images/
│   ├── <room-slug>.png
│   └── ...
├── references/
│   ├── <reference-id>.json        (metadata)
│   └── .../                       (binary assets for UPLOADED references)
├── prompts/
│   ├── <room-slug>.json           (per-room approved prompt + lineage)
│   └── ...
└── room-notes/
    ├── <room-slug>.md             (per-room design notes)
    └── ...
```

The endpoint returns a signed URL to the assembled bundle.

**Tradeoffs**

- (+) ZIP preserves binary assets alongside structured metadata.
- (+) Reviewers can unzip and navigate without the live product.
- (-) Slightly larger payload than a JSON-only export; acceptable given the value of preserved images.
- (-) Future PDF derivative (v2) will be generated from this ZIP's contents.

---

## ADR-011 — Consistency Anchor Strategy

**Status**: Approved

**Context**

The product's "consistency engine" principle requires that later rooms follow earlier approved rooms' design language. The anchor mechanism must be server-computed, opaque to the client, and non-bypassable.

**Decision**

Anchor = a server-computed string composed of:

1. The project's `StyleProfile.style_key` + `style_notes` (truncated to a safe length).
2. The approved `Generation.prompt` of each approved room in the project (truncated and concatenated with separators).

The anchor is injected into the composed prompt of subsequent (non-approved) rooms in the same project. It is read-only and never returned to the client as a raw editable input.

**Out of Scope (v1)**

- Image embeddings.
- Vector similarity engine.

**Future (v2)**

- Image embeddings may be introduced; would replace or augment the prompt-text anchor.

**Tradeoffs**

- (+) Works with any provider.
- (+) Server-side only; cannot be bypassed.
- (+) Aligns with the existing ADR-004 storage strategy (no new infrastructure).
- (-) Anchor quality depends on prompt text only; image-based anchor would be more accurate but adds infrastructure not justified in v1.

---

## ADR-012 — Storage Bucket Strategy

**Status**: Approved

**Context**

Should the v1 deployment use one public bucket for all environments, or one bucket per environment?

**Decision**

One bucket per environment, selected by env config:

| Environment | Bucket name         |
|-------------|---------------------|
| dev         | `interior-dev`      |
| staging     | `interior-staging`  |
| prod        | `interior-prod`     |

Object keys are additionally namespaced by environment prefix (`{env}/projects/{projectId}/...`).

**Tradeoffs**

- (+) Blast-radius isolation between environments.
- (+) Dev experiments cannot leak into prod bucket.
- (+) Easier cleanup of an environment by deleting one bucket.
- (-) Slightly more env wiring; mitigated by a single `STORAGE_BUCKET` env var.

---

## ADR-013 — Rate Limiting Strategy

**Status**: Proposed

**Context**

Generation endpoints are expensive (provider calls + storage upload). Without limits, a single session could exhaust free-tier quota or starve other users.

**Decision (proposed)**

- Per-session: at most 1 active generation batch per room.
- Per-IP: token-bucket at the reverse proxy level (configurable; default tuned to free-tier reality).
- Excess returns `429 RATE_LIMITED`.

**Tradeoffs**

- (+) Predictable resource use.
- (+) Honest user-facing message; recovery path (wait) is clear.
- (-) Adds a small amount of operational config.

## ADR-014 — Generation Batch Trigger (deferred to M11)

**Status**: **Approved** (implemented in M11)

**Context**

`POST /api/rooms/:roomId/generations` creates 3 PENDING Generation rows and updates the room to GENERATING, but did **not** auto-trigger `PipelineOrchestrator.runBatch`. Real users saw batches stuck in PENDING indefinitely.

**Decision**

`PipelineOrchestrator.runBatch` now begins with `SELECT ... FOR UPDATE SKIP LOCKED` inside a transaction and atomically transitions claimed rows to `PROCESSING`. `GenerationsService.startBatch` calls `void this.pipeline.runBatch(batchId)` after creating rows, gated by an `ENABLE_GENERATION_AUTO_TRIGGER` env flag (default `true`; tests set it to `false` to avoid races).

**Implementation** (apps/backend/src/generations/pipeline-orchestrator.ts):

```sql
SELECT id, room_id, prompt, negative_prompt
FROM generations
WHERE batch_id = $1::uuid AND status = 'PENDING'
FOR UPDATE SKIP LOCKED
-- then immediately: UPDATE generations SET status='PROCESSING' WHERE id IN (...)
```

Concurrent invocations safely no-op on already-claimed rows. The transaction holds the row locks for the entire claim + status-transition, so two callers cannot race to PROCESSING.

**Tradeoffs (final)**

- (+) Zero new infra dependencies (no queue, no Redis, no separate worker).
- (+) Honest production semantics: a real user clicking "Generate" actually drives the pipeline through the HTTP path.
- (+) The auto-trigger is fire-and-forget — the HTTP response returns immediately with the 3 PENDING rows; the caller polls for status.
- (-) The fire-and-forget call is still subject to Node.js event-loop blockages during the 60–90s AI call. Mitigation: the orchestration is asynchronous and per-row so a single batch's slow generation doesn't block other requests.
- (+) Tests can disable the auto-trigger via `ENABLE_GENERATION_AUTO_TRIGGER=false` and drive the pipeline explicitly.

**Status**: Approved.

---

## References

- Product vision: `00-product-vision.md`
- System architecture: `04-system-architecture.md`
- Database design: `06-database-design.md`
- API contract: `05-api-contract.md`
- Review log: `09-review-log.md`
