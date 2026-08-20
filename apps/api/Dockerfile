FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack install --global pnpm@11.22.0
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --filter @apfiscal/api...

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
RUN pnpm --filter @apfiscal/shared build && pnpm --filter @apfiscal/api build && pnpm deploy --filter @apfiscal/api --prod /prod/api

FROM node:24-bookworm-slim AS runner
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs api
COPY --from=builder --chown=api:nodejs /prod/api/node_modules ./node_modules
COPY --from=builder --chown=api:nodejs /app/apps/api/dist ./dist
USER api
EXPOSE 3001
CMD ["node", "dist/main.js"]
