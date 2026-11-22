import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardApi } from "@/lib/api-guard";
import { badRequest, notFound, serverError } from "@/lib/errors";
import { deleteReport, renameReport } from "@/modules/reports/report.service";

export const dynamic = "force-dynamic";

const RenameSchema = z.strictObject({ name: z.string().min(1).max(80) });

/** PATCH /api/reports/:id { name } — rename one of the caller's reports. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await guardApi("exploreReports");
    if (guard.response) return guard.response;

    const parsed = RenameSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest("Provide a report name (1–80 characters).");

    const { id } = await params;
    const renamed = await renameReport(guard.user.id, id, parsed.data.name);
    if (!renamed.ok) {
      return renamed.message === "Report not found." ? notFound(renamed.message) : badRequest(renamed.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/reports/:id PATCH]", e);
    return serverError();
  }
}

/** DELETE /api/reports/:id — delete one of the caller's saved reports. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await guardApi("exploreReports");
    if (guard.response) return guard.response;

    const { id } = await params;
    const deleted = await deleteReport(guard.user.id, id);
    if (!deleted) return notFound("Report not found.");
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/reports/:id DELETE]", e);
    return serverError();
  }
}
