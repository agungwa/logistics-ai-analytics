import { requirePage } from "@/lib/page-guard";
import { UsersClient } from "@/components/admin/users-client";

export default async function UsersAdminPage() {
  const user = await requirePage("manageUsers");
  return <UsersClient currentUserId={user.id} currentRoleKey={user.roleKey} />;
}
