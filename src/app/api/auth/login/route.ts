import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { login, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { badRequest, serverError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const LoginSchema = z.strictObject({ email: z.string().email(), password: z.string().min(6).max(100) });

export async function POST(req: NextRequest) {
  try {
    const parsed = LoginSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest("Provide a valid email and password (min 6 characters).");
    const token = await login(parsed.data.email, parsed.data.password);
    if (!token) {
      return NextResponse.json(
        { error: { code: "invalid_credentials", message: "Invalid email or password." } },
        { status: 401 }
      );
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (e) {
    console.error("[api/auth/login]", e);
    return serverError();
  }
}
