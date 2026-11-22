import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardApi } from "@/lib/api-guard";
import { badRequest, serverError } from "@/lib/errors";
import { createProvider } from "@/modules/ai/providers";
import { readAiOverrideHeaders } from "@/modules/ai/providers/overrides";
import { OrchestratorService } from "@/modules/ai/orchestrator.service";
import { ReportDraftSchema } from "@/modules/ai/report.schemas";
import { AnalyticsService } from "@/modules/analytics/analytics.service";
import { saveAiReport } from "@/modules/reports/report.service";
import { FixedWindowRateLimiter } from "@/lib/rate-limit";
import { EXPLORE_PAGE_SIZE } from "@/modules/analytics/report.utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GenerateSchema = z.strictObject({ prompt: z.string().min(3).max(300) });

const limiter = new FixedWindowRateLimiter(6, 60_000);
const analytics = new AnalyticsService();

/**
 * POST /api/reports/generate { prompt } — create a report from natural language.
 *
 * Flow: the AI returns a title + ONE analytics query -> the query is validated
 * by the same schema the Explore builder uses -> we EXECUTE it to confirm it
 * returns data -> only then is it saved. The AI never produces report values;
 * it only fills in the report definition.
 */
export async function POST(req: NextRequest) {
  try {
    const guard = await guardApi("useAiAnalyst");
    if (guard.response) return guard.response;

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (limiter.take(`${guard.user.id}:${ip}`) === 0) {
      return NextResponse.json(
        { error: { code: "rate_limited", message: "Too many AI report requests — wait a minute and try again." } },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const parsed = GenerateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest("Describe the report in 3–300 characters.");

    const raw = await new OrchestratorService(createProvider(readAiOverrideHeaders(req))).composeReport(parsed.data.prompt);
    if (!raw) {
      return badRequest("The AI couldn't turn that into a report. Try describing what to measure and how to break it down — for example, \"which carriers had the worst delay rate last quarter?\"");
    }

    const draft = ReportDraftSchema.safeParse(raw);
    if (!draft.success) {
      return badRequest(`The AI produced a report definition we can't run (${draft.error.issues[0]?.message ?? "invalid"}). Try rephrasing.`);
    }

    // Execute BEFORE saving: a report is only saved if it actually returns data.
    const pagedQuery = { ...draft.data.query, limit: EXPLORE_PAGE_SIZE, offset: 0 };
    const result = await analytics.queryMetric(pagedQuery);
    if (result.rows.length === 0) {
      return badRequest("That report came back empty for this dataset, so it wasn't saved. Try a wider date range or a different breakdown.");
    }

    const saved = await saveAiReport(guard.user.id, draft.data.title, draft.data.query);
    if (!saved.ok) return badRequest(saved.message);

    return NextResponse.json({ report: saved.report, result, updatedExisting: saved.updatedExisting });
  } catch (e) {
    console.error("[api/reports/generate]", e);
    const message = e instanceof Error ? e.message : "Unexpected error";
    return serverError(message.includes("AI_") || message.includes("provider") ? message : undefined);
  }
}
