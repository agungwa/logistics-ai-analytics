import { redirect } from "next/navigation";
import { can, getSessionUser, type Permission, type SessionUser } from "@/lib/auth";

/** Page guard for server components: redirects instead of throwing. */
export async function requirePage(permission: Permission): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user, permission)) redirect("/");
  return user;
}
