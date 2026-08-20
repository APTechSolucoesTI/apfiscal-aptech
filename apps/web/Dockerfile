FROM node:24-alpine AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

# O cache do Corepack não é compartilhado automaticamente entre estágios.
# Instalamos a versão declarada no package.json na camada base para que o
# estágio builder não dependa de novo download durante o deploy.
RUN corepack enable && corepack install --global pnpm@11.22.0

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

ARG SWC_HELPERS_VERSION=0.5.23

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# O standalone contém o runtime e as dependências rastreadas pelo Next.
# Não copie o node_modules inteiro depois dele: o layout de links do pnpm pode
# sobrepor arquivos do artefato e quebrar imports ESM no container final.
COPY --from=builder --chown=nextjs:nodejs \
    /app/apps/web/.next/standalone ./

# O tracer do Next inclui os helpers CJS, mas o require hook do Next 16 também
# carrega helpers ESM. Copiamos esse diretório do virtual store fixado no lock.
COPY --from=builder --chown=nextjs:nodejs \
    /app/node_modules/.pnpm/@swc+helpers@${SWC_HELPERS_VERSION}/node_modules/@swc/helpers/esm \
    ./node_modules/.pnpm/@swc+helpers@${SWC_HELPERS_VERSION}/node_modules/@swc/helpers/esm

COPY --from=builder --chown=nextjs:nodejs \
    /app/apps/web/.next/static ./apps/web/.next/static

COPY --from=builder --chown=nextjs:nodejs \
    /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
