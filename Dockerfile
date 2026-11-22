# Multi-stage build: dependencies -> build -> slim runtime.
FROM node:20-alpine AS deps
WORKDIR /app
# `npm ci` runs `prisma generate` (postinstall), which requires a value here.
# Nothing connects to a database during the build.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
COPY package.json package-lock.json ./
# `npm ci` runs `prisma generate` (postinstall), which needs the schema.
COPY prisma ./prisma
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma client generates during `postinstall`/build; DATABASE_URL is only
# needed at runtime, but prisma generate wants a dummy value to parse the schema.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh
EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
