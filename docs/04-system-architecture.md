# System Architecture — AI Interior Design Journey Builder

## Purpose

This document defines the system structure: layers, components, data flow, integration boundaries, technology stack, and architectural principles. It is the blueprint for backend and frontend implementation in `07-backend-roadmap.md` and `08-frontend-roadmap.md`.

---

## 1. Architectural Philosophy

```text
Browser (React SPA)
      ↓ HTTPS
Nginx / Reverse Proxy (in prod)
      ↓
NestJS Backend (single source of truth)
      ↓
AI Provider Adapter ──→ External AI Provider (Pollinations / Gemini)
Storage Adapter       ──→ Supabase Storage
Prisma ORM            ──→ PostgreSQL
```

Three principles:

1. **Backend is the single source of truth.** All state, prompts, validation, and rules live in the backend.
2. **Frontend is a consumer.** The frontend renders state and posts intent; it does not own business rules.
3. **External services are behind adapters.** The backend talks to AI providers and storage only through interface boundaries, so any provider can be swapped without touching business logic.

---

## 2. System Layers

```text
┌──────────────────────────────────────────────────────────────┐
│  Presentation Layer   │ React + Vite SPA (functional comp.) │
├──────────────────────────────────────────────────────────────┤
│  API Layer           │ NestJS Controllers + DTO Validation  │
├──────────────────────────────────────────────────────────────┤
│  Application Layer   │ NestJS Services (use cases)          │
├──────────────────────────────────────────────────────────────┤
│  Domain Layer        │ Entities, value objects, policies    │
├──────────────────────────────────────────────────────────────┤
│  Infrastructure Layer│ Prisma repos, AI adapter, storage    │
└──────────────────────────────────────────────────────────────┘
```

Each layer depends only on the layer below it. Adapters belong to Infrastructure.

---

## 3. Backend Architecture (NestJS)

### 3.1 Style

- **Modular Monolith** (ADR-001).
- Feature-based modules (one module per bounded context).
- Each module exposes: Controller, Service(s), Repository (Prisma), DTOs, optional Guards.
- DTO validation via `class-validator` + `ValidationPipe`.
- Strict TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`).

### 3.2 Module Decomposition (Initial)

| Module             | Responsibility                                                 |
|--------------------|----------------------------------------------------------------|
| `SessionModule`    | Issue, resolve, and validate session identifiers.             |
| `ProjectsModule`   | Project CRUD and lifecycle transitions.                        |
| `StyleModule`      | StyleProfile CRUD and style catalog lookup.                    |
| `RoomsModule`      | Room CRUD and brief management.                                |
| `GenerationsModule`| Generation batch creation, status tracking, lineage queries.  |
| `AiProviderModule` | Adapter interface + concrete adapters (Pollinations, Gemini).  |
| `StorageModule`    | Storage adapter interface + Supabase implementation.           |
| `ExportsModule`    | ExportBundle assembly and versioning.                         |
| `HealthModule`     | Liveness and readiness endpoints.                              |

### 3.3 Cross-Cutting Concerns

| Concern              | Implementation                                              |
|----------------------|-------------------------------------------------------------|
| Session resolution   | `SessionGuard` (global) → injects `sessionId` into request. |
| Validation           | Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`. |
| Error handling       | Centralized `AllExceptionsFilter` → maps domain errors to HTTP. |
| Logging              | `pino` with request ID correlation.                          |
| Configuration        | `@nestjs/config` with schema-validated env (Zod).            |
| Persistence          | Prisma with `PrismaService` per module.                      |

### 3.4 Provider Adapter Interface (Concept)

```text
interface AiProviderAdapter {
  id: string;                          // 'pollinations' | 'gemini'
  generate(input: AiGenerationInput): Promise<AiGenerationResult>;
}

interface AiGenerationInput {
  composedPrompt: string;              // backend-built, never client-supplied
  width: number;
  height: number;
  seed?: number;
  negativePrompt?: string;
}

interface AiGenerationResult {
  imageBuffer: Buffer;                 // raw bytes; backend persists via StorageModule
  providerMetadata: Record<string, unknown>;
}
```

The adapter does not touch the database. It only produces an image buffer for the backend to persist.

### 3.5 Storage Adapter Interface (Concept)

```text
interface StorageAdapter {
  upload(input: StorageUploadInput): Promise<StorageUploadResult>;
  getSignedUrl(objectKey: string, ttlSeconds: number): Promise<string>;
  delete(objectKey: string): Promise<void>;
}

interface StorageUploadInput {
  objectKey: string;                   // backend-computed, namespaced
  contentType: string;
  body: Buffer;
}

interface StorageUploadResult {
  objectKey: string;
  publicUrl: string;                  // used as image_url on Generation
}
```

### 3.6 Repository Pattern

- Each module owns a `*Repository` class wrapping Prisma queries.
- Repositories enforce session isolation: every query takes `sessionId` and filters on it.
- Repositories never expose Prisma types directly to services; they map to domain entities.

### 3.7 Error Model

```text
DomainError               (base)
├── ValidationError       (HTTP 400)
├── NotFoundError         (HTTP 404)
├── ConflictError         (HTTP 409)
├── ProviderError         (HTTP 502)
├── StorageError          (HTTP 502)
└── UnknownError          (HTTP 500)
```

`AllExceptionsFilter` translates these to a stable JSON envelope:

```json
{
  "error": {
    "code": "PROVIDER_TIMEOUT",
    "message": "The image provider did not respond in time.",
    "traceId": "..."
  }
}
```

---

## 4. Frontend Architecture (React + Vite)

### 4.1 Style

- Functional components only.
- No business logic in UI; UI calls an `apiClient` and renders.
- State management via TanStack Query for server state; React state for local UI state.
- Routing via React Router v6.
- **Styling**: Tailwind CSS (ADR-007-decision). Utility-first with a small design-token layer for spacing, type scale, and color. No CSS Modules in v1.

### 4.2 UI Quality Bar

Visual reference: `https://www.tasteskill.dev/`

Required qualities:

- Strong visual hierarchy.
- Premium typography.
- Generous whitespace.
- Honest loading states (no spinners where a skeleton is appropriate).
- Error states that teach, not just complain.

### 4.3 Folder Layout (Initial)

```text
src/
  api/            # typed API client (one module per backend domain)
  features/       # feature folders (projects, rooms, generations, ...)
  components/     # reusable UI primitives
  hooks/          # shared hooks
  lib/            # utility modules
  routes/         # route components
  styles/         # global styles
  main.tsx
  App.tsx
```

### 4.4 API Client Layer

- One file per backend module (e.g., `api/projects.ts`).
- All functions return typed promises; no `any`.
- Errors are normalized to a `ApiError` shape matching the backend envelope.

---

## 5. Data Flow — Generate Concepts (Step 4)

```text
[User clicks Generate]
   ↓
[POST /api/rooms/:roomId/generations]   (intent: brief fields, refinement deltas)
   ↓
[SessionGuard resolves session]
   ↓
[GenerationsService.createBatch]
   ↓
[Build composed prompt]
   ├─ StyleProfile.style_key
   ├─ Room.room_type
   ├─ DesignBrief fields
   ├─ Refinement deltas (if parent)
   └─ ConsistencyAnchor (if any approved sibling rooms)
   ↓
[Persist 3 Generation rows, status=PENDING, shared batch_id]
   ↓
[Transition each to PROCESSING]
   ↓
[For each of 3: AI provider call → image buffer]
   ↓
[Upload buffer to storage via StorageAdapter]
   ↓
[Update Generation: image_url set, status=COMPLETED]
   ↓
[Return 3 Generation records to client]
   ↓
[Client renders options side-by-side]
```

Failure paths branch at the provider call and the storage upload; each branch maps to `FAILED` with a stable `error_code`.

---

## 6. Data Flow — Approve Room (Step 6)

```text
[User clicks Approve on Generation G]
   ↓
[POST /api/rooms/:roomId/approval { generationId }]
   ↓
[SessionGuard + ownership check]
   ↓
[RoomsService.approve(roomId, generationId)]
   ↓
[Verify Generation.status = COMPLETED and belongs to room]
   ↓
[Update Room.approved_generation_id, status=APPROVED]
   ↓
[Recompute consistency anchor for project]
   ↓
[Return updated Room]
```

---

## 7. Data Flow — Export Bundle (Step 9)

```text
[User clicks Export on completed project]
   ↓
[POST /api/projects/:projectId/exports]
   ↓
[Verify project.status = COMPLETED]
   ↓
[ExportsService.assemble(projectId)]
   ↓
[Fetch: approved rooms, generations, style profile, references, notes]
   ↓
[Compile payload per E-03]
   ↓
[Persist ExportBundle (version = max(version)+1)]
   ↓
[Return download URL / payload]
```

---

## 8. Infrastructure

### 8.1 Local Development (Docker Compose)

```text
┌──────────────────────────────────────────────────────────────┐
│  docker-compose.yml                                          │
│                                                              │
│  - postgres         (PostgreSQL 16)                          │
│  - backend          (NestJS, hot reload)                     │
│  - frontend         (Vite dev server, hot reload)            │
│                                                              │
│  volumes:                                                    │
│    - postgres-data                                              │
│    - backend-source      (hot reload)                       │
│    - frontend-source      (hot reload)                       │
└──────────────────────────────────────────────────────────────┘
```

### 8.2 Production

```text
┌──────────────────────────────────────────────────────────────┐
│  Multi-stage Dockerfiles                                     │
│                                                              │
│  backend  : node:20-alpine runtime, built artifacts only     │
│  frontend : node:20-alpine build → static assets → nginx    │
│                                                              │
│  Runtime:                                                    │
│    - backend container behind reverse proxy                  │
│    - frontend container serving static bundle                │
│    - external Postgres (managed)                             │
│    - external object storage (Supabase Storage)              │
└──────────────────────────────────────────────────────────────┘
```

### 8.3 External Service Boundaries

| Service         | Boundary                                              |
|-----------------|--------------------------------------------------------|
| AI Provider     | Backend-only. Adapter normalizes response.             |
| Supabase Storage| Backend-only. Signed URLs only when required.          |
| Postgres        | Reachable only from backend network.                   |

---

## 9. Configuration

All configuration via environment variables, schema-validated at boot.

```text
NODE_ENV
PORT
DATABASE_URL
SESSION_SECRET                  (used for cookie signing if applicable)
AI_PROVIDER                     (active provider key)
AI_PROVIDER_API_KEY             (provider-specific, e.g., GEMINI_API_KEY)
STORAGE_PROVIDER                (e.g., supabase)
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET
LOG_LEVEL
GENERATION_TIMEOUT_MS
GENERATION_HARD_TIMEOUT_MS
CORS_ORIGINS
```

No secret may appear in the frontend bundle.

---

## 10. Architectural Principles (Operational)

1. **Backend first.** Every backend module is implemented and verified before the frontend consumes it.
2. **Local first.** Everything runs through Docker Compose locally; only AI providers and Supabase Storage are external.
3. **Vertical slices.** Each milestone ships a working slice through all layers.
4. **Immutability for terminal states.** `COMPLETED` and `FAILED` Generations are not mutated.
5. **Session isolation at the data layer.** Not enforced by controller checks alone.
6. **Adapters for external dependencies.** AI providers and storage are interchangeable.
7. **No premature scaling.** No queues, no microservices, no event bus in v1.

---

## 11. Anti-Patterns Explicitly Forbidden

| Anti-pattern                              | Reason                                       |
|-------------------------------------------|----------------------------------------------|
| Frontend composing prompts                | Violates G-07.                               |
| Storing provider URLs as final `image_url`| Violates SG-02, AI-04.                       |
| Cross-session data sharing                | Violates S-05.                               |
| Mutating `COMPLETED` Generation rows      | Violates G-03.                               |
| Auto-retry on provider failure            | Violates G-04 / F-04; user must trigger.     |
| Auto-completing a project                 | Violates PC-02.                              |
| Tight coupling to a specific provider SDK | Violates adapter boundary.                   |

---

## 12. References

- Product vision: `00-product-vision.md`
- User journey: `01-user-journey.md`
- Domain model: `02-domain-model.md`
- Business rules: `03-business-rules.md`
- API contract: `05-api-contract.md`
- Database design: `06-database-design.md`
- Backend roadmap: `07-backend-roadmap.md`
- Frontend roadmap: `08-frontend-roadmap.md`
