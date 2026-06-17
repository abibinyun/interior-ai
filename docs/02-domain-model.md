# Domain Model — AI Interior Design Journey Builder

## Purpose

This document defines the business entities, their attributes, their relationships, and their lifecycle states. It is the **stable backbone** that all other documents reference. The schema in `06-database-design.md` is a direct projection of this model.

---

## 1. Domain Overview

```text
Session
   ↓ 1:N
Project
   ↓ 1:1
StyleProfile
   ↓ 1:N
Room
   ↓ 1:1
DesignBrief
   ↓ 1:N
Generation ── (parent_generation_id) ── Generation  (self-reference)
   ↓ 0..1
ApprovedDesign (per Room)
   ↓
ExportBundle (per Project, versioned)
```

Two cross-cutting concepts:

- **Reference** — inspiration material attached to a Room.
- **ExportBundle** — final snapshot artifact for a Project.

---

## 2. Entities

### 2.1 Session

Represents an anonymous visitor.

| Field         | Type     | Notes                                  |
|---------------|----------|----------------------------------------|
| id            | string   | Server-generated, secure random.       |
| created_at    | datetime | Set on first visit.                    |
| last_seen_at  | datetime | Updated on each request.               |

Notes:

- No PII. No email. No password.
- Sessions are isolated by `session_id`. Cross-session access is forbidden.

---

### 2.2 Project

Represents one full-house design journey.

| Field         | Type     | Notes                                         |
|---------------|----------|-----------------------------------------------|
| id            | uuid     | Primary key.                                  |
| session_id    | string   | Owner session.                                |
| name          | string   | 1–80 chars.                                   |
| description   | text     | Optional, ≤ 1000 chars.                       |
| status        | enum     | `DRAFT` \| `IN_PROGRESS` \| `COMPLETED`.       |
| created_at    | datetime |                                               |
| updated_at    | datetime |                                               |
| completed_at  | datetime | Set on transition to `COMPLETED`. Nullable.   |

Invariants:

- A project is always owned by exactly one session.
- A project name is unique only within a session (not globally).

---

### 2.3 StyleProfile

Global design language for a project.

| Field                | Type   | Notes                                                |
|----------------------|--------|------------------------------------------------------|
| id                   | uuid   | Primary key.                                         |
| project_id           | uuid   | 1:1 with Project.                                    |
| style_key            | enum   | One of the predefined style keys (see below).        |
| style_notes          | text   | Free-text remarks (user preferences).                |
| color_tendencies     | text   | Optional curated color hints (JSON text).            |
| material_preferences | text   | Optional curated material hints (JSON text).         |
| created_at           | datetime |                                                    |
| updated_at           | datetime |                                                    |

Predefined `style_key` values:

| Key                     | Display Name        |
|-------------------------|---------------------|
| `JAPANDI`               | Japandi             |
| `SCANDINAVIAN`          | Scandinavian        |
| `INDUSTRIAL`            | Industrial          |
| `MODERN_MINIMALIST`     | Modern Minimalist   |
| `CONTEMPORARY_LUXURY`   | Contemporary Luxury |

Invariants:

- Exactly one StyleProfile per Project (1:1).
- StyleProfile may be edited in place; changes are timestamped.

---

### 2.4 Room

A room inside a project.

| Field             | Type     | Notes                                          |
|-------------------|----------|------------------------------------------------|
| id                | uuid     | Primary key.                                   |
| project_id        | uuid     | Owner project.                                 |
| room_type         | enum     | One of predefined room types (see below).      |
| status            | enum     | `BRIEF_DRAFT` \| `GENERATING` \| `IN_REVIEW` \| `APPROVED`. |
| approved_generation_id | uuid | Nullable; FK to Generation.                |
| created_at        | datetime |                                                |
| updated_at        | datetime |                                                |

Predefined `room_type` values:

| Key               | Display Name   |
|-------------------|----------------|
| `LIVING_ROOM`     | Living Room    |
| `DINING_ROOM`     | Dining Room    |
| `KITCHEN`         | Kitchen        |
| `MASTER_BEDROOM`  | Master Bedroom |
| `BATHROOM`        | Bathroom       |
| `WORKSPACE`       | Workspace      |

Invariants:

- A Room belongs to exactly one Project.
- Same `room_type` may appear at most once per Project.
- `approved_generation_id` is set only when status is `APPROVED`.

---

### 2.5 DesignBrief

Captures the per-room requirements.

| Field                  | Type   | Notes                                      |
|------------------------|--------|--------------------------------------------|
| id                     | uuid   | Primary key.                               |
| room_id                | uuid   | 1:1 with Room.                             |
| purpose                | text   | Free-text.                                 |
| occupants              | text   | Free-text.                                 |
| lighting_preferences   | text   | Free-text.                                 |
| furniture_requirements | text   | Free-text.                                 |
| constraints            | text   | Free-text.                                 |
| created_at             | datetime |                                          |
| updated_at             | datetime |                                          |

Invariants:

- Exactly one DesignBrief per Room (1:1).
- Brief may be updated any time before approval.

---

### 2.6 Generation

A single AI-generated design iteration attached to a Room.

| Field                | Type      | Notes                                                |
|----------------------|-----------|------------------------------------------------------|
| id                   | uuid      | Primary key.                                         |
| room_id              | uuid      | Owning room.                                         |
| batch_id             | uuid      | Groups the three options from a single Generate call. |
| option_index         | int       | 1, 2, or 3 within the batch.                         |
| parent_generation_id | uuid      | Nullable. Set on refinement.                         |
| prompt               | text      | The composed prompt sent to the provider.            |
| negative_prompt      | text      | Optional, provider-dependent.                        |
| image_url            | text      | Application-controlled storage URL. Nullable until success. |
| status               | enum      | `PENDING` \| `PROCESSING` \| `COMPLETED` \| `FAILED`. |
| error_code           | text      | Nullable.                                            |
| error_message        | text      | Nullable.                                            |
| created_at           | datetime  |                                                      |
| updated_at           | datetime  |                                                      |

Invariants:

- A Generation is immutable once `COMPLETED` or `FAILED` (no field edits after terminal state).
- `parent_generation_id` is set only for refinement generations.
- All three Generation records in a `batch_id` share the same composed prompt context except for the variation parameter that distinguishes A/B/C.

---

### 2.7 ApprovedDesign

Logical pointer to the approved Generation for a Room.

This is **not** a separate table; it is the `approved_generation_id` field on `Room` (see 2.4). It is listed here as a logical concept for clarity.

Invariants:

- At most one ApprovedDesign per Room.
- Re-approval replaces the pointer; the prior approved Generation remains in history.

---

### 2.8 Reference

Inspiration material attached to a Room.

| Field         | Type     | Notes                                                |
|---------------|----------|------------------------------------------------------|
| id            | uuid     | Primary key.                                         |
| room_id       | uuid     | Owning room.                                         |
| source_type   | enum     | `GENERATED` \| `UPLOADED` \| `EXTERNAL_URL`.         |
| source_id     | uuid     | Nullable. FK to Generation if `source_type=GENERATED`. |
| storage_object_key | text | Nullable. Set when `source_type=UPLOADED`. Stores the namespaced object key of the uploaded file in application storage. |
| external_url  | text     | Nullable. Used if `source_type=EXTERNAL_URL`.        |
| mime_type     | text     | Nullable. Set when `source_type=UPLOADED`.           |
| byte_size     | bigint   | Nullable. Set when `source_type=UPLOADED`.           |
| original_filename | text | Nullable. Set when `source_type=UPLOADED`.          |
| caption       | text     | Optional user note.                                  |
| created_at    | datetime |                                                      |

Invariants:

- A Reference belongs to exactly one Room.
- `source_type=GENERATED` references a Generation owned by the same Room.
- `source_type=UPLOADED` references a binary stored in application-controlled storage; the `image_url` exposed to the client is a signed URL with a short TTL (rule SG-04, see `03-business-rules.md`).
- `source_type=EXTERNAL_URL` references an external link and does not pass through application storage.

---

### 2.9 ExportBundle

Snapshot of a completed Project.

| Field            | Type     | Notes                                                  |
|------------------|----------|--------------------------------------------------------|
| id               | uuid     | Primary key.                                           |
| project_id       | uuid     | Owning project.                                        |
| version          | int      | Monotonically increasing per project.                  |
| storage_object_key | text   | Object key of the assembled ZIP in application storage. |
| byte_size        | bigint   | Size of the ZIP.                                       |
| payload          | jsonb    | Manifest of bundle contents (filenames, sizes, references). |
| created_at       | datetime |                                                        |

Invariants:

- ExportBundle is append-only.
- Re-export creates a new version; never overwrites.
- `payload` is a manifest, not the bundle contents. The ZIP itself is fetched via `storage_object_key`.

---

## 3. Lifecycle States

### 3.1 Project Status

```text
DRAFT
   ↓  (style profile set, OR at least one room added)
IN_PROGRESS
   ↓  (all in-scope rooms approved, user confirms)
COMPLETED
   ↑  (user re-opens for revisions)
```

### 3.2 Room Status

```text
BRIEF_DRAFT
   ↓  (Generate clicked)
GENERATING
   ↓  (batch completes)
IN_REVIEW
   ↓  (Approve clicked)
APPROVED
   ↑  (Re-design clicked)
```

### 3.3 Generation Status

```text
PENDING
   ↓
PROCESSING
   ↓
COMPLETED   |   FAILED
```

`COMPLETED` and `FAILED` are terminal. There is no automatic retry; retries are explicit user actions that create new Generation records.

---

## 4. Relationships

| From             | Cardinality | To               | Notes                          |
|------------------|-------------|------------------|--------------------------------|
| Session          | 1 : N       | Project          |                                |
| Project          | 1 : 1       | StyleProfile     |                                |
| Project          | 1 : N       | Room             |                                |
| Project          | 1 : N       | ExportBundle     | Versioned.                     |
| Room             | 1 : 1       | DesignBrief      |                                |
| Room             | 1 : N       | Generation       |                                |
| Room             | 1 : N       | Reference        |                                |
| Room             | 0..1 : 1    | Generation       | approved_generation_id         |
| Generation       | 0..1 : N    | Generation       | parent_generation_id (lineage) |
| Generation       | 1 : N       | Generation       | batch_id (3 per batch)         |

---

## 5. Cross-Cutting Concerns

### 5.1 Ownership & Isolation

Every record below `Session` carries `session_id` (denormalized for fast filtering) **or** a navigable chain to it (Project → Session). Repository layer must enforce isolation at query level.

### 5.2 Prompt Composition

The composed prompt for a Generation is built in the backend from:

```text
project.styleProfile.style_key
+ room.room_type
+ room.designBrief.* (purpose, occupants, lighting, furniture, constraints)
+ refinement.modifications (if parent_generation_id set)
+ style_notes (truncated to safe length)
+ consistency_anchor (summary of approved sibling rooms' design language)
```

The frontend never sees or composes prompts directly. The frontend posts intent; the backend composes the prompt.

### 5.3 Consistency Anchor

When at least one Room in a Project is approved, subsequent Generations inject a **consistency anchor** string into the composed prompt. The anchor is built server-side from:

1. `StyleProfile.style_key` and `style_notes` of the project.
2. `Generation.prompt` of each approved room in the project.

The anchor is computed by the backend and never trusted from the client. See ADR-011.

---

## 6. Domain Events (Logical)

| Event                   | Trigger                                  | Payload summary                       |
|-------------------------|------------------------------------------|---------------------------------------|
| `ProjectCreated`        | Project persisted.                       | project_id, session_id.               |
| `StyleProfileSet`       | StyleProfile first written.              | project_id, style_key.                |
| `RoomCreated`           | Room persisted.                          | project_id, room_id, room_type.       |
| `GenerationBatchStarted`| 3 Generation records created in PENDING. | batch_id, room_id.                    |
| `GenerationCompleted`   | A Generation reaches COMPLETED.          | generation_id, image_url.             |
| `GenerationFailed`      | A Generation reaches FAILED.             | generation_id, error_code.            |
| `RoomApproved`          | Room.approved_generation_id set.         | room_id, generation_id.               |
| `ProjectCompleted`      | Project transitions to COMPLETED.        | project_id.                           |
| `ExportBundleCreated`   | A new bundle version persisted.          | bundle_id, project_id, version.       |

These are **logical** events used in documentation and logging; v1 does not require a message bus.

---

## 7. Out of Model (v1)

The following are intentionally **not** modeled in v1:

- User account.
- Project sharing / collaboration.
- Comments / annotations on a Generation.
- Likes / favorites.
- Tagging.
- Provider routing rules.
- Billing.

---

## 8. References

- Product vision: `00-product-vision.md`
- User journey: `01-user-journey.md`
- Business rules: `03-business-rules.md`
- Database design (projection): `06-database-design.md`
