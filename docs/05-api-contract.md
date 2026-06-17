# API Contract — AI Interior Design Journey Builder

## Purpose

This document defines the HTTP API exposed by the NestJS backend. It is the contract the frontend builds against and the contract the backend must satisfy. All endpoints return JSON. All errors use the standardized error envelope defined in §2.

The contract follows the user journey in `01-user-journey.md` and the business rules in `03-business-rules.md`. It is **not** a database schema; the schema is defined in `06-database-design.md`.

---

## 1. Conventions

### 1.1 Base URL

```text
http://localhost:3000/api          (development)
https://<host>/api                 (production)
```

### 1.2 Authentication

- No login. Every request must carry a valid session cookie (`sid`).
- The session cookie is `httpOnly`, `Secure` (in production), `SameSite=Lax`.
- Missing or invalid session → `401 UNAUTHENTICATED`.

### 1.3 Content Types

- Request: `application/json`.
- Response: `application/json; charset=utf-8`.

### 1.4 Versioning

- The base path includes the version (`/api/v1/...`) only when breaking changes occur.
- v1 contract below omits an explicit version segment for readability; the runtime path is `/api/...`.

### 1.5 IDs

- All entity IDs are UUID v4 unless explicitly noted.
- Session IDs are opaque server-generated strings.

### 1.6 Timestamps

- All timestamps are ISO 8601 UTC strings (`2026-06-17T08:30:00.000Z`).

---

## 2. Error Envelope

All non-2xx responses share this shape:

```json
{
  "error": {
    "code": "PROVIDER_TIMEOUT",
    "message": "The image provider did not respond in time.",
    "traceId": "req_01HXXX..."
  }
}
```

### 2.1 Standard Error Codes

| HTTP | Code                       | Meaning                                                |
|------|----------------------------|--------------------------------------------------------|
| 400  | `VALIDATION_FAILED`        | DTO validation error. Details in `error.fields`.       |
| 400  | `PROMPT_INVALID`           | Brief content failed semantic validation.              |
| 401  | `UNAUTHENTICATED`          | Missing or invalid session cookie.                     |
| 403  | `FORBIDDEN`                | Session does not own the resource.                     |
| 404  | `NOT_FOUND`                | Resource does not exist or is not visible.             |
| 409  | `CONFLICT`                 | State transition not allowed (e.g., approving a non-`COMPLETED` generation). |
| 422  | `BUSINESS_RULE_VIOLATION`  | Domain invariant violated (e.g., project not complete).|
| 502  | `PROVIDER_TIMEOUT`         | AI provider exceeded timeout.                          |
| 502  | `PROVIDER_REJECTED`        | Provider returned 4xx / refused request.               |
| 502  | `PROVIDER_BROKEN`          | Provider returned malformed response.                  |
| 502  | `STORAGE_FAILED`           | Upload to storage failed.                              |
| 500  | `INTERNAL`                 | Unclassified server-side failure.                      |

Validation errors may include `error.fields: Record<string, string>` mapping field path → human message.

---

## 3. Session

### 3.1 Get Current Session

```text
GET /api/session
```

Response `200`:

```json
{
  "sessionId": "s_01HXXX...",
  "createdAt": "2026-06-17T08:30:00.000Z"
}
```

If the cookie is absent, the backend issues a new session and returns the same shape with `Set-Cookie: sid=...`.

---

## 4. Projects

### 4.1 List Projects

```text
GET /api/projects
```

Response `200`:

```json
{
  "items": [
    {
      "id": "uuid",
      "name": "My Dream House",
      "description": "...",
      "status": "IN_PROGRESS",
      "createdAt": "...",
      "updatedAt": "...",
      "completedAt": null
    }
  ]
}
```

### 4.2 Create Project

```text
POST /api/projects
```

Request:

```json
{
  "name": "My Dream House",
  "description": "Optional"
}
```

Validation:

- `name`: required, 1–80 chars.
- `description`: optional, ≤ 1000 chars.

Response `201`: Project object (see 4.5).

### 4.3 Get Project

```text
GET /api/projects/:projectId
```

Includes embedded `styleProfile`, list of `rooms` (summary), and `completion` flags.

Response `200`:

```json
{
  "id": "uuid",
  "name": "...",
  "description": "...",
  "status": "DRAFT",
  "styleProfile": { "id": "uuid", "styleKey": "JAPANDI", "styleNotes": null },
  "rooms": [
    {
      "id": "uuid",
      "roomType": "LIVING_ROOM",
      "status": "IN_REVIEW",
      "approvedGenerationId": null,
      "updatedAt": "..."
    }
  ],
  "createdAt": "...",
  "updatedAt": "...",
  "completedAt": null
}
```

### 4.4 Update Project

```text
PATCH /api/projects/:projectId
```

Request (partial):

```json
{ "name": "Renamed", "description": "..." }
```

### 4.5 Project Status Transitions

```text
POST /api/projects/:projectId/complete
POST /api/projects/:projectId/reopen
```

- `complete`: requires all rooms `APPROVED`; transitions to `COMPLETED`.
- `reopen`: transitions `COMPLETED` → `IN_PROGRESS` without clearing approvals.

---

## 5. Style Profile

### 5.1 Get Style Profile

```text
GET /api/projects/:projectId/style
```

### 5.2 Set / Replace Style Profile

```text
PUT /api/projects/:projectId/style
```

Request:

```json
{
  "styleKey": "JAPANDI",
  "styleNotes": "Warm wood tones, low furniture, lots of plants."
}
```

`styleKey` must be one of the predefined enum values.

Validation:

- `styleKey`: required, enum.
- `styleNotes`: optional, ≤ 1000 chars.

---

## 6. Style Catalog

### 6.1 List Available Styles

```text
GET /api/styles
```

Response:

```json
{
  "items": [
    {
      "key": "JAPANDI",
      "name": "Japandi",
      "description": "A blend of Japanese minimalism and Scandinavian warmth.",
      "colorTendencies": ["warm white", "oak", "charcoal"],
      "materialTendencies": ["light wood", "linen", "ceramic"]
    }
  ]
}
```

This endpoint is read-only and not session-scoped (cached).

---

## 7. Rooms

### 7.1 List Rooms (per Project)

```text
GET /api/projects/:projectId/rooms
```

### 7.2 Add Room

```text
POST /api/projects/:projectId/rooms
```

Request:

```json
{ "roomType": "LIVING_ROOM" }
```

`roomType` must be one of the predefined enum values. Same `roomType` cannot be added twice.

Response `201`: Room object including empty `designBrief`.

### 7.3 Get Room

```text
GET /api/rooms/:roomId
```

Includes:

- `designBrief`.
- `generations` summary (most recent batch).
- `approvedGenerationId`.
- `references` summary.
- `consistencyAnchor` (if project has approved rooms).

### 7.4 Update Design Brief

```text
PUT /api/rooms/:roomId/brief
```

Request:

```json
{
  "purpose": "Family relaxation and entertaining.",
  "occupants": "2 adults, 1 child, 1 cat.",
  "lightingPreferences": "Warm ambient, ample natural.",
  "furnitureRequirements": "Large sofa, low coffee table, TV unit.",
  "constraints": "Avoid leather."
}
```

Field length caps per rule B-01.

Editing a brief of an `APPROVED` room transitions it back to `IN_REVIEW` (rule B-03).

### 7.5 Room Approval

```text
POST /api/rooms/:roomId/approval
```

Request:

```json
{ "generationId": "uuid" }
```

Server validates:

- `generationId` belongs to the room.
- `generation.status === COMPLETED`.

Response `200`: updated Room with `status = APPROVED`.

### 7.6 Re-Open Room

```text
POST /api/rooms/:roomId/reopen
```

Transitions `APPROVED` → `IN_REVIEW` without clearing `approvedGenerationId` (UI may hide it).

---

## 8. Generations

### 8.1 Generate Concepts (Start Batch)

```text
POST /api/rooms/:roomId/generations
```

Request (intent only — no composed prompt from client):

```json
{
  "briefOverride": {
    "purpose": "...",
    "occupants": "...",
    "lightingPreferences": "...",
    "furnitureRequirements": "...",
    "constraints": "..."
  },
  "parentGenerationId": null,
  "refinements": null
}
```

Validation:

- `briefOverride`: optional; if present, must pass B-01 length caps.
- `parentGenerationId`: optional UUID; if present, must belong to the same room.
- `refinements`: optional structured object describing deltas (colors, objects, furniture, materials, lighting, layout, style_emphasis). Server translates these into a composed prompt.

Server behavior:

- Creates a `batch_id` with 3 Generation records (`PENDING` → `PROCESSING`).
- Composes prompt server-side from project style, room type, brief, refinements, and consistency anchor.
- Awaits all three or returns a status snapshot if processing is long.

Response `200` (synchronous success path — typical case under 90s):

```json
{
  "batchId": "uuid",
  "items": [
    {
      "id": "uuid",
      "optionIndex": 1,
      "status": "COMPLETED",
      "imageUrl": "https://...",
      "parentGenerationId": null,
      "errorCode": null,
      "errorMessage": null,
      "createdAt": "..."
    },
    {
      "id": "uuid",
      "optionIndex": 2,
      "status": "COMPLETED",
      "imageUrl": "https://...",
      "parentGenerationId": null,
      "errorCode": null,
      "errorMessage": null,
      "createdAt": "..."
    },
    {
      "id": "uuid",
      "optionIndex": 3,
      "status": "COMPLETED",
      "imageUrl": "https://...",
      "parentGenerationId": null,
      "errorCode": null,
      "errorMessage": null,
      "createdAt": "..."
    }
  ]
}
```

If the batch exceeds the synchronous window, the server returns `202 Accepted` with a snapshot and the client polls the batch endpoint (8.2) until terminal.

Failure cases inside a batch:

- Individual failure → that option is `FAILED` with `errorCode` and `errorMessage`.
- Whole-batch failure (e.g., brief invalid) → `400 PROMPT_INVALID` or `502 PROVIDER_*` as applicable.

### 8.2 Get Batch Status

```text
GET /api/rooms/:roomId/generations/batches/:batchId
```

Response: same shape as 8.1 success body.

### 8.3 Get Generation Lineage

```text
GET /api/generations/:generationId/lineage
```

Response:

```json
{
  "root": { "id": "uuid", "createdAt": "...", "optionIndex": 1 },
  "ancestors": [
    { "id": "uuid", "createdAt": "...", "optionIndex": 1 }
  ],
  "descendants": [
    { "id": "uuid", "createdAt": "...", "optionIndex": 1 }
  ]
}
```

### 8.4 Retry Batch

```text
POST /api/rooms/:roomId/generations/retry
```

Request:

```json
{ "batchId": "uuid" }
```

Creates a new batch using the same brief and (if applicable) the same parent. Does not mutate prior `FAILED` records.

---

## 9. References

### 9.1 List References

```text
GET /api/rooms/:roomId/references
```

### 9.2 Add Reference (Generated)

```text
POST /api/rooms/:roomId/references
```

Request:

```json
{
  "sourceType": "GENERATED",
  "sourceId": "<generationId>",
  "caption": "Inspiration for master bedroom."
}
```

### 9.3 Add Reference (External URL)

```text
POST /api/rooms/:roomId/references
```

Request:

```json
{
  "sourceType": "EXTERNAL_URL",
  "externalUrl": "https://...",
  "caption": "Houzz article"
}
```

### 9.3a Add Reference (Upload)

```text
POST /api/rooms/:roomId/references
Content-Type: multipart/form-data
```

Multipart fields:

| Field         | Type    | Required | Notes                                          |
|---------------|---------|----------|------------------------------------------------|
| `file`        | file    | yes      | JPEG / PNG / WebP, ≤ 10 MB (rules SG-06).      |
| `caption`     | text    | no       | ≤ 500 chars.                                   |

Server behavior:

- Validates MIME type and size (rule SG-06); failure → `400 UPLOAD_REJECTED`.
- Uploads the file to storage under `references/{projectId}/{roomId}/{referenceId}/{filename}`.
- Persists a Reference row with `source_type=UPLOADED`, `storage_object_key`, `mime_type`, `byte_size`, `original_filename`.
- Returns the Reference with a short-TTL signed URL for the client to display.

### 9.4 Delete Reference

```text
DELETE /api/references/:referenceId
```

---

## 10. Exports

### 10.1 Create Export Bundle

```text
POST /api/projects/:projectId/exports
```

Requires `project.status === COMPLETED`.

Server behavior:

- Assembles the bundle (per ADR-010 ZIP structure):
  ```text
  bundle.zip
  ├── project-summary.json
  ├── style-profile.json
  ├── approved-images/<room-slug>.png
  ├── references/<reference-id>.json   (+ binary files for UPLOADED references)
  ├── prompts/<room-slug>.json
  └── room-notes/<room-slug>.md
  ```
- Uploads the ZIP to storage at `exports/projects/{projectId}/v{version}.zip`.
- Persists an `ExportBundle` row with the new `version` and `storage_object_key`.

Response `201`:

```json
{
  "id": "uuid",
  "version": 3,
  "byteSize": 1234567,
  "downloadUrl": "https://...signed...",
  "downloadUrlExpiresAt": "2026-06-17T10:00:00.000Z",
  "createdAt": "..."
}
```

### 10.2 List Export Bundles

```text
GET /api/projects/:projectId/exports
```

Response:

```json
{
  "items": [
    {
      "id": "uuid",
      "version": 3,
      "byteSize": 1234567,
      "createdAt": "..."
    }
  ]
}
```

### 10.3 Get Export Bundle Metadata

```text
GET /api/exports/:bundleId
```

Returns the manifest (the `payload` jsonb) plus the signed `downloadUrl` with TTL.

```json
{
  "id": "uuid",
  "version": 3,
  "byteSize": 1234567,
  "createdAt": "...",
  "manifest": {
    "project": { "id": "uuid", "name": "...", "description": "..." },
    "files": [
      { "path": "approved-images/living-room.png", "byteSize": 234567 },
      { "path": "project-summary.json", "byteSize": 1234 }
    ]
  },
  "downloadUrl": "https://...signed...",
  "downloadUrlExpiresAt": "2026-06-17T10:00:00.000Z"
}
```

The ZIP itself is fetched via `downloadUrl`; it is **not** returned inline.

---

## 11. Health

### 11.1 Liveness

```text
GET /api/health/live
```

Response `200`: `{ "status": "ok" }`.

### 11.2 Readiness

```text
GET /api/health/ready
```

Response `200`: `{ "status": "ok", "checks": { "db": "ok", "storage": "ok", "ai": "ok" } }`.

Returns `503` if any check fails.

---

## 12. Rate Limiting & Quotas

- Per-session soft rate limit on `POST /api/rooms/:roomId/generations` (e.g., 1 concurrent batch per room).
- Per-IP rate limit on AI-touching endpoints (configured via reverse proxy).
- Excess returns `429 RATE_LIMITED`.

---

## 13. CORS

- Development: `http://localhost:5173`.
- Production: explicit origin list from env `CORS_ORIGINS`.
- Credentials enabled; methods restricted to GET/POST/PUT/PATCH/DELETE.

---

## 14. Versioning Notes

Breaking changes will be introduced under `/api/v2/...`. The v1 contract above is frozen for v1; additions that are non-breaking (new optional fields) may be added in place with an ADR.

---

## 15. References

- Product vision: `00-product-vision.md`
- User journey: `01-user-journey.md`
- Domain model: `02-domain-model.md`
- Business rules: `03-business-rules.md`
- System architecture: `04-system-architecture.md`
- Database design: `06-database-design.md`
