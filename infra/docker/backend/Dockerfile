# syntax=docker/dockerfile:1.6

# --- deps ---
FROM node:20-alpine AS deps
WORKDIR /repo

COPY package.json package-lock.json* ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY prisma ./prisma
RUN npm install --workspaces --include-workspace-root \
 && npx prisma generate --schema=prisma/schema.prisma

# --- build ---
FROM node:20-alpine AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/prisma ./prisma
COPY apps/backend ./apps/backend
COPY apps/backend/tsconfig.json ./tsconfig.json
COPY apps/backend/tsconfig.build.json ./tsconfig.build.json
ARG APP_VERSION=0.0.0
ARG GIT_COMMIT=unknown
ARG BUILD_AT=unknown
ENV APP_VERSION=${APP_VERSION}
ENV GIT_COMMIT=${GIT_COMMIT}
ENV BUILD_AT=${BUILD_AT}
RUN npx nest build -p apps/backend/tsconfig.build.json

# --- runtime ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ARG APP_VERSION=0.0.0
ARG GIT_COMMIT=unknown
ARG BUILD_AT=unknown
ENV APP_VERSION=${APP_VERSION}
ENV GIT_COMMIT=${GIT_COMMIT}
ENV BUILD_AT=${BUILD_AT}

RUN apk add --no-cache openssl libc6-compat wget

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=build /repo/apps/backend/dist ./dist
COPY --from=build /repo/apps/backend/package.json ./package.json
# `prisma migrate deploy` (run as the one-shot interior-migrate
# in the homelab deploy) needs the schema on disk.
COPY --from=build /repo/prisma ./prisma

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health/live >/dev/null 2>&1 || exit 1

CMD ["node", "dist/main.js"]
