import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { SaveReportInput } from "@/modules/ai/report.schemas";
import {
  REPORT_LIMIT,
  canonicalQueryKey,
  type ReportDto,
  type ReportQuery,
} from "@/modules/analytics/report.utils";

/**
 * Saved-report persistence. One place for the rules:
 *  - Saving under an existing name updates that report (no "Weekly delays (7)").
 *  - AI generation reuses a report whose query already exists (no duplicate data).
 *  - Each user is capped at REPORT_LIMIT; the limit is reported, not hidden.
 */

const NAME_MAX = 80;

function toReportDto(r: { id: string; name: string; queryJson: string; chartType: string; updatedAt: Date }): ReportDto {
  return { id: r.id, name: r.name, query: JSON.parse(r.queryJson) as ReportQuery, chartType: r.chartType ?? "auto", updatedAt: r.updatedAt.toISOString() };
}

function clipName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > NAME_MAX ? `${trimmed.slice(0, NAME_MAX - 1).trimEnd()}…` : trimmed;
}

type Saved = { ok: true; report: ReportDto; updatedExisting: boolean } | { ok: false; message: string };
type Status = { ok: true } | { ok: false; message: string };

const LIMIT_MESSAGE = `You've reached the ${REPORT_LIMIT}-report limit. Delete reports you no longer need in Saved reports, then try again.`;

async function assertRoom(userId: string): Promise<string | null> {
  const count = await db.report.count({ where: { userId } });
  return count >= REPORT_LIMIT ? LIMIT_MESSAGE : null;
}

/** Manual save from the Explore builder — keyed by name. */
export async function saveReport(userId: string, input: SaveReportInput): Promise<Saved> {
  const name = clipName(input.name);
  if (!name) return { ok: false, message: "Give the report a name." };
  const queryJson = JSON.stringify(input.query);
  const queryKey = canonicalQueryKey(input.query);

  const existing = await db.report.findUnique({ where: { userId_name: { userId, name } } });
  if (existing) {
    const updated = await db.report.update({
      where: { id: existing.id },
      data: { queryJson, queryKey, chartType: input.chartType },
    });
    return { ok: true, report: toReportDto(updated), updatedExisting: true };
  }

  const limitHit = await assertRoom(userId);
  if (limitHit) return { ok: false, message: limitHit };

  const created = await db.report.create({
    data: { userId, name, queryJson, queryKey, chartType: input.chartType },
  });
  return { ok: true, report: toReportDto(created), updatedExisting: false };
}

/** AI-generated report — keyed by the query itself, so the same data is never saved twice. */
export async function saveAiReport(userId: string, title: string, query: ReportQuery): Promise<Saved> {
  const queryKey = canonicalQueryKey(query);

  const existing = await db.report.findFirst({ where: { userId, queryKey } });
  if (existing) {
    // Same data already saved: reuse that report and keep the name the user
    // may have chosen for it. Bumping updatedAt floats it to the top.
    const updated = await db.report.update({ where: { id: existing.id }, data: { updatedAt: new Date() } });
    return { ok: true, report: toReportDto(updated), updatedExisting: true };
  }

  const limitHit = await assertRoom(userId);
  if (limitHit) return { ok: false, message: limitHit };

  const name = await uniqueReportTitle(userId, clipName(title) || "Untitled report");
  const created = await db.report.create({
    data: { userId, name, queryJson: JSON.stringify(query), queryKey, chartType: "auto" },
  });
  return { ok: true, report: toReportDto(created), updatedExisting: false };
}

/** Pick a free name: "Title", "Title (2)", "Title (3)"… (names are unique per user). */
async function uniqueReportTitle(userId: string, base: string): Promise<string> {
  const taken = new Set((await db.report.findMany({ where: { userId }, select: { name: true } })).map((r) => r.name));
  if (!taken.has(base)) return base;
  for (let i = 2; i <= 99; i++) {
    const candidate = `${base} (${i})`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base} (${new Date().toISOString().slice(0, 10)})`;
}

export async function listReports(
  userId: string,
  q: string,
  page: number,
  pageSize: number
): Promise<{ reports: ReportDto[]; total: number; limit: number }> {
  const where: Prisma.ReportWhereInput = {
    userId,
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
  };
  const [total, rows] = await Promise.all([
    db.report.count({ where }),
    db.report.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      skip: page * pageSize,
      take: pageSize,
    }),
  ]);
  return { reports: rows.map(toReportDto), total, limit: REPORT_LIMIT };
}

export async function renameReport(userId: string, id: string, newName: string): Promise<Status> {
  const name = clipName(newName);
  if (!name) return { ok: false, message: "The report needs a name." };
  const report = await db.report.findFirst({ where: { id, userId } });
  if (!report) return { ok: false, message: "Report not found." };
  if (report.name === name) return { ok: true };
  const clash = await db.report.findUnique({ where: { userId_name: { userId, name } } });
  if (clash) return { ok: false, message: `You already have a report named "${name}". Choose a different name.` };
  await db.report.update({ where: { id }, data: { name } });
  return { ok: true };
}

/** Returns false when the report doesn't exist (or belongs to someone else). */
export async function deleteReport(userId: string, id: string): Promise<boolean> {
  const report = await db.report.findFirst({ where: { id, userId } });
  if (!report) return false;
  await db.report.delete({ where: { id } });
  return true;
}
