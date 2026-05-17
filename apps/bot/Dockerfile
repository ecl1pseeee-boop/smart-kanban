# syntax=docker/dockerfile:1.7
# Build context: monorepo root (.)

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /repo

# ── deps ──────────────────────────────────────────────
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/bot/package.json apps/bot/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile=false --filter "@smart-kanban/bot..."

# ── build ─────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/bot apps/bot
RUN pnpm --filter "@smart-kanban/shared" run build \
 && node -e "const f='./packages/shared/package.json';const fs=require('fs');const p=JSON.parse(fs.readFileSync(f,'utf8'));p.main='./dist/index.js';p.types='./dist/index.d.ts';for(const k of Object.keys(p.exports||{})){p.exports[k]=p.exports[k].replace('./src/','./dist/').replace(/\.ts$/,'.js')};fs.writeFileSync(f,JSON.stringify(p,null,2));"
RUN pnpm --filter "@smart-kanban/bot" run build

# ── production ────────────────────────────────────────
# Same approach as the API image: preserve the workspace layout so pnpm's
# relative symlinks into /repo/node_modules/.pnpm still resolve.
FROM base AS production
ENV NODE_ENV=production
COPY --from=build /repo /app
WORKDIR /app/apps/bot
CMD ["node", "dist/bot.js"]
