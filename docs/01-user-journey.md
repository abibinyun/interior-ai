# User Journey — AI Interior Design Journey Builder

## Purpose

This document defines the canonical end-to-end user journey, the steps within it, the decisions a user makes at each step, and the system responsibilities that support each step.

The user journey is the **single source of truth for product scope**. If a feature is not required by a step in this document, it is out of scope for v1.

---

## 1. Journey Map (High Level)

```text
Step 1  Create Project
   ↓
Step 2  Define Style Direction
   ↓
Step 3  Select Room
   ↓
Step 4  Generate Design Concepts
   ↓
Step 5  Refine Designs
   ↓
Step 6  Approve Room Design
   ↓
Step 7  Continue To Other Rooms  ──── (loop back to Step 3)
   ↓
Step 8  Complete Entire House
   ↓
Step 9  Export Design Bundle
```

The journey is **linear with one bounded loop** (Step 7 → Step 3, repeated per room).

---

## 2. Session and Project Lifecycle

A user does not log in. The platform uses **session-based identification**:

- A visitor receives a stable session identifier on first visit.
- The session owns zero or more **projects**.
- A project owns one **style profile** and one or more **rooms**.

A project exists in one of three high-level states:

| State        | Meaning                                                |
|--------------|--------------------------------------------------------|
| `DRAFT`      | Project created; style and/or rooms incomplete.        |
| `IN_PROGRESS`| Style defined; at least one room in progress.          |
| `COMPLETED`  | All targeted rooms approved; bundle exportable.        |

---

## 3. Step 1 — Create Project

### User Goal

Start a new house design journey.

### User Actions

1. Land on the app.
2. Click **New Project**.
3. Enter:
   - Project name (required, e.g. *"My Dream House"*, *"House Renovation 2026"*).
   - Description (optional).

### System Responsibilities

- Assign a unique project identifier.
- Persist project tied to the session.
- Transition project to `DRAFT`.
- Redirect user to Step 2.

### Acceptance Criteria

- Project is retrievable on a new browser session with the same session cookie.
- Project name is required and bounded in length (1–80 chars).
- Two projects with the same name may coexist under the same session.

---

## 4. Step 2 — Define Style Direction

### User Goal

Commit to a global design language that every room will follow.

### User Actions

1. Review predefined style catalog:
   - Japandi
   - Scandinavian
   - Industrial
   - Modern Minimalist
   - Contemporary Luxury
2. Select one style.
3. Optionally tweak style notes (free-text remarks about preferences).

### System Responsibilities

- Persist a **Style Profile** on the project.
- The profile becomes the **primary style anchor** for all rooms.
- Style profile cannot be deleted; it can be replaced while the project is `DRAFT` or `IN_PROGRESS` (with a warning that re-generation may be required).

### Acceptance Criteria

- Exactly one active style profile per project.
- The style profile is displayed at the top of every subsequent room screen.

---

## 5. Step 3 — Select Room

### User Goal

Choose which room to design next.

### User Actions

1. Open the project's room list.
2. Either:
   - Select an existing room to continue work on, **or**
   - Add a new room by picking from a predefined catalog:
     - Living Room
     - Dining Room
     - Kitchen
     - Master Bedroom
     - Bathroom
     - Workspace
     - (catalog is closed in v1; free-text room names deferred)

### System Responsibilities

- Persist a `Room` entity on the project.
- Initialize an empty **Design Brief** for the room.
- Move the user to Step 4.

### Acceptance Criteria

- Rooms are listed per project, not globally.
- Same room may be added once per project (no duplicates).

---

## 6. Step 4 — Generate Design Concepts

### User Goal

Produce multiple distinct visual options for the room.

### User Actions

1. Fill in the **Design Brief**:
   - Room purpose.
   - Occupants.
   - Lighting preferences.
   - Furniture requirements.
   - Constraints.
2. Optionally add natural-language descriptors.
3. Click **Generate**.
4. Wait while the system produces **three options** (Option A, B, C).

### System Responsibilities

- Compose an effective prompt from:
  - Global style profile.
  - Room type.
  - Design brief fields.
- Call the AI provider via the backend adapter.
- Persist **three Generation records**, one per option, linked to the room.
- Display options side-by-side when complete.
- Handle failure states:
  - Provider timeout.
  - Invalid prompt (server-side validation).
  - Broken response.

### Acceptance Criteria

- Exactly 3 options per generation batch.
- Options share the same style profile anchor.
- All 3 options succeed, all 3 fail, or partial success is communicated clearly (no silent partial state).

---

## 7. Step 5 — Refine Designs

### User Goal

Iterate on a chosen option until it matches intent.

### User Actions

1. Pick one of the three options as the **working option**.
2. Modify via structured controls:
   - Change colors.
   - Add / remove objects.
   - Modify furniture.
   - Change materials.
   - Adjust lighting.
   - Adjust layout.
   - Refine style emphasis.
3. Submit a refinement.
4. Receive a new generation that inherits the previous prompt plus modifications.

### System Responsibilities

- Create a new Generation record with `parent_generation_id` set to the source.
- Preserve full lineage chain (revision history).
- Ensure refinement preserves the style profile anchor.

### Acceptance Criteria

- Refinement never mutates the parent generation.
- Refinement lineage is traversable from any approved design back to the original room brief.
- Original Generation IDs remain stable.

---

## 8. Step 6 — Approve Room Design

### User Goal

Lock in the final design for the room.

### User Actions

1. Select a Generation in the room.
2. Click **Approve as Room Design**.

### System Responsibilities

- Mark the chosen Generation as the room's **Approved Design**.
- A room has at most one Approved Design at a time.
- Re-approval replaces the previous approval.

### Acceptance Criteria

- Approved Design is immutable in identity (the Generation record is never mutated; only the pointer changes).
- The room status moves to `APPROVED`.

---

## 9. Step 7 — Continue To Other Rooms

### User Goal

Design additional rooms while maintaining house-wide consistency.

### User Actions

1. From an approved room, click **Design Next Room**.
2. Return to Step 3.
3. Pick another room.
4. The system pre-fills the brief with house-level context.

### System Responsibilities

- Surface the active style profile and previously approved rooms as context.
- Provide prompt-level consistency anchoring so new generations match the established language.

### Acceptance Criteria

- Approved rooms influence the prompt context of subsequent rooms.
- The user can return to any approved room to view or re-design it without losing its approval state unless they explicitly re-design.

---

## 10. Step 8 — Complete Entire House

### User Goal

Mark the entire house as designed.

### User Actions

1. Review the project's room list.
2. Confirm all targeted rooms are approved.
3. Click **Mark House Complete**.

### System Responsibilities

- Validate that all rooms in scope are approved.
- Transition project to `COMPLETED`.

### Acceptance Criteria

- Project cannot be marked complete with unapproved rooms.
- Completion is reversible (user can re-open the project for revisions).

---

## 11. Step 9 — Export Design Bundle

### User Goal

Leave with a complete, portable record of the house plan.

### User Actions

1. From a completed project, click **Export**.
2. Receive a single **Export Bundle** containing:
   - Final approved images (one per room).
   - Style guide (style profile + principles).
   - Prompt history (full lineage per room).
   - Design notes.
   - Material suggestions.
   - Color palette.
   - Room summaries.
   - Visual references.

### System Responsibilities

- Compile the bundle from approved records.
- Produce a downloadable artifact (format deferred to API contract).
- Persist a snapshot of the bundle (re-exportable).

### Acceptance Criteria

- The bundle is self-contained and reviewable without the live product.
- Re-export yields identical content given unchanged project state.

---

## 12. Cross-Step Failure & Edge Flows

| Situation                          | System Behavior                                          |
|------------------------------------|----------------------------------------------------------|
| User closes tab mid-generation     | Generation completes server-side; visible on return.     |
| User refreshes during step 4       | Latest generation state is rehydrated from DB.           |
| Provider fails for one option      | That option marked FAILED; other options continue.       |
| All options fail                   | Room enters error state; user can retry without losing brief. |
| User changes style mid-project     | Confirmation prompt; existing approved rooms keep old style; new rooms use new style. |
| User wants to restart a room       | Allowed; previous generations retained as history.        |

---

## 13. Out-of-Journey (Explicit Non-Goals)

The following are intentionally **not** part of the user journey in v1:

- Account login / signup.
- Project sharing with another user.
- Receiving feedback from a human designer.
- Importing a floor plan.
- Editing an image directly (raster edits).
- Uploading an inspiration photo as the generation source.

---

## 14. References

- Product vision: `00-product-vision.md`
- Domain model: `02-domain-model.md`
- Business rules: `03-business-rules.md`
- API contract: `05-api-contract.md`
