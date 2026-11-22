import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { guardApi } from "@/lib/api-guard";
import { badRequest, serverError } from "@/lib/errors";
import { sendInviteEmail } from "@/lib/mailer";

export const dynamic = "force-dynamic";

/** GET /api/users — admin: users with role and status. */
export async function GET() {
  try {
    const guard = await guardApi("manageUsers");
    if (guard.response) return guard.response;

    const users = await db.user.findMany({
      orderBy: { createdAt: "asc" },
      include: { roleRef: { select: { id: true, key: true, name: true } } },
    });
    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        roleId: u.roleRef?.id ?? null,
        roleName: u.roleRef?.name ?? "(no role)",
        status: u.status,
        createdAt: u.createdAt,
        invitePending: Boolean(u.inviteToken && u.inviteExpiresAt && u.inviteExpiresAt > new Date()),
      })),
    });
  } catch (e) {
    console.error("[api/users GET]", e);
    return serverError();
  }
}

const InviteSchema = z.strictObject({
  email: z.string().email(),
  name: z.string().min(1).max(80),
  roleId: z.string().min(1),
});

/** POST /api/users — admin: invite a user by email with a role. Sends the
 *  invite over SMTP when configured; the link is also returned as a fallback. */
export async function POST(req: NextRequest) {
  try {
    const guard = await guardApi("manageUsers");
    if (guard.response) return guard.response;

    const parsed = InviteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest("Provide email, name and a role.");
    const { email, name, roleId } = parsed.data;
    const normalized = email.trim().toLowerCase();

    const role = await db.role.findUnique({ where: { id: roleId } });
    if (!role) return badRequest("That role no longer exists — refresh and try again.");

    const existing = await db.user.findUnique({ where: { email: normalized } });
    if (existing) return badRequest(`A user with ${normalized} already exists.`);

    const token = randomBytes(24).toString("hex");
    await db.user.create({
      data: {
        email: normalized,
        name,
        roleId,
        passwordHash: "!", // unusable until the invitee sets a password
        inviteToken: token,
        inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const origin = req.nextUrl.origin;
    const inviteUrl = `${origin}/login?invite=${token}`;
    const emailed = await sendInviteEmail(normalized, name, inviteUrl, role.key, guard.user.name);
    return NextResponse.json({ inviteUrl, emailed });
  } catch (e) {
    console.error("[api/users POST]", e);
    return serverError();
  }
}

const PatchSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1).max(80).optional(),
  email: z.string().email().optional(),
  roleId: z.string().min(1).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

/** PATCH /api/users — admin: edit a user (name, email, role) or activate/deactivate.
 *  Guards: you cannot change your own role or deactivate yourself. */
export async function PATCH(req: NextRequest) {
  try {
    const guard = await guardApi("manageUsers");
    if (guard.response) return guard.response;

    const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest("Invalid update.");
    const { id, name, email, roleId, status } = parsed.data;

    const target = await db.user.findUnique({ where: { id } });
    if (!target) return badRequest("User not found.");

    if (id === guard.user.id && (roleId !== undefined || status !== undefined)) {
      return badRequest("You cannot change your own role or deactivate yourself — ask another admin.");
    }
    if (roleId) {
      const role = await db.role.findUnique({ where: { id: roleId } });
      if (!role) return badRequest("That role no longer exists — refresh and try again.");
    }
    if (email && email.trim().toLowerCase() !== target.email) {
      const clash = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
      if (clash) return badRequest(`A user with ${email} already exists.`);
    }

    await db.user.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(email !== undefined ? { email: email.trim().toLowerCase() } : {}),
        ...(roleId !== undefined ? { roleId } : {}),
        ...(status !== undefined ? { status } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/users PATCH]", e);
    return serverError();
  }
}

/** DELETE /api/users?id= — admin: remove a user (never yourself). */
export async function DELETE(req: NextRequest) {
  try {
    const guard = await guardApi("manageUsers");
    if (guard.response) return guard.response;

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return badRequest("Provide the user id.");
    if (id === guard.user.id) return badRequest("You cannot delete your own account.");
    const user = await db.user.findUnique({ where: { id } });
    if (!user) return badRequest("User not found.");
    await db.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/users DELETE]", e);
    return serverError();
  }
}
