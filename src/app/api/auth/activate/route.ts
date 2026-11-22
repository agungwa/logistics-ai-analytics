import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { badRequest, serverError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const ActivateSchema = z.strictObject({ token: z.string().min(10).max(128), password: z.string().min(8).max(100) });

/** POST /api/auth/activate — invited user sets their password; invite consumed. */
export async function POST(req: NextRequest) {
  try {
    const parsed = ActivateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest("Provide the invite token and a password of at least 8 characters.");

    const user = await db.user.findUnique({ where: { inviteToken: parsed.data.token } });
    if (!user || !user.inviteExpiresAt || user.inviteExpiresAt < new Date()) {
      return badRequest("This invite link is invalid or has expired. Ask an admin for a new one.");
    }

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(parsed.data.password), inviteToken: null, inviteExpiresAt: null },
    });
    return NextResponse.json({ ok: true, email: user.email });
  } catch (e) {
    console.error("[api/auth/activate]", e);
    return serverError();
  }
}
