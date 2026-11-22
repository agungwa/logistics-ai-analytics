import { NextRequest, NextResponse } from "next/server";
import { AnalyticsService } from "@/modules/analytics/analytics.service";
import { DashboardQuerySchema } from "@/modules/analytics/analytics.schemas";
import { badRequest, serverError } from "@/lib/errors";
import { guardApi } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

const svc = new AnalyticsService();

/** GET /api/dashboard?dateRange=last_3_months&filters.carrier=DHL — KPIs + chart series. */
export async function GET(req: NextRequest) {
  try {
    const guard = await guardApi("viewDashboard");
    if (guard.response) return guard.response;
    const sp = req.nextUrl.searchParams;
    const raw = {
      dateRange: sp.get("dateRange") ?? undefined,
      filters: parseFiltersParam(sp.get("filters")),
    };
    const parsed = DashboardQuerySchema.safeParse({
      dateRange: raw.dateRange && raw.dateRange !== "" ? raw.dateRange : "all",
      filters: raw.filters ?? {},
    });
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
    const data = await svc.getDashboard(parsed.data.dateRange, parsed.data.filters);
    return NextResponse.json(data);
  } catch (e) {
    console.error("[api/dashboard]", e);
    return serverError();
  }
}

// filters arrive as JSON: ?filters={"carrier":["DHL"],"region":["US-C"]}
function parseFiltersParam(value: string | null): unknown {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return { __invalid__: true };
  }
}
