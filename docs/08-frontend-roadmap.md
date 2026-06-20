# Frontend Roadmap — AI Interior Design Journey Builder

## Purpose

This document is the **milestone-based implementation plan** for the React + Vite frontend. It is gated on the backend milestones in `07-backend-roadmap.md` — the frontend consumes only stable, validated APIs.

The frontend follows the engineering rules: functional components only, no business logic in UI, isolated API layer, premium UX, and incremental delivery with stop-and-review.

---

## 1. Strategy

```text
F1  Foundation        → Vite + React + TS + routing + query + api client
F2  App Shell         → layout, navigation, project list, empty states
F3  Project Flow      → create project, set style, room list, room creation
F4  Generation UI     → design brief editor, generate button, 3-option grid, loading + error states
F5  Refinement UI     → refinement controls, lineage display
F6  Approval UX       → approve flow, re-approve, re-open
F7  Cross-room UX     → consistency anchor visibility, project progress
F8  References UX     → add/list generated and external URL references
F9  Export UX         → complete project, export bundle, download
F10 Failure Surfaces  → every error code maps to a visible, helpful state
F11 Polish Pass       → typography, spacing, motion, accessibility
F12 Production Build  → static bundle, Dockerfile, env wiring
```

The order mirrors the backend milestones so a vertical slice (one user journey step end-to-end) is testable at every step.

---

## 2. Dependency Order

```text
F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8 → F9 → F10 → F11 → F12
```

Frontend milestones are **sequenced behind their backend counterparts**:

| Frontend | Waits for backend |
|----------|-------------------|
| F3       | M4                |
| F4       | M9                |
| F5       | M10               |
| F6       | M12               |
| F7       | M11 + M12         |
| F8       | M13               |
| F9       | M14               |
| F10      | M15               |

---

## 3. Milestones

---

### F1 — Foundation ✅ Completed 2026-06-20

**Objective**: Vite + React + TypeScript skeleton, tooling, API client primitives.

**Scope**

- Vite app with strict TypeScript.
- React Router v6.
- TanStack Query setup.
- **Tailwind CSS** (Q7) configured with a design-token layer for spacing, type scale, and color.
- ESLint, Prettier, Vitest, Testing Library.
- Folder layout per architecture §4.3.
- API client base: typed `apiClient` with error normalization (`ApiError` shape mirrors backend envelope).
- Empty route placeholders for the major screens (no UI yet).

**Out of Scope**

- No real screens, no real API calls (just the typed layer).

**DoD**

- `docker compose up frontend` boots Vite dev server with HMR.
- `npm run lint`, `npm run typecheck`, `npm run test` pass on the empty skeleton.

---

### F2 — App Shell ✅ Completed 2026-06-20

**Objective**: Layout, navigation, and the project list screen (read-only).

**Scope**

- Top-level layout (header, content, footer) using reference design (`tasteskill.dev`-inspired).
- Navigation between Projects, Styles, Settings (stub).
- `GET /api/projects` rendered in a list.
- Empty state for first-time visitors.
- Loading skeleton for the project list.
- Error state for the project list (`ApiError` rendering).
- Project detail route with stub children.

**Out of Scope**

- No creation/edit flows yet.

**DoD**

- First-time visitor sees the empty state and is guided to "Create Project" (button visible but inert for F2).

---

### F3 — Project Flow ✅ Completed 2026-06-20

**Objective**: Implement Steps 1, 2, 3 of the user journey on the frontend.

**Scope**

- `Create Project` modal/page → `POST /api/projects`.
- `Set Style` page → `PUT /api/projects/:id/style` with `styleKey` + `styleNotes`.
- `Style Catalog` page → `GET /api/styles` rendered as a choice grid.
- `Add Room` page → `POST /api/projects/:id/rooms` with `roomType`.
- `Room List` per project with status chips.
- Navigation between these screens.

**Out of Scope**

- No generation, no refinement.

**DoD**

- User can complete Step 1 → Step 2 → Step 3 end-to-end against a live backend.

---

### F4 — Generation UI

**Objective**: Implement Step 4 (Generate Design Concepts) of the user journey.

**Scope**

- Design Brief editor form with validation surfaced from the API.
- "Generate" button: triggers `POST /api/rooms/:roomId/generations`.
- Loading state: 3 skeleton cards with progress hint (provider is 10–90s).
- Success state: 3-option grid with image, status, and option index.
- Per-option error state mapped from `error_code` (F-01..F-05).
- Whole-batch failure state with retry CTA.
- Per-option retry (`POST /api/rooms/:roomId/generations/retry`).
- Disabled state during active batch (rate-limit UX).

**Out of Scope**

- No refinement, no approval.

**DoD**

- Generating against a live AI provider produces 3 options and renders them.
- Provider timeout surfaces as a per-option `PROVIDER_TIMEOUT` state, not a blank.

---

### F5 — Refinement UI

**Objective**: Implement Step 5 (Refine Designs).

**Scope**

- "Refine" action on a generation.
- Structured refinement controls: colors, objects, furniture, materials, lighting, layout, style emphasis.
- Sends `parentGenerationId` + `refinements` to `POST /api/rooms/:roomId/generations`.
- Lineage visualization (collapsible chain) using `GET /api/generations/:id/lineage`.
- "Compare to parent" view (parent image vs new option).

**DoD**

- Refining an option produces 3 new options with `parent_generation_id` linked, and the lineage shows both generations.

---

### F6 — Approval UX

**Objective**: Implement Step 6 (Approve Room Design).

**Scope**

- "Approve as Room Design" button on any `COMPLETED` generation.
- Confirmation modal.
- Optimistic update with rollback on error.
- Re-approval: clicking Approve on a different generation replaces the pointer (visible in UI).
- "Reopen room" button for `APPROVED` rooms.

**DoD**

- Approving changes room status to `APPROVED` and persists across reload.

---

### F7 — Cross-room UX

**Objective**: Make consistency visible across rooms.

**Scope**

- Project dashboard showing each room with status, thumbnail of approved generation, and a progress indicator.
- "Design Next Room" CTA on approved rooms.
- Visible "Style anchor" indicator (read-only summary) at the top of every room screen once at least one sibling is approved.

**DoD**

- A 2-room project visually communicates: room 1 approved (with anchor summary), room 2 in progress with anchor visible.

---

### F8 — References UX

**Objective**: Implement reference management.

**Scope**

- "Add reference" UI with three source options:
  - **Generated**: pick from current room's generations.
  - **Upload**: image picker (JPEG/PNG/WebP, ≤ 10 MB); client-side type/size validation before submit; upload progress.
  - **External URL**: paste a link with caption.
- Reference list per room.
- Delete reference.
- Validation surfaced from API (`UPLOAD_REJECTED`, `PROMPT_INVALID`, etc.).
- Display uploaded references using short-TTL signed URLs from the API.

**DoD**

- Adding a reference to a generation outside the current room fails with `403 FORBIDDEN` and a helpful message.
- Uploading a 12 MB file fails with `400 UPLOAD_REJECTED` before any backend call.

---

### F9 — Export UX

**Objective**: Implement Step 8 (Complete) and Step 9 (Export).

**Scope**

- "Mark House Complete" CTA, gated on all rooms approved (UI validates via API).
- "Reopen project" action.
- "Export Bundle" CTA on completed projects.
- Bundle list (versions), download link per version (signed URL with TTL).
- Bundle preview page rendering manifest from `GET /api/exports/:bundleId`.
- Style-change warning UX (SCA-04) when project.style is changed and any room is approved.

**DoD**

- Completing a project and exporting produces a downloadable bundle; re-exporting produces version+1.

---

### F10 — Failure Surfaces

**Objective**: Map every backend error code to a visible, helpful UI state.

**Scope**

- Centralized error renderer keyed by `error.code`.
- Per-code UX: PROVIDER_TIMEOUT, PROVIDER_REJECTED, PROVIDER_BROKEN, STORAGE_FAILED, PROMPT_INVALID, RATE_LIMITED, BUSINESS_RULE_VIOLATION, etc.
- Empty states for first-time sessions.
- Recovery CTAs (retry, change brief, etc.) tied to the rule from `03-business-rules.md`.

**DoD**

- Every error code documented in `05-api-contract.md §2.1` has a UI state. Manual matrix check.

---

### F11 — Polish Pass

**Objective**: Visual quality matching the reference (`tasteskill.dev`).

**Scope**

- Typography (font loading, scale, weights).
- Spacing and layout rhythm.
- Hover, focus, disabled, loading, error states across every interactive element.
- Motion: subtle transitions, no gratuitous animation.
- Accessibility: keyboard navigation, focus rings, color contrast, alt text on all images.
- Responsive pass for laptop / tablet widths (mobile deferred).

**DoD**

- Lighthouse a11y ≥ 90 on each major route.
- Keyboard-only walkthrough of the full journey.

---

### F12 — Production Build

**Objective**: Production-ready frontend container.

**Scope**

- Multi-stage Dockerfile (build with Vite, serve via Nginx).
- Env-driven API base URL.
- Production CORS handshake verified.
- Static asset caching strategy.

**DoD**

- Production image serves the SPA; navigation works against the production backend.

---

## 4. Per-Milestone Definition of Done

Every frontend milestone is complete when:

- Visual change is reviewed against the reference design intent.
- Loading, empty, and error states are present for every list and primary action.
- API client function for the new endpoint is added (no `any`, no `unknown` leaks).
- Keyboard navigation works on the new screens.
- Lint, typecheck, and tests pass.

---

## 5. UI Quality Rules (Always On)

- Functional components only.
- No business logic in UI — UI calls `apiClient`, renders, and posts intent.
- Honest loading: skeleton over spinners where structure matters.
- Errors teach: name the failure, suggest a next step.
- Premium restraint: avoid decorative noise; let typography and spacing do the work.

---

## 6. References

- Product vision: `00-product-vision.md`
- User journey: `01-user-journey.md`
- Domain model: `02-domain-model.md`
- Business rules: `03-business-rules.md`
- System architecture: `04-system-architecture.md`
- API contract: `05-api-contract.md`
- Backend roadmap: `07-backend-roadmap.md`
