# syntax=docker/dockerfile:1.7
FROM node:24.14.0-bookworm-slim AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY tsconfig*.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
COPY scripts/verify-template-packaging.mjs ./scripts/verify-template-packaging.mjs
RUN npm run build

FROM node:24.14.0-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts

FROM node:24.14.0-bookworm-slim AS runtime
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="PROFiGYM Calculator" \
      org.opencontainers.image.version="2.0.2" \
      org.opencontainers.image.revision="$VCS_REF" \
      org.opencontainers.image.source="local-stage7-package"
RUN apt-get update && apt-get install -y --no-install-recommends tini ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production CAD_STORAGE_ROOT=/data CAD_TEMP_DIR=/tmp/cad-processing CAD_FRONTEND_DIST_PATH=/app/dist
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /build/dist ./dist
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node report-schema ./report-schema
COPY --chown=node:node scripts/migrate-db.mjs scripts/db-integrity.mjs scripts/db-checkpoint.mjs scripts/storage-cleanup.mjs scripts/backup-cli.mjs ./scripts/
USER node
EXPOSE 8787
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","server/index.js"]
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 CMD ["node","-e","fetch('http://127.0.0.1:8787/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
