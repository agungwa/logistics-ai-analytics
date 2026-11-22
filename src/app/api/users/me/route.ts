import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { badRequest, serverError } from "@/lib/errors";
import { getSessionUser, hashPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * A signed-in user managing their own profile. Deliberately NOT behind a
 * permission: changing your own name or password must work for every account,
 * including a custom role with no dashboard access.
 */
async function requireSession(): Promise<{ userId: string } | { response: NextResponse }> {
  const user = await getSessionUser();
  if (!user) {
    return {
      response: NextResponse.json({ error: { code: "unauthenticated", message: "Sign in." } }, { status: 401 }),
    };
  }
  return { userId: user.id };
}

const UpdateSchema = z
  .strictObject({
    name: z.string().min(1).max(80).optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8).max(100).optional(),
  })
  .refine((v) => v.name !== undefined || v.newPassword !== undefined, { message: "Nothing to update." })
  .refine((v) => (v.newPassword ? Boolean(v.currentPassword) : true), {
    message: "Enter your current password to set a new one.",
  });

/** GET /api/users/me — the current session's profile. */
export async function GET() {
  try {
    const session = await requireSession();
    if ("response" in session) return session.response;
    return NextResponse.json({ user: await getSessionUser() });
  } catch (e) {
    console.error("[api/users/me GET]", e);
    return serverError();
  }
}

/** PATCH /api/users/me — update own display name and/or password. */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    if ("response" in session) return session.response;

    const parsed = UpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid update.");

    const user = await db.user.findUnique({ where: { id: session.userId } });
    if (!user) return badRequest("User not found.");

    const data: { name?: string; passwordHash?: string } = {};
    if (parsed.data.name) data.name = parsed.data.name.trim();

    if (parsed.data.newPassword) {
      if (user.passwordHash === "!") return badRequest("Activate your account via the invite link first.");
      const ok = await bcrypt.compare(parsed.data.currentPassword ?? "", user.passwordHash);
      if (!ok) return badRequest("Current password is incorrect.");
      data.passwordHash = await hashPassword(parsed.data.newPassword);
    }

    await db.user.update({ where: { id: user.id }, data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/users/me PATCH]", e);
    return serverError();
  }
}
