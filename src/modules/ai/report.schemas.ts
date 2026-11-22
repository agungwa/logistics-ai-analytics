import { z } from "zod";
import { AnalyticsQuerySchema } from "@/modules/analytics/analytics.schemas";
import { REPORT_CHART_TYPES } from "@/modules/analytics/report.utils";

/**
 * Contracts for saved reports. A saved report = a name + one validated
 * analytics query + a chart type. The AI draft adds a title and is validated
 * by exactly the same query schema a human uses in the Explore builder.
 */

/** What the AI returns for a natural-language request: a short title + one analytics query. */
export const ReportDraftSchema = z.strictObject({
  title: z.string().min(2).max(120), // generous; the server clips titles to 80 characters
  query: AnalyticsQuerySchema,
});
export type ReportDraft = z.infer<typeof ReportDraftSchema>;

/** Manual save from the Explore builder. Saving under an existing name updates that report. */
export const SaveReportSchema = z.strictObject({
  name: z.string().min(1).max(80),
  query: AnalyticsQuerySchema,
  chartType: z.enum(REPORT_CHART_TYPES).optional().default("auto"),
});
export type SaveReportInput = z.infer<typeof SaveReportSchema>;
