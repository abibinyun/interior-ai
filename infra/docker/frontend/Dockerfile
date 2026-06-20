# Multi-stage production build for the frontend.
#
# Stage 1 (deps): install frontend deps.
# Stage 2 (build): produce the static bundle into /app/dist.
# Stage 3 (runtime): serve the static bundle with nginx:alpine, with a
# config that proxies /api to the backend service.
#
# Build context: repo root. The Dockerfiles copy via root-relative
# paths so a single compose build context can produce both images.
#
# Per docs/04-system-architecture.md §4 (frontend = static SPA +
# backend is separate).
FROM node:20-alpine AS deps
WORKDIR /app
# We use the root-level package-lock.json (npm workspaces don't write
# per-workspace lockfiles), so copy it from the repo root.
COPY package.json package-lock.json* ./
COPY apps/frontend/package.json ./
# `--legacy-peer-deps` tolerates the wide React/TS range we pin.
RUN npm install --no-audit --no-fund --legacy-peer-deps

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/frontend/ ./
# VITE_API_TARGET is baked into the bundle at build time so the
# runtime nginx config can proxy /api/* to the backend service.
ARG VITE_API_TARGET=http://localhost:3000
ENV VITE_API_TARGET=$VITE_API_TARGET
RUN npm run build

FROM nginx:1.27-alpine AS runtime
# Copy the SPA bundle.
COPY --from=build /app/dist /usr/share/nginx/html
# Custom nginx config: SPA fallback (all unknown routes serve
# index.html so React Router works on deep links) + /api proxy.
COPY infra/docker/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5173
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:5173/ || exit 1
CMD ["nginx", "-g", "daemon off;"]