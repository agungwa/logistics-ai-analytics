/**
 * Ensures the three built-in roles exist. Safe to re-run (upserts by key).
 * Run before prisma/seed-users.ts, which assigns users to roles by key.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const SYSTEM_ROLES = [
  {
    key: "admin",
    name: "Admin",
    description: "Full access, including user and role management.",
    permissions: [
      "viewDashboard",
      "viewOrders",
      "exploreReports",
      "useAiAnalyst",
      "viewForecasting",
      "deleteConversation",
      "manageUsers",
    ],
  },
  {
    key: "analyst",
    name: "Analyst",
    description: "All analytics and AI chat; cannot delete chats or manage users.",
    permissions: ["viewDashboard", "viewOrders", "exploreReports", "useAiAnalyst", "viewForecasting"],
  },
  {
    key: "viewer",
    name: "Viewer",
    description: "Read-only dashboards, orders and saved reports.",
    permissions: ["viewDashboard", "viewOrders", "exploreReports"],
  },
];

async function main() {
  for (const role of SYSTEM_ROLES) {
    await db.role.upsert({
      where: { key: role.key },
      update: { name: role.name, description: role.description, permissions: JSON.stringify(role.permissions) },
      create: { ...role, permissions: JSON.stringify(role.permissions), isSystem: true },
    });
  }
  const roles = await db.role.findMany({ where: { key: { in: SYSTEM_ROLES.map((r) => r.key) } } });
  console.log(`Roles: ${roles.length} system roles ensured.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
