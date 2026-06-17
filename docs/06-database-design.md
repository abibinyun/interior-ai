# Database Design — AI Interior Design Journey Builder

## Purpose

This document projects the domain model (`02-domain-model.md`) into a relational schema (PostgreSQL via Prisma). Every table here corresponds to an entity or a domain concept. Every column here corresponds to an attribute. Foreign keys preserve the relationships and the lineage chain.

This is the **schema of record**. Any change requires an ADR entry in `10-decisions.md`.

---

## 1. Conventions

- **Database**: PostgreSQL 16.
- **ORM**: Prisma.
- **Primary keys**: `uuid` (Postgres `uuid` type, generated server-side).
- **Timestamps**: `timestamptz` (UTC).
- **Soft enums**: stored as `text` with `CHECK` constraint OR as Postgres `ENUM` type. **Decision**: use Postgres `ENUM` types for status fields; use `text` + Zod validation for free-form enums (e.g., `style_key`) to allow evolution without migrations.
- **Session isolation**: enforced in repositories, not at the SQL layer only. Indexes exist to support isolation queries (`session_id`, `(project_id, session_id)`).
- **Money / counts**: not modeled in v1.
- **Migrations**: every schema change ships with a Prisma migration. No manual SQL on production.

---

## 2. Entity-Relationship Diagram

```text
sessions
   │ 1
   │
   │ N
projects ──── style_profiles (1:1)
   │ 1
   │
   │ N
rooms ────── design_briefs (1:1)
   │ 1
   │
   │ N
generations ── (parent_generation_id) ── generations
   │ (batch_id) ─── 3 rows per batch
   │
   │ N
references

projects ──── export_bundles (1:N, versioned)
```

---

## 3. Tables

### 3.1 `sessions`

| Column         | Type         | Constraints                          |
|----------------|--------------|--------------------------------------|
| id             | text         | PK. Server-issued opaque ID.         |
| created_at     | timestamptz  | NOT NULL DEFAULT now().              |
| last_seen_at   | timestamptz  | NOT NULL DEFAULT now().              |

Notes:

- No PII. No email.
- TTL is handled at application layer (cookie expiry); the row is not hard-deleted in v1.

---

### 3.2 `projects`

| Column        | Type         | Constraints                                            |
|---------------|--------------|--------------------------------------------------------|
| id            | uuid         | PK DEFAULT gen_random_uuid().                          |
| session_id    | text         | NOT NULL, FK → sessions(id) ON DELETE CASCADE.         |
| name          | text         | NOT NULL, CHECK (char_length(trim(name)) BETWEEN 1 AND 80). |
| description   | text         | NULL, CHECK (description IS NULL OR char_length(description) <= 1000). |
| status        | project_status | NOT NULL DEFAULT 'DRAFT'.                            |
| created_at    | timestamptz  | NOT NULL DEFAULT now().                                |
| updated_at    | timestamptz  | NOT NULL DEFAULT now().                                |
| completed_at  | timestamptz  | NULL.                                                  |

Enum `project_status`: `DRAFT | IN_PROGRESS | COMPLETED`.

Indexes:

- `(session_id, created_at DESC)` — list projects for session.
- `(session_id, name)` — uniqueness inside a session.

---

### 3.3 `style_profiles`

| Column                | Type         | Constraints                                            |
|-----------------------|--------------|--------------------------------------------------------|
| id                    | uuid         | PK.                                                    |
| project_id            | uuid         | NOT NULL UNIQUE, FK → projects(id) ON DELETE CASCADE.  |
| style_key             | text         | NOT NULL, CHECK (style_key IN ('JAPANDI','SCANDINAVIAN','INDUSTRIAL','MODERN_MINIMALIST','CONTEMPORARY_LUXURY')). |
| style_notes           | text         | NULL, CHECK (style_notes IS NULL OR char_length(style_notes) <= 1000). |
| color_tendencies_json  | jsonb        | NULL.                                                  |
| material_prefs_json   | jsonb        | NULL.                                                  |
| created_at            | timestamptz  | NOT NULL DEFAULT now().                                |
| updated_at            | timestamptz  | NOT NULL DEFAULT now().                                |

Notes:

- `UNIQUE(project_id)` enforces ST-01 (1:1).
- `style_key` uses text+CHECK (not enum) to allow adding styles without a migration.

---

### 3.4 `rooms`

| Column                  | Type         | Constraints                                                  |
|-------------------------|--------------|--------------------------------------------------------------|
| id                      | uuid         | PK.                                                          |
| project_id              | uuid         | NOT NULL, FK → projects(id) ON DELETE CASCADE.               |
| room_type               | text         | NOT NULL, CHECK (room_type IN ('LIVING_ROOM','DINING_ROOM','KITCHEN','MASTER_BEDROOM','BATHROOM','WORKSPACE')). |
| status                  | room_status  | NOT NULL DEFAULT 'BRIEF_DRAFT'.                              |
| approved_generation_id  | uuid         | NULL.                                                        |
| created_at              | timestamptz  | NOT NULL DEFAULT now().                                      |
| updated_at              | timestamptz  | NOT NULL DEFAULT now().                                      |

Enum `room_status`: `BRIEF_DRAFT | GENERATING | IN_REVIEW | APPROVED`.

Indexes / constraints:

- `UNIQUE (project_id, room_type)` — enforces R-03.
- `CHECK (approved_generation_id IS NULL OR status = 'APPROVED')` — enforces R-07/A-03.

---

### 3.5 `design_briefs`

| Column                  | Type         | Constraints                                                  |
|-------------------------|--------------|--------------------------------------------------------------|
| id                      | uuid         | PK.                                                          |
| room_id                 | uuid         | NOT NULL UNIQUE, FK → rooms(id) ON DELETE CASCADE.           |
| purpose                 | text         | NULL, CHECK (purpose IS NULL OR char_length(purpose) <= 1000). |
| occupants               | text         | NULL, CHECK (occupants IS NULL OR char_length(occupants) <= 500). |
| lighting_preferences    | text         | NULL, CHECK (lighting_preferences IS NULL OR char_length(lighting_preferences) <= 500). |
| furniture_requirements  | text         | NULL, CHECK (furniture_requirements IS NULL OR char_length(furniture_requirements) <= 1000). |
| constraints             | text         | NULL, CHECK (constraints IS NULL OR char_length(constraints) <= 1000). |
| created_at              | timestamptz  | NOT NULL DEFAULT now().                                      |
| updated_at              | timestamptz  | NOT NULL DEFAULT now().                                      |

`UNIQUE(room_id)` enforces B-/R-04 (1:1).

---

### 3.6 `generations`

| Column                  | Type             | Constraints                                                |
|-------------------------|------------------|------------------------------------------------------------|
| id                      | uuid             | PK.                                                        |
| room_id                 | uuid             | NOT NULL, FK → rooms(id) ON DELETE CASCADE.               |
| batch_id                | uuid             | NOT NULL.                                                  |
| option_index            | smallint         | NOT NULL, CHECK (option_index BETWEEN 1 AND 3).            |
| parent_generation_id    | uuid             | NULL, FK → generations(id) ON DELETE SET NULL.            |
| prompt                  | text             | NOT NULL, CHECK (char_length(prompt) BETWEEN 10 AND 4000). |
| negative_prompt         | text             | NULL.                                                      |
| image_url               | text             | NULL (set only after successful storage upload).          |
| storage_object_key      | text             | NULL (set only after successful storage upload).          |
| status                  | generation_status| NOT NULL DEFAULT 'PENDING'.                               |
| error_code              | text             | NULL.                                                      |
| error_message           | text             | NULL.                                                      |
| created_at              | timestamptz      | NOT NULL DEFAULT now().                                    |
| updated_at              | timestamptz      | NOT NULL DEFAULT now().                                    |

Enum `generation_status`: `PENDING | PROCESSING | COMPLETED | FAILED`.

Indexes:

- `(room_id, created_at DESC)` — list generations by room.
- `(batch_id)` — fetch a batch.
- `(parent_generation_id)` — lineage queries.
- `(status)` — queue/sweeper queries (defensive even without a worker).

Constraints:

- `CHECK (parent_generation_id <> id)` — prevents self-parent.
- `CHECK ((status IN ('COMPLETED','FAILED')) OR (image_url IS NULL AND storage_object_key IS NULL))` — enforces G-08 / SG-01.
- `CHECK ((status = 'COMPLETED') = (image_url IS NOT NULL))` — when `COMPLETED`, image_url must be present.

---

### 3.7 `references`

| Column              | Type        | Constraints                                                  |
|---------------------|-------------|--------------------------------------------------------------|
| id                  | uuid        | PK.                                                          |
| room_id             | uuid        | NOT NULL, FK → rooms(id) ON DELETE CASCADE.                  |
| source_type         | text        | NOT NULL, CHECK (source_type IN ('GENERATED','UPLOADED','EXTERNAL_URL')). |
| source_id           | uuid        | NULL, FK → generations(id) ON DELETE SET NULL.               |
| storage_object_key  | text        | NULL.                                                        |
| external_url        | text        | NULL.                                                        |
| mime_type           | text        | NULL.                                                        |
| byte_size           | bigint      | NULL.                                                        |
| original_filename   | text        | NULL.                                                        |
| caption             | text        | NULL, CHECK (caption IS NULL OR char_length(caption) <= 500). |
| created_at          | timestamptz | NOT NULL DEFAULT now().                                      |

Constraints:

- `CHECK ((source_type = 'GENERATED') = (source_id IS NOT NULL))`.
- `CHECK ((source_type = 'EXTERNAL_URL') = (external_url IS NOT NULL))`.
- `CHECK ((source_type = 'UPLOADED') = (storage_object_key IS NOT NULL))`.
- `CHECK ((source_type = 'UPLOADED') = (mime_type IS NOT NULL))`.
- `CHECK ((source_type = 'UPLOADED') = (byte_size IS NOT NULL AND byte_size > 0 AND byte_size <= 10485760))` (10 MB cap per SG-06).
- `CHECK (mime_type IS NULL OR mime_type IN ('image/jpeg','image/png','image/webp'))`.

---

### 3.8 `export_bundles`

| Column              | Type        | Constraints                                       |
|---------------------|-------------|---------------------------------------------------|
| id                  | uuid        | PK.                                               |
| project_id          | uuid        | NOT NULL, FK → projects(id) ON DELETE CASCADE.    |
| version             | integer     | NOT NULL, CHECK (version >= 1).                   |
| storage_object_key  | text        | NOT NULL.                                         |
| byte_size           | bigint      | NOT NULL, CHECK (byte_size > 0).                  |
| payload             | jsonb       | NOT NULL.                                         |
| created_at          | timestamptz | NOT NULL DEFAULT now().                           |

Indexes / constraints:

- `UNIQUE (project_id, version)` — enforces E-02 (append-only).
- Partial index on `(project_id, created_at DESC)` for listing.

Notes:

- The bundle payload (jsonb) is a **manifest** describing the contents of the ZIP stored under `storage_object_key`. The ZIP is not stored inline in the row.

---

## 4. Session Isolation at the Data Layer

Repositories always include `session_id` in WHERE clauses. Recommended patterns:

- `WHERE r.id = :roomId AND EXISTS (SELECT 1 FROM projects p WHERE p.id = r.project_id AND p.session_id = :sessionId)`.
- For high-traffic queries, denormalize `session_id` into child tables as a defensive column (planned for v1 — see §6).

For v1, isolation is enforced by repository code with a `forSession(sessionId)` guard. Foreign-key navigation alone is **not** relied upon for isolation.

---

## 5. Indexes Summary

| Index                                            | Purpose                          |
|--------------------------------------------------|----------------------------------|
| `sessions(id)`                                   | PK                              |
| `projects(session_id, created_at DESC)`          | Project listing                 |
| `projects(session_id, name)` UNIQUE              | Session-scoped uniqueness       |
| `style_profiles(project_id)` UNIQUE              | 1:1 enforcement                 |
| `rooms(project_id, room_type)` UNIQUE            | R-03                            |
| `design_briefs(room_id)` UNIQUE                  | 1:1 enforcement                 |
| `generations(room_id, created_at DESC)`          | Room gallery                    |
| `generations(batch_id)`                          | Batch lookup                    |
| `generations(parent_generation_id)`              | Lineage traversal               |
| `generations(status)`                            | Defensive sweeper queries       |
| `references(room_id)`                            | Reference listing               |
| `export_bundles(project_id, version)` UNIQUE     | Append-only version uniqueness  |
| `export_bundles(project_id, created_at DESC)`    | Listing                         |

---

## 6. Defensive Denormalization (Approved)

To make isolation queries cheap and safe, **denormalize `session_id`** into child tables (ADR-005). The denormalized column mirrors the owner session and is maintained by **Postgres triggers**, not by application code, so it stays correct even if a code path bypasses Prisma.

Tables to denormalize:

- `rooms.session_id` (mirror of `projects.session_id`).
- `generations.session_id` (mirror of `rooms.session_id` → `projects.session_id`).
- `references.session_id` (mirror of `rooms.session_id` → `projects.session_id`).
- `export_bundles.session_id` (mirror of `projects.session_id`).

### 6.1 Trigger Skeleton

```sql
-- Maintain rooms.session_id from projects.session_id
CREATE OR REPLACE FUNCTION rooms_sync_session_id()
RETURNS TRIGGER AS $$
BEGIN
  SELECT session_id INTO NEW.session_id
  FROM projects WHERE id = NEW.project_id;
  IF NEW.session_id IS NULL THEN
    RAISE EXCEPTION 'project % not found', NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rooms_session_id
BEFORE INSERT OR UPDATE OF project_id ON rooms
FOR EACH ROW EXECUTE FUNCTION rooms_sync_session_id();
```

Equivalent triggers are required for `generations`, `references`, and `export_bundles`, walking the FK chain to `projects`.

### 6.2 Tradeoffs

- (+) Cheaper, safer session-scoped reads.
- (+) Independent defense layer if FK joins are accidentally omitted in a query.
- (+) Trigger-based sync is decoupled from application code paths.
- (-) Adds a small migration cost; the cost is amortized over v1.

---

## 7. Migrations Strategy

- All schema changes via `prisma migrate`.
- Each migration has a descriptive name (`add_export_bundles`, `add_generations_batch_id`).
- Never edit a migration that has been applied to a shared environment.
- Forward-only migrations; rollback is via a new migration.

---

## 8. Sample Queries (for backend reference)

### 8.1 Fetch all projects for a session

```sql
SELECT id, name, description, status, created_at, updated_at, completed_at
FROM projects
WHERE session_id = $1
ORDER BY created_at DESC;
```

### 8.2 Fetch room with approved generation

```sql
SELECT r.*, g.image_url AS approved_image_url, g.prompt AS approved_prompt
FROM rooms r
LEFT JOIN generations g ON g.id = r.approved_generation_id
WHERE r.id = $1
  AND r.session_id = $2;
```

### 8.3 Fetch generation lineage (ancestors)

```sql
WITH RECURSIVE ancestors AS (
  SELECT id, parent_generation_id, created_at, option_index, 0 AS depth
  FROM generations
  WHERE id = $1
  UNION ALL
  SELECT g.id, g.parent_generation_id, g.created_at, g.option_index, a.depth + 1
  FROM generations g
  JOIN ancestors a ON g.id = a.parent_generation_id
)
SELECT * FROM ancestors ORDER BY depth ASC;
```

### 8.4 Compute consistency anchor (server-side)

```sql
SELECT g.prompt, r.room_type
FROM rooms r
JOIN generations g ON g.id = r.approved_generation_id
WHERE r.project_id = $1
ORDER BY r.updated_at ASC;
```

(Server assembles anchor in application code from this result; no SQL concatenation.)

---

## 9. Data Retention

- v1 has no automatic deletion.
- Sessions, projects, generations, references, and export bundles persist indefinitely in v1.
- Storage objects persist as long as their `Generation` row exists.

---

## 10. References

- Product vision: `00-product-vision.md`
- Domain model: `02-domain-model.md`
- Business rules: `03-business-rules.md`
- System architecture: `04-system-architecture.md`
- API contract: `05-api-contract.md`
