# syntax=docker/dockerfile:1
# Image de Production KASSALAFAM pour Coolify (Next.js en sortie « standalone »).
# Les variables NEXT_PUBLIC_* sont figées dans le JavaScript AU BUILD :
# dans Coolify, les cocher « Build Variable » (elles arrivent ici en ARG).

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_WHATSAPP_CONTACT
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_WHATSAPP_CONTACT=$NEXT_PUBLIC_WHATSAPP_CONTACT \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
# Les secrets serveur (SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, ADMIN_USER_IDS…)
# sont injectés par Coolify à l'exécution, jamais copiés dans l'image.
CMD ["node", "server.js"]
