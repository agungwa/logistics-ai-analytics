import { NextResponse } from "next/server";
import { AnalyticsService } from "@/modules/analytics/analytics.service";
import { serverError } from "@/lib/errors";
import { guardApi } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

/** GET /api/metadata — dataset date range, dimension values, supported metrics. */
export async function GET() {
  try {
    const guard = await guardApi("viewDashboard");
    if (guard.response) return guard.response;
    const metadata = await new AnalyticsService().getMetadata();
    return NextResponse.json(metadata);
  } catch (e) {
    console.error("[api/metadata]", e);
    return serverError();
  }
}
