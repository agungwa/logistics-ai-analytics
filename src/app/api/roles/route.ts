import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guardApi } from "@/lib/api-guard";
import { badRequest, serverError } from "@/lib/errors";
import { ALL_PERMISSIONS } from "@/lib/auth";

export const dynamic = "force-dynamic";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "role"
  );
}

const RoleSchema = z.strictObject({
  name: z.string().min(1).max(40),
  description: z.string().max(120).optional(),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).min(1),
});

/** GET /api/roles — admin: all roles with user counts. */
export async function GET() {
  try {
    const guard = await guardApi("manageUsers");
    if (guard.response) return guard.response;

    const roles = await db.role.findMany({
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      include: { _count: { select: { users: true } } },
    });
    return NextResponse.json({
      roles: roles.map((r) => ({
        id: r.id,
        key: r.key,
        name: r.name,
        description: r.description,
        permissions: JSON.parse(r.permissions) as string[],
        isSystem: r.isSystem,
        userCount: r._count.users,
      })),
    });
  } catch (e) {
    console.error("[api/roles GET]", e);
    return serverError();
  }
}

/** POST /api/roles — admin: create a custom role. */
export async function POST(req: NextRequest) {
  try {
    const guard = await guardApi("manageUsers");
    if (guard.response) return guard.response;

    const parsed = RoleSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
    const { name, description, permissions } = parsed.data;

    let key = slugify(name);
    if (await db.role.findUnique({ where: { key } })) {
      let n = 2;
      while (await db.role.findUnique({ where: { key: `${key}-${n}` } })) n++;
      key = `${key}-${n}`;
    }

    const role = await db.role.create({
      data: { key, name: name.trim(), description, permissions: JSON.stringify(permissions) },
    });
    return NextResponse.json({ id: role.id, key: role.key });
  } catch (e) {
    console.error("[api/roles POST]", e);
    return serverError();
  }
}
