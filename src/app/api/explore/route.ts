import { NextRequest, NextResponse } from "next/server";
import { AnalyticsService } from "@/modules/analytics/analytics.service";
import { AnalyticsQuerySchema } from "@/modules/analytics/analytics.schemas";
import { badRequest, serverError } from "@/lib/errors";
import { guardApi } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

const svc = new AnalyticsService();

/**
 * POST /api/explore — the dynamic chart builder endpoint. Takes the same
 * validated query shape the AI tool uses (minus the LLM) and returns rows +
 * a server-selected chart spec. Satisfies "Dynamic Chart Generation" as a
 * first-class user feature, not just an AI behavior.
 */
export async function POST(req: NextRequest) {
  try {
    const guard = await guardApi("exploreReports");
    if (guard.response) return guard.response;

    const parsed = AnalyticsQuerySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
    const result = await svc.queryMetric(parsed.data);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[api/explore]", e);
    const message = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: { code: "bad_request", message } }, { status: 400 });
  }
}
