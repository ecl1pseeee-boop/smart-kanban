# syntax=docker/dockerfile:1.7
# Build context: monorepo root (.)

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /repo
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

# ── deps ──────────────────────────────────────────────
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/bot/package.json apps/bot/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile=false --filter "@smart-kanban/api..."

# ── build ─────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
# Compile @smart-kanban/shared to dist/ and point its package.json there,
# so Node can resolve it from the compiled API at runtime (its canonical
# package.json keeps "main: src/index.ts" for dev/tsx).
RUN pnpm --filter "@smart-kanban/shared" run build \
 && node -e "const f='./packages/shared/package.json';const fs=require('fs');const p=JSON.parse(fs.readFileSync(f,'utf8'));p.main='./dist/index.js';p.types='./dist/index.d.ts';for(const k of Object.keys(p.exports||{})){p.exports[k]=p.exports[k].replace('./src/','./dist/').replace(/\.ts$/,'.js')};fs.writeFileSync(f,JSON.stringify(p,null,2));"
RUN pnpm --filter "@smart-kanban/api" run db:generate \
 && pnpm --filter "@smart-kanban/api" run build

# ── production ────────────────────────────────────────
# We copy the whole workspace tree as-is so that pnpm's relative symlinks
# (apps/api/node_modules/fastify -> ../../../node_modules/.pnpm/...) keep
# resolving inside the image.
FROM base AS production
ENV NODE_ENV=production
COPY --from=build /repo /app
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/server.js"]
