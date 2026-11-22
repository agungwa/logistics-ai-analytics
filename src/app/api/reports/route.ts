import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardApi } from "@/lib/api-guard";
import { badRequest, serverError } from "@/lib/errors";
import { SaveReportSchema } from "@/modules/ai/report.schemas";
import { listReports, saveReport } from "@/modules/reports/report.service";

export const dynamic = "force-dynamic";

const ListQuery = z.object({
  q: z.string().max(80).optional(),
  page: z.coerce.number().int().min(0).max(500).optional().default(0),
  pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
});

/** GET /api/reports?q=&page=&pageSize= — the caller's saved reports, newest first, searchable and paged. */
export async function GET(req: NextRequest) {
  try {
    const guard = await guardApi("exploreReports");
    if (guard.response) return guard.response;

    const parsed = ListQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    if (!parsed.success) return badRequest("Invalid list parameters.");
    const { q = "", page, pageSize } = parsed.data;

    const { reports, total, limit } = await listReports(guard.user.id, q.trim(), page, pageSize);
    return NextResponse.json({ reports, total, limit, page, pageSize });
  } catch (e) {
    console.error("[api/reports GET]", e);
    return serverError();
  }
}

/** POST /api/reports { name, query, chartType? } — save a report definition.
 *  Saving under an existing name updates that report instead of duplicating it. */
export async function POST(req: NextRequest) {
  try {
    const guard = await guardApi("exploreReports");
    if (guard.response) return guard.response;

    const parsed = SaveReportSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }

    const saved = await saveReport(guard.user.id, parsed.data);
    if (!saved.ok) return badRequest(saved.message);
    return NextResponse.json({ report: saved.report, updatedExisting: saved.updatedExisting });
  } catch (e) {
    console.error("[api/reports POST]", e);
    return serverError();
  }
}
