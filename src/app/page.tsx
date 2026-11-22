import { requirePage } from "@/lib/page-guard";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

export default async function DashboardPage() {
  const user = await requirePage("viewDashboard");
  return <DashboardClient userName={user.name} role={user.roleName} />;
}
