# Node patch and multi-platform image digest are deliberately pinned.
FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
# Only public settings may be build arguments. Never pass DATABASE_URL here.
ARG NEXT_PUBLIC_YANDEX_METRIKA_ID=""
ENV NEXT_PUBLIC_SITE_URL=https://snowdex.ru \
    NEXT_PUBLIC_YANDEX_METRIKA_ID=${NEXT_PUBLIC_YANDEX_METRIKA_ID} \
    SNOWDEX_SHADOW_MODE=true \
    DATABASE_URL=" " \
    DATABASE_SSL=disable
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production \
    SNOWDEX_SHADOW_MODE=true \
    NEXT_PUBLIC_SITE_URL=https://snowdex.ru \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN groupadd --gid 1001 snowdex && useradd --uid 1001 --gid snowdex --no-create-home snowdex
COPY --from=builder --chown=snowdex:snowdex /app/.next/standalone ./
COPY --from=builder --chown=snowdex:snowdex /app/.next/static ./.next/static
COPY --from=builder --chown=snowdex:snowdex /app/public ./public
RUN mkdir -p .next/cache && chown snowdex:snowdex .next/cache
USER snowdex
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health',{signal:AbortSignal.timeout(4000),redirect:'error'}).then(async r=>process.exit(r.status===200 && await r.text()==='ok'?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
