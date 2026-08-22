# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
FROM node:24.19.0-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
RUN npm ci --ignore-scripts
COPY apps/api apps/api
COPY packages/domain packages/domain
RUN npm run build -w @aeos/api

FROM node:24.19.0-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS runtime
LABEL org.opencontainers.image.title="AEOS API" \
      org.opencontainers.image.version="0.1.0" \
      org.opencontainers.image.description="Evidence-first DAO governance API with no asset signing authority"
ENV NODE_ENV=production API_PORT=4000 MIGRATIONS_DIR=/app/infra/migrations
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
RUN npm ci --omit=dev --ignore-scripts --workspace @aeos/api --include-workspace-root=false \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build --chown=node:node /app/apps/api/dist apps/api/dist
COPY --chown=node:node infra/migrations infra/migrations
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","apps/api/dist/main.js"]
