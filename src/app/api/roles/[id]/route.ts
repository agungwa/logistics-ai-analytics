import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guardApi } from "@/lib/api-guard";
import { badRequest, notFound, serverError } from "@/lib/errors";
import { ALL_PERMISSIONS } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PatchSchema = z.strictObject({
  name: z.string().min(1).max(40).optional(),
  description: z.string().max(120).optional(),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).min(1).optional(),
});

/** PATCH /api/roles/:id — admin: edit a role's name/description/permissions.
 *  Guards: you cannot remove "manageUsers" from your OWN role (self-lockout),
 *  and a role must always keep at least one permission. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await guardApi("manageUsers");
    if (guard.response) return guard.response;

    const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));

    const { id } = await params;
    const role = await db.role.findUnique({ where: { id }, include: { users: { select: { id: true } } } });
    if (!role) return notFound("Role not found.");

    // Self-lockout guard: editing the role you hold must keep manageUsers.
    const ownRole = role.users.some((u) => u.id === guard.user.id);
    if (ownRole && parsed.data.permissions && !parsed.data.permissions.includes("manageUsers")) {
      return badRequest("You can't remove user management from the role you hold — that would lock you out.");
    }

    await db.role.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.permissions !== undefined ? { permissions: JSON.stringify(parsed.data.permissions) } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/roles/:id PATCH]", e);
    return serverError();
  }
}

/** DELETE /api/roles/:id — admin: delete a custom role with no users assigned.
 *  Built-in roles and roles still in use cannot be deleted. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await guardApi("manageUsers");
    if (guard.response) return guard.response;

    const { id } = await params;
    const role = await db.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!role) return notFound("Role not found.");
    if (role.isSystem) return badRequest("Built-in roles can't be deleted — edit their permissions instead.");
    if (role._count.users > 0) return badRequest(`${role._count.users} user(s) still have this role — move them first.`);

    await db.role.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/roles/:id DELETE]", e);
    return serverError();
  }
}
