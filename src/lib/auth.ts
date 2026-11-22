import { cookies } from "next/headers";
// Re-exported for existing imports; the catalog lives in lib/permissions (client-safe).
export { PERMISSION_KEYS, ALL_PERMISSIONS } from "@/lib/permissions";
export type { Permission } from "@/lib/permissions";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import { requireEnv } from "@/lib/env";
import { ALL_PERMISSIONS, type Permission } from "@/lib/permissions";

/**
 * Auth: stateless JWT (HS256 via jose) for AUTHENTICATION, database-backed
 * roles for AUTHORIZATION. The token carries only the user's identity —
 * permissions are read from the user's role on every guarded request, so
 * deactivating a user or editing a role takes effect immediately, not at the
 * next login. (The trade-off is one small indexed lookup per request — the
 * right call at this scale; larger systems cache this or use short-lived
 * access tokens.)
 *
 * Roles live in the Role table (key, name, permissions JSON). Built-in roles
 * (admin/analyst/viewer) are system roles: their permission matrix is editable
 * but they cannot be deleted. Admins can create custom roles.
 */

export const SESSION_COOKIE = "logistics_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  roleKey: string;
  roleName: string;
  permissions: Permission[];
}

function secret(): Uint8Array {
  return new TextEncoder().encode(requireEnv("AUTH_SECRET"));
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function login(email: string, password: string): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { roleRef: true },
  });
  if (!user || user.passwordHash === "!") return null; // "!" = invited, not yet activated
  if (user.status !== "active") return null; // deactivated accounts cannot sign in
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;

  return new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  let userId: string;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    userId = payload.sub;
  } catch {
    return null; // invalid or expired token
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    include: { roleRef: true },
  });
  if (!user || user.status !== "active" || !user.roleRef) return null;

  let permissions: string[] = [];
  try {
    permissions = JSON.parse(user.roleRef.permissions);
  } catch {
    permissions = [];
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roleKey: user.roleRef.key,
    roleName: user.roleRef.name,
    permissions: permissions.filter((p): p is Permission => (ALL_PERMISSIONS as string[]).includes(p)),
  };
}

/** Logout clears the cookie; there is no server-side session to revoke. */
export async function logout(): Promise<void> {
  return;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

// --- Authorization ---------------------------------------------------------

export function can(user: SessionUser | null, permission: Permission): boolean {
  if (!user) return false;
  return user.permissions.includes(permission);
}
