import { requirePage } from "@/lib/page-guard";
import { can } from "@/lib/auth";
import { ExploreClient } from "@/components/explore/explore-client";

export default async function ExplorePage() {
  const user = await requirePage("exploreReports");
  return <ExploreClient canUseAi={can(user, "useAiAnalyst")} />;
}
