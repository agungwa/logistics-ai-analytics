#!/bin/sh
# Waits for Postgres, applies the schema, seeds the dataset + demo users (all
# idempotent), then starts Next.js.
set -e

echo "Waiting for PostgreSQL…"
node -e "
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  for (let i = 0; i < 60; i++) {
    try { await db.\$queryRaw\`SELECT 1\`; console.log('Postgres is up.'); process.exit(0); }
    catch (e) { await wait(1000); }
  }
  console.error('Postgres never became reachable.'); process.exit(1);
})();
"

echo "Applying schema…"
npx prisma db push --skip-generate

echo "Seeding roles, demo users and the logistics dataset…"
npx tsx prisma/migrate-roles.ts
npx tsx prisma/seed-users.ts
npx tsx prisma/seed.ts

echo "Starting app on :3000"
exec npm start
