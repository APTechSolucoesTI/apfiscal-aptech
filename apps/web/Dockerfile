FROM node:24-alpine AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app


FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile --filter @apfiscal/web...


FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

RUN pnpm --filter @apfiscal/shared build && \
    pnpm --filter @apfiscal/web build


FROM node:24-alpine AS runner

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Standalone gerado pelo Next
COPY --from=builder --chown=nextjs:nodejs \
    /app/apps/web/.next/standalone ./

# IMPORTANTE:
# Next 16 + Node 24 pode deixar dependências ESM fora do standalone.
# Levamos o virtual store completo do pnpm para garantir que os módulos
# usados durante o build existam também no runtime.
COPY --from=builder --chown=nextjs:nodejs \
    /app/node_modules ./node_modules

COPY --from=builder --chown=nextjs:nodejs \
    /app/apps/web/node_modules ./apps/web/node_modules

COPY --from=builder --chown=nextjs:nodejs \
    /app/packages/shared ./packages/shared

COPY --from=builder --chown=nextjs:nodejs \
    /app/apps/web/.next/static ./apps/web/.next/static

COPY --from=builder --chown=nextjs:nodejs \
    /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

CMD ["node", "apps/web/server.js"]