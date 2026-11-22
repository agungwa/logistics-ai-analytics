import { NextResponse } from "next/server";
import { can, getSessionUser, type Permission, type SessionUser } from "@/lib/auth";

/** API-route guard: returns { user } on success or { response } with 401/403. */
export async function guardApi(permission: Permission): Promise<{ user: SessionUser; response?: never } | { user?: never; response: NextResponse }> {
  const user = await getSessionUser();
  if (!user) {
    return {
      response: NextResponse.json(
        { error: { code: "unauthenticated", message: "Sign in to use this endpoint." } },
        { status: 401 }
      ),
    };
  }
  if (!can(user, permission)) {
    return {
      response: NextResponse.json(
        { error: { code: "forbidden", message: `Your role (${user.roleName}) does not have access to this feature.` } },
        { status: 403 }
      ),
    };
  }
  return { user };
}
