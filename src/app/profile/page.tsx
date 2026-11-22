import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { ProfileClient } from "@/components/profile/profile-client";

/** Any signed-in user can manage their own profile — no permission required. */
export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <ProfileClient name={user.name} email={user.email} role={user.roleName} />;
}
