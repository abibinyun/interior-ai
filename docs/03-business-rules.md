# Business Rules — AI Interior Design Journey Builder

## Purpose

This document captures the **invariants, policies, and procedural rules** that the system must enforce. Where the domain model defines *what exists*, this document defines *what must be true* and *what must happen* in response to actions.

Rules here are authoritative for backend implementation. Any change requires an ADR entry in `10-decisions.md`.

---

## 1. Session & Identity Rules

| ID    | Rule                                                                            |
|-------|---------------------------------------------------------------------------------|
| S-01  | Every request must carry a valid session identifier.                           |
| S-02  | Session ID is generated server-side using a CSPRNG (≥ 128 bits of entropy).     |
| S-03  | Session ID is delivered to the client via `httpOnly`, `Secure`, `SameSite=Lax` cookie. |
| S-04  | Session ID is never exposed in URLs, query strings, or logs at info level.      |
| S-05  | A session may not access records owned by another session, under any path.     |
| S-06  | Ownership is enforced at the repository / query layer, not in controllers.      |

---

## 2. Project Rules

| ID    | Rule                                                                                  |
|-------|---------------------------------------------------------------------------------------|
| P-01  | A project belongs to exactly one session.                                            |
| P-02  | Project name is required, 1–80 chars, trimmed.                                       |
| P-03  | Project description is optional, ≤ 1000 chars.                                       |
| P-04  | Project name uniqueness is scoped to the owning session.                              |
| P-05  | A project in `COMPLETED` state may be re-opened; doing so sets it back to `IN_PROGRESS`. |
| P-06  | Deleting a project is out of scope for v1.                                            |

---

## 3. Style Profile Rules

| ID    | Rule                                                                                          |
|-------|-----------------------------------------------------------------------------------------------|
| ST-01 | A project must have exactly one StyleProfile after Step 2.                                    |
| ST-02 | `style_key` must be one of the predefined enum values; custom styles are deferred.            |
| ST-03 | StyleProfile may be edited in place. Edits update `updated_at`.                               |
| ST-04 | Changing style after at least one Room is approved does NOT retroactively re-style approved rooms. |
| ST-05 | Newly created Rooms after a style change use the new style.                                   |

---

## 4. Room Rules

| ID    | Rule                                                                                          |
|-------|-----------------------------------------------------------------------------------------------|
| R-01  | A room belongs to exactly one project.                                                        |
| R-02  | `room_type` must be one of the predefined enum values. Free-text room names are deferred.      |
| R-03  | The same `room_type` may appear at most once per project.                                     |
| R-04  | Each room has exactly one DesignBrief (1:1).                                                  |
| R-05  | Room may be created in any project state ≥ `DRAFT`.                                            |
| R-06  | Deleting a room is out of scope for v1 (rooms can be re-designed but not removed).            |
| R-07  | `approved_generation_id` is null unless `status = APPROVED`.                                  |
| R-08  | Re-approval replaces `approved_generation_id` but does not delete the prior Generation record. |

---

## 5. Design Brief Rules

| ID    | Rule                                                                                          |
|-------|-----------------------------------------------------------------------------------------------|
| B-01  | Each text field has a maximum length cap (purpose 1000, occupants 500, lighting 500, furniture 1000, constraints 1000). |
| B-02  | Brief may be edited any time before room is `APPROVED`.                                       |
| B-03  | Editing the brief after approval transitions the room back to `IN_REVIEW` and clears `approved_generation_id`. |

---

## 6. Generation Rules

| ID    | Rule                                                                                          |
|-------|-----------------------------------------------------------------------------------------------|
| G-01  | Every Generate action creates a `batch_id` containing exactly 3 Generation records.            |
| G-02  | Each Generation in a batch is initialized as `PENDING` then transitions to `PROCESSING`.       |
| G-03  | A Generation reaching `COMPLETED` is immutable (no field updates except via explicit "regenerate" creating a new record). |
| G-04  | A Generation reaching `FAILED` is immutable and stored with `error_code` and `error_message`.  |
| G-05  | Refinement creates a new Generation with `parent_generation_id` pointing to the source.        |
| G-06  | The composed prompt must include: style_key, room_type, brief fields, and (if applicable) consistency anchor. |
| G-07  | The frontend never supplies a fully-formed prompt; only intent (brief fields, refinement deltas). |
| G-08  | Image URL stored on a Generation must point to application-controlled storage only.            |
| G-09  | Provider URLs are never persisted as the final `image_url`.                                    |
| G-10  | If a Generation batch has 0 successes, the room enters `IN_REVIEW` with an explicit error state, never silently discarded. |

---

## 7. Consistency Anchor Rules

| ID    | Rule                                                                                          |
|-------|-----------------------------------------------------------------------------------------------|
| CA-01 | The consistency anchor exists only when at least one room in the project is approved.          |
| CA-02 | The anchor is computed server-side from approved rooms' Generation prompts and style notes.    |
| CA-03 | The anchor is injected into prompts of subsequent (non-approved) rooms in the same project.   |
| CA-04 | The anchor is read-only and not user-editable.                                                |

---

## 8. Style Change After Approvals

| ID    | Rule                                                                                          |
|-------|-----------------------------------------------------------------------------------------------|
| SCA-01 | StyleProfile may be replaced any time the project is not `COMPLETED`. |
| SCA-02 | Replaced style does NOT retroactively modify approved rooms. Approved generations keep the style under which they were created. |
| SCA-03 | Newly created rooms and new generations (refinements of non-approved rooms) use the new style profile. |
| SCA-04 | The PUT endpoint returns `meta.styleChangeWarning: true` when SCA-02 applies; the frontend must surface the warning text from Q4. |

---

## 9. Approval Rules

| ID    | Rule                                                                                          |
|-------|-----------------------------------------------------------------------------------------------|
| A-01  | Only a Generation in `COMPLETED` state may be approved for a room.                             |
| A-02  | Approval sets the Room's `approved_generation_id` and transitions status to `APPROVED`.        |
| A-03  | A room cannot be in `APPROVED` state without a non-null `approved_generation_id`.              |

---

## 10. Project Completion Rules

| ID    | Rule                                                                                          |
|-------|-----------------------------------------------------------------------------------------------|
| PC-01 | A project may be marked `COMPLETED` only if every room in scope has `status = APPROVED`.       |
| PC-02 | The user confirms completion explicitly; the system does not auto-complete.                    |
| PC-03 | Re-opening a `COMPLETED` project sets state back to `IN_PROGRESS` without clearing approvals. |

---

## 11. Export Rules

| ID    | Rule                                                                                          |
|-------|-----------------------------------------------------------------------------------------------|
| E-01  | An ExportBundle may be created only for a project in `COMPLETED` state.                       |
| E-02  | Each export creates a new version; existing versions are never overwritten.                   |
| E-03  | Bundle is a ZIP archive (see ADR-010) containing: approved-images/, references/, project-summary.json, style-profile.json, prompts/, room-notes/. |
| E-04  | Bundle is reproducible given unchanged project state.                                         |
| E-05  | The ZIP is stored in application-controlled storage under `exports/projects/{projectId}/v{version}.zip`. |
| E-06  | A signed download URL is issued with a short TTL (default 15 minutes).                        |

---

## 12. AI Provider Rules

| ID    | Rule                                                                                          |
|-------|-----------------------------------------------------------------------------------------------|
| AI-01 | Provider API calls are executed exclusively by the backend.                                   |
| AI-02 | Provider API keys are never sent to the browser under any circumstance.                        |
| AI-03 | Primary active provider in v1 is Pollinations; fallback adapter is Myceli.ai (see ADR-002). |
| AI-04 | Provider adapter normalizes provider response into the internal Generation record shape.      |
| AI-05 | Provider request must enforce a server-side timeout (target: 60s, hard cap: 90s).              |
| AI-06 | Provider errors are mapped to a stable internal `error_code` enum.                            |
| AI-07 | If the primary adapter fails, the system MAY attempt one retry against the fallback adapter for transient errors (timeout, broken response). Non-transient errors do not trigger fallback. |

Internal `error_code` values (initial set):

| Code                 | Meaning                                  |
|----------------------|------------------------------------------|
| `PROMPT_INVALID`     | Brief failed validation.                 |
| `PROVIDER_TIMEOUT`   | Provider exceeded configured timeout.    |
| `PROVIDER_REJECTED`  | Provider returned 4xx / refusal.         |
| `PROVIDER_BROKEN`    | Provider returned malformed response.    |
| `STORAGE_FAILED`     | Upload to storage failed.                |
| `UPLOAD_REJECTED`    | Uploaded reference file failed validation (type/size). |
| `UNKNOWN`            | Unclassified server-side failure.        |

---

## 13. Storage Rules

| ID    | Rule                                                                                          |
|-------|-----------------------------------------------------------------------------------------------|
| SG-01 | All Generation images are persisted to application-controlled storage before `COMPLETED`.      |
| SG-02 | Provider-issued URLs are valid only for the duration of the provider request, never trusted long-term. |
| SG-03 | Failed uploads mark the Generation `FAILED` with `error_code = STORAGE_FAILED`.                |
| SG-04 | Uploaded References are stored under `references/{projectId}/{roomId}/{referenceId}/{filename}`. The `image_url` exposed to clients is a signed URL with short TTL. |
| SG-05 | Bucket is selected per environment from env config; see ADR-012.                              |
| SG-06 | Maximum upload size: 10 MB. Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`.       |

---

## 14. Concurrency Rules

| ID    | Rule                                                                                          |
|-------|-----------------------------------------------------------------------------------------------|
| C-01  | Two simultaneous Generate actions on the same room are allowed but produce two distinct batches. |
| C-02  | The system does not block writes to enable cross-user isolation.                              |
| C-03  | All cross-session boundaries are enforced via repository-layer query filters, not request-level middleware only. |

---

## 15. Failure Handling Rules

| ID    | Rule                                                                                          |
|-------|-----------------------------------------------------------------------------------------------|
| F-01  | A Generation request is never silently dropped. Every request results in a terminal state.    |
| F-02  | On provider timeout, the Generation is marked `FAILED` with `error_code = PROVIDER_TIMEOUT`.  |
| F-03  | On storage failure, the Generation is marked `FAILED` with `error_code = STORAGE_FAILED`.     |
| F-04  | The user may retry a failed batch; retry creates a new batch with a new `batch_id`.           |
| F-05  | The frontend must show a meaningful state for every Generation status (no blank cards).        |

---

## 16. Out-of-Scope Business Rules (v1)

The following are intentionally **not** enforced because the feature is deferred:

- User authentication, password policy, session expiry policies.
- Role-based access control.
- Multi-user project sharing.
- Quotas / rate limiting per session (system-level rate limiting still applies).
- Billing / entitlement checks.

---

## 17. References

- Product vision: `00-product-vision.md`
- User journey: `01-user-journey.md`
- Domain model: `02-domain-model.md`
- System architecture: `04-system-architecture.md`
