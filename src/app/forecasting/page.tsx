import { requirePage } from "@/lib/page-guard";
import { ForecastingClient } from "@/components/forecasting/forecasting-client";

export default async function ForecastingPage() {
  await requirePage("viewForecasting");
  return <ForecastingClient />;
}
