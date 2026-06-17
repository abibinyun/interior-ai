# AI Interior Design Journey Builder

A guided interior design planning platform. This repository contains the full-stack implementation following the architecture in `docs/04-system-architecture.md` and the milestone plans in `docs/07-backend-roadmap.md` and `docs/08-frontend-roadmap.md`.

## Status

**M1 — Foundation** is complete. The repo boots; the backend serves `/api/health/live`. Domain modules and persistence land in subsequent milestones.

## Repository Layout

```
.
├── apps/
│   ├── backend/      # NestJS modular monolith
│   └── frontend/     # Vite + React (placeholder until F1)
├── packages/
│   └── shared/       # Cross-cutting types (placeholder)
├── infra/
│   └── docker/       # Dockerfiles + postgres init scripts
├── docs/             # Authoritative documentation (see docs/00-product-vision.md)
├── docker-compose.yml
└── .env.example
```

## Prerequisites

- Node.js 20+
- Docker + Docker Compose
- (Optional) Make

## Quick Start

```bash
# 1. Copy env template
cp .env.example .env

# 2. Start the stack (postgres + backend + frontend placeholder)
docker compose up --build

# 3. Hit the health endpoint
curl http://localhost:3000/api/health/live
# {"status":"ok"}
```

Backend hot-reloads via `nest start --watch` mounted on `apps/backend/src`. Postgres is exposed on `localhost:5432`. The frontend port (`5173`) is reserved for F1.

## Scripts (host-side, optional)

```bash
npm install            # install workspaces
npm run typecheck      # TS check across workspaces
npm run lint           # ESLint across workspaces
npm run test           # Vitest across workspaces
npm run dev:backend    # backend in dev mode (requires local Postgres or compose up postgres)
```

## Documentation

| File | Purpose |
|---|---|
| `docs/00-product-vision.md` | Product definition, scope, success criteria |
| `docs/01-user-journey.md` | 9-step user journey |
| `docs/02-domain-model.md` | Entities, attributes, lifecycle |
| `docs/03-business-rules.md` | Invariants and policies |
| `docs/04-system-architecture.md` | System structure |
| `docs/05-api-contract.md` | HTTP API contract |
| `docs/06-database-design.md` | Postgres + Prisma schema |
| `docs/07-backend-roadmap.md` | 18-milestone backend plan |
| `docs/08-frontend-roadmap.md` | 12-milestone frontend plan |
| `docs/09-review-log.md` | Review checkpoints and decisions |
| `docs/10-decisions.md` | Architecture Decision Records |

## Engineering Rules

- **Backend first.** Every backend module is implemented and verified before frontend consumes it.
- **Local first.** Everything runs through Docker Compose locally.
- **Vertical slices.** Each milestone ships a working slice through all layers.
- **Stop and review.** Implementation pauses at every milestone boundary for approval.

See `docs/04-system-architecture.md` for the full list.
