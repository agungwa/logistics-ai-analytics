/**
 * Seeds demo users for the login page, assigning built-in roles by key.
 *   admin@demo.com    / demo1234  → Admin (everything)
 *   analyst@demo.com  / demo1234  → Analyst (analytics + AI chat)
 *   viewer@demo.com   / demo1234  → Viewer (dashboards only)
 * Run prisma/migrate-roles.ts first if roles are missing.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const USERS = [
  { email: "admin@demo.com", name: "Admin User", roleKey: "admin" },
  { email: "analyst@demo.com", name: "Analyst User", roleKey: "analyst" },
  { email: "viewer@demo.com", name: "Viewer User", roleKey: "viewer" },
];

async function main() {
  const roles = await db.role.findMany({ where: { key: { in: USERS.map((u) => u.roleKey) } } });
  if (roles.length < 3) {
    throw new Error("Built-in roles missing — run `npx tsx prisma/migrate-roles.ts` first.");
  }
  const byKey = new Map(roles.map((r) => [r.key, r.id]));

  const hash = await bcrypt.hash("demo1234", 10);
  for (const u of USERS) {
    await db.user.upsert({
      where: { email: u.email },
      update: { roleId: byKey.get(u.roleKey)!, status: "active" },
      create: { email: u.email, name: u.name, passwordHash: hash, roleId: byKey.get(u.roleKey)!, status: "active" },
    });
  }
  const count = await db.user.count();
  console.log(`Users seeded: ${count} (admin/analyst/viewer @demo.com, password: demo1234)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
