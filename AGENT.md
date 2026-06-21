# AGENT.md — AI Agent Guide for AI Interior Design Journey Builder

> **Purpose**: This file is the authoritative rulebook for any AI agent (or human) working on this codebase. It encodes the project's non-negotiable rules, architecture decisions, workflow, and verification gates. Read this **before** making any change.

---

## 1. Project Identity

- **Name**: AI Interior Design Journey Builder
- **Type**: Guided full-house interior design planning platform
- **Core Promise**: Walk a user from "I have no idea what my house should look like" → "I have a complete, coherent, downloadable interior design plan."
- **Not**: an image generator, a prompt playground, a generic gallery. The deliverable is **confidence, clarity, consistency, and a complete plan** — not the images themselves.

---

## 2. Hard Rules (Non-Negotiable)

These rules govern every change. Violating any of them is a blocking defect.

### 2.1 Engineering Workflow

| # | Rule |
|---|------|
| **R-W1** | **Backend-first**. Implement and stabilize backend API before touching the frontend. Frontend consumes stable APIs only. |
| **R-W2** | **Milestone-based delivery**. Follow `docs/07-backend-roadmap.md` (M1–M18) and `docs/08-frontend-roadmap.md` (F1–F12) in order. |
| **R-W3** | **Stop-and-review** after every milestone. After completing a milestone: explain the changes, list the verification results, and **wait for explicit approval** before starting the next. |
| **R-W4** | **Never commit automatically**. Only commit when the user explicitly asks. Never suggest commits unprompted. |
| **R-W5** | **One milestone = one commit** (unless the user requests otherwise). |
| **R-W6** | **Never edit runtime logic to work around schema issues**. Schema drift is fixed via Prisma migrations. |
| **R-W7** | **Never commit secrets**. Real API keys, Supabase service-role keys, and session secrets must never enter git. `.env` is gitignored; `.env.example` contains only sanitized placeholders. |

### 2.2 Verification Gate (run before declaring a milestone done)

In this exact order:

```bash
1. typecheck       →  npx tsc --noEmit    (in apps/backend)
2. lint            →  npx eslint . --max-warnings=0
3. build           →  npm run build
4. test            →  npm run test        (requires running Postgres)
5. docker build    →  docker compose build backend
6. docker smoke    →  docker compose up -d && curl http://localhost:3000/api/health/live
```

All six must pass. If any fails, the milestone is **not** done.

### 2.3 Architecture Invariants

| # | Rule | Source |
|---|------|--------|
| **R-A1** | **Backend = NestJS modular monolith**, separate from frontend. | ADR-001 |
| **R-A2** | **DB = PostgreSQL 16 + Prisma**. Migrations only via `prisma migrate`. | ADR-003 |
| **R-A3** | **AI primary = Pollinations**, **fallback = Myceli.ai**. Selection via `AI_PROVIDER` env. | ADR-002 |
| **R-A4** | **Storage = Supabase Storage**, one bucket per environment. | ADR-004, ADR-012 |
| **R-A5** | **Identity = anonymous sessions** via `httpOnly` `Secure` `SameSite=Lax` cookie named `sid`. No auth, no PII. | ADR-007, S-01..S-07 |
| **R-A6** | **Defensive `session_id` denormalization** on `rooms`, `generations`, `references`, `export_bundles`, maintained by **Postgres triggers** (not app code). | ADR-005 |
| **R-A7** | **Cross-session access forbidden at the repository/query layer**, never only in controllers. | S-05, S-06 |
| **R-A8** | **Error envelope is stable**: `{ "error": { "code", "message", "traceId" } }`. Stable `code` values per `05-api-contract.md §2`. | ADR-008 |
| **R-A9** | **Every Generate action produces exactly 3 Generation rows** under one `batch_id`, indexed 1–3. | ADR-009, G-01 |
| **R-A10** | **Export is a ZIP archive** (not JSON). Schema per ADR-010. | ADR-010 |
| **R-A11** | **Consistency anchor = server-computed**, composed from style profile + approved prompts. No embeddings in v1. | ADR-011 |
| **R-A12** | **Frontend stack**: React + TS (functional only) + Vite + TanStack Query + React Router v6 + **Tailwind CSS**. | ADR-006 |

### 2.4 Code Style

- **TypeScript strict** with: `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `strictNullChecks`, `strictFunctionTypes`.
- **No comments unless asked**. Code should self-document through naming.
- **Functional React components only**. No class components.
- **No `any`** (warn-level). Use precise types.
- **ESLint clean** with `--max-warnings=0`.
- **Prettier** for formatting.

### 2.5 Test Discipline

- **vitest** is the test runner. **Must use `unplugin-swc`** with `legacyDecorator: true` + `decoratorMetadata: true`. Without this, NestJS DI silently injects `undefined` and controllers 500.
- **E2E tests** live in `apps/backend/test/*.e2e-spec.ts` and require a running Postgres on `127.0.0.1:5432`.
- **Unit tests** (when added) live in `apps/backend/src/**/*.spec.ts`.
- **All CHECK constraints and triggers must be tested** by deliberately inserting bad rows.
- **Cross-session isolation must be tested** by attempting to read/write across sessions and asserting `404 NOT_FOUND` (or `403 FORBIDDEN`).

---

## 3. Project Structure

```text
.
├── apps/
│   ├── backend/                    # NestJS API (M1+)
│   │   ├── src/
│   │   │   ├── common/             # error envelope, filter, request-id middleware
│   │   │   ├── config/             # Zod-validated env loader
│   │   │   ├── health/             # GET /api/health/live
│   │   │   ├── prisma/             # PrismaService, BaseRepository, SessionScope
│   │   │   ├── sessions/           # M2 (controller/service/repository) + M3 (guard)
│   │   │   ├── projects/           # M4
│   │   │   ├── rooms/              # M5
│   │   │   ├── ai/                 # M6 (provider adapter)
│   │   │   ├── storage/            # M7 (storage adapter)
│   │   │   ├── generations/        # M8-M12
│   │   │   ├── references/         # M13
│   │   │   └── exports/            # M14
│   │   ├── test/                   # *.e2e-spec.ts
│   │   ├── vitest.config.ts        # SWC plugin required
│   │   └── tsconfig.json
│   └── frontend/                   # React + Vite (F1+, placeholder until then)
├── packages/
│   └── shared/                     # Shared TS types between FE/BE
├── prisma/
│   ├── schema.prisma               # 8 entities, 5 enums, indexes
│   ├── _triggers/                  # Source trigger SQL
│   └── migrations/                 # Applied migrations
├── infra/
│   └── docker/
│       ├── backend/                # Dockerfile + Dockerfile.dev
│       └── postgres/init/          # pgcrypto bootstrap
├── docs/                           # Authoritative documentation
│   ├── 00-product-vision.md
│   ├── 01-user-journey.md
│   ├── 02-domain-model.md
│   ├── 03-business-rules.md        # S-/P-/ST-/R-/B-/G-/CA-/SCA-/A-/PC-/E-/AI-/SG-/C-/F- rules
│   ├── 04-system-architecture.md
│   ├── 05-api-contract.md
│   ├── 06-database-design.md
│   ├── 07-backend-roadmap.md       # M1-M18
│   ├── 08-frontend-roadmap.md      # F1-F12
│   ├── 09-review-log.md            # Open questions + decisions
│   └── 10-decisions.md             # ADRs (append-only)
├── docker-compose.yml              # postgres + migrate + backend + frontend placeholder
├── .env.example                    # Sanitized env template
└── AGENT.md                        # This file
```

---

## 4. Authoritative Docs (Read These First)

| Question | Doc |
|----------|-----|
| What are we building and why? | `docs/00-product-vision.md` |
| How does a user move through it? | `docs/01-user-journey.md` |
| What entities exist? | `docs/02-domain-model.md` |
| What rules must the system enforce? | `docs/03-business-rules.md` |
| How is the system layered? | `docs/04-system-architecture.md` |
| What are the HTTP endpoints and shapes? | `docs/05-api-contract.md` |
| What's the DB schema? | `docs/06-database-design.md` |
| What's the build order? | `docs/07-backend-roadmap.md`, `docs/08-frontend-roadmap.md` |
| What's been decided? | `docs/10-decisions.md` |
| What questions are still open? | `docs/09-review-log.md` |

**Rule of thumb**: if a doc and code disagree, **the docs win** until a new ADR is filed.

---

## 5. Environment & Tooling

### 5.1 Required Environment

- **Node** >= 20
- **Docker** + **Docker Compose** (the `docker compose` v2 CLI)
- **Postgres 16** (via Docker, not local install)
- **Alpine images require `openssl libc6-compat`** for Prisma engine

### 5.2 Environment Variables (`.env.example`)

| Var | Default | Notes |
|-----|---------|-------|
| `NODE_ENV` | `development` | `development` / `test` / `production` |
| `PORT` | `3000` | |
| `LOG_LEVEL` | `debug` | pino level |
| `DATABASE_URL` | `postgresql://interior:interior@postgres:5432/interior?schema=public` | In Docker. Local tests use `127.0.0.1:5432`. |
| `SESSION_COOKIE_NAME` | `sid` | Per ADR-007 |
| `SESSION_COOKIE_SECRET` | (≥ 32 chars) | Required by Zod |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated |
| `AI_PROVIDER` | `pollinations` | ADR-002 |
| `AI_PRIMARY_BASE_URL` | `https://gen.pollinations.ai` | |
| `AI_FALLBACK_BASE_URL` | `https://api.myceli.ai` | |
| `AI_PRIMARY_API_KEY` | (empty) | |
| `AI_FALLBACK_API_KEY` | (empty) | |
| `GENERATION_TIMEOUT_MS` | `60000` | |
| `GENERATION_HARD_TIMEOUT_MS` | `90000` | |
| `STORAGE_PROVIDER` | `supabase` | ADR-004 |
| `SUPABASE_URL` | (URL) | Must be a valid URL or empty (handled by Zod transform) |
| `SUPABASE_SERVICE_ROLE_KEY` | (empty) | **Never commit a real value** |
| `SUPABASE_STORAGE_BUCKET` | `generations` | Per-env bucket per ADR-012 |
| `SIGNED_URL_TTL_SECONDS` | `900` | |
| `RATE_LIMIT_PER_SESSION_PER_MIN` | `10` | ADR-013 |

### 5.3 Critical Gotchas

- **`vitest.config.ts` MUST use `unplugin-swc`** with `legacyDecorator: true` + `decoratorMetadata: true`. Default vite-node strips decorator metadata → NestJS DI silently breaks → controllers return 500 with `this.sessions is undefined`.
- **`references` is a Postgres reserved word**. All trigger SQL must quote it: `"references"`.
- **`prisma migrate dev` requires TTY** (interactive). In Docker/scripts use `prisma migrate deploy`.
- **`SESSION_COOKIE_SECRET` must be ≥ 32 chars** (Zod-validated). Default in `.env.example` is 33 chars to satisfy this.
- **Alpine images need `openssl libc6-compat`** for Prisma engine. Both `Dockerfile` and `Dockerfile.dev` install these.
- **`supabase` URL fields must handle empty strings** — the Zod schema uses `.or(z.literal('')).transform((v) => v || undefined)` to accept either a real URL or an empty string from `${VAR:-}` shell expansion.
- **Root `tsconfig.json` does not exist**. Dockerfiles COPY from `apps/backend/tsconfig.json`.

---

## 6. Milestone Workflow

When working on a milestone:

1. **Read the milestone definition** in `docs/07-backend-roadmap.md` (or `08-frontend-roadmap.md`).
2. **Read the related business rules** in `docs/03-business-rules.md`.
3. **Check the relevant ADR(s)** in `docs/10-decisions.md` for constraints.
4. **Check the open questions** in `docs/09-review-log.md` §3 for unresolved items.
5. **Implement the scope**, respecting the **out-of-scope** list.
6. **Run the full verification gate** (typecheck → lint → build → test → docker build → docker smoke).
7. **Update `docs/09-review-log.md`** if anything was decided, deferred, or discovered.
8. **Stop**. Summarize the changes, show the verification output, and wait for approval.
9. **Commit only when explicitly asked**. Use `caveman-commit` for the message format.

---

## 7. Per-Milestone Definition of Done

Every milestone is complete when **all** of these are true:

- [ ] Code compiles (`tsc --noEmit` clean)
- [ ] Lint passes (`eslint . --max-warnings=0`)
- [ ] Build succeeds (`nest build`)
- [ ] All tests pass (`vitest run` against a running Postgres)
- [ ] Docker image builds (`docker compose build backend`)
- [ ] Docker smoke passes (`GET /api/health/live` returns `{"status":"ok"}`)
- [ ] Out-of-scope items from the roadmap are **not** implemented
- [ ] No new dependencies added without explicit approval
- [ ] `docs/09-review-log.md` updated with any new decisions or discoveries
- [ ] No secrets committed

---

## 8. Subagent Delegation

Use the `cavecrew` skill for subagent delegation when:

- **Investigator** (`cavecrew-investigator`): "Where is X defined?", "What calls Y?", "Map this module." Read-only, returns `file:line` table.
- **Builder** (`cavecrew-builder`): 1–2 file edits, mechanical changes, typo fixes, format-preserving tweaks. Refuses multi-file scope.
- **Reviewer** (`cavecrew-reviewer`): Diff/branch review. One line per finding, severity-tagged.

Do **not** spawn a subagent for:

- New feature implementation (build it yourself in main context)
- Multi-file refactors (use investigator first, then build)
- Anything requiring more than ~3 file edits

---

## 9. Common Anti-Patterns to Reject

If you find yourself doing any of these, **stop**:

- ❌ Editing `dist/`, `node_modules/`, or any generated file
- ❌ Adding `// @ts-ignore` or `any` to silence the compiler
- ❌ Hardcoding URLs, ports, or secrets in source
- ❌ Writing `await` inside a `for` loop when `Promise.all` would work
- ❌ Bypassing `BaseRepository.forSession()` to "just get the row"
- ❌ Catching errors and returning `null` (let `AllExceptionsFilter` map them)
- ❌ Adding a dependency for what one function does
- ❌ Committing without explicit user approval
- ❌ Skipping the verification gate "to save time"
- ❌ Implementing out-of-scope items from a milestone
- ❌ Suggesting "let's just add a quick fix" without updating tests

---

## 10. Quick-Reference Commands

```bash
# Install
npm install

# Start full stack (Postgres + migrate + backend)
docker compose up -d
docker compose logs -f backend          # tail logs

# Local dev backend (assumes Postgres already up)
npm run dev:backend

# Verification gate
cd apps/backend
npx tsc --noEmit
npx eslint . --max-warnings=0
npm run build
npm run test
docker compose build backend
docker compose up -d backend
curl http://localhost:3000/api/health/live

# Database
docker compose up migrate              # apply migrations
docker compose exec postgres psql -U interior -d interior   # shell

# Tests
npm run test                            # one-shot
npm run test:watch                      # watch mode
npm run test:cov                        # coverage
```

---

## 11. References

- **Master brief**: `prompt.md` (root, untracked — historical context)
- **Assessment brief**: `docs/Assessment Brief.md` (untracked, historical context)
- **Documentation index**: `docs/` (00–10)
- **Decision log**: `docs/10-decisions.md` (ADRs, append-only)
- **Review log**: `docs/09-review-log.md` (open questions, resolved questions, milestone review entries)

---

**Last updated**: 2026-06-21 (pre-submission — all features + all bugs + all docs polished)
**Milestone status**: M1–M18 ✅ (backend), F1–F12 ✅ (frontend). Post-F12: ✅ rate-limit hardening · ✅ style 404 fix · ✅ env-tunable rate limit · ✅ AI Horde + 402/429 fallback · ✅ signed-URL path fix · ✅ homelab-public deploy · ✅ Replicate adapter (Flux 2 Pro) · ✅ Horde 429 polling retry · ✅ back button + spinner UI
**Live URL**: `https://interior.cube.my.id` — deployed via homelab-public (Traefik + cloudflared), same pattern as auto-payment
**Provider chain**: Replicate (Flux 2 Pro, ~9s) → Pollinations → AI Horde (429 retry) → Myceli
**Current phase**: All code done, all tests green. Waiting for user's Loom recording + submission email.
