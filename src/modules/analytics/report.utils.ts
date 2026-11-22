/**
 * Pure report helpers shared by the API routes and the browser (no server-only
 * imports here).
 */

/** Rows per page in the Explore data table (also used by the AI report route, so a
 *  generated report is already paged the way the table expects). */
export const EXPLORE_PAGE_SIZE = 10;

export const REPORT_CHART_TYPES = ["auto", "bar", "line", "pie"] as const;
export type ReportChartType = (typeof REPORT_CHART_TYPES)[number];

/** Per-user cap on saved reports. Protects against runaway creation via the API;
 *  far above real use, and reported in the UI rather than hidden. */
export const REPORT_LIMIT = 200;

export interface ReportQuery {
  metric: string;
  dimension?: string;
  timeBucket?: string;
  dateRange?: string | { from: string; to: string };
  filters?: Record<string, string[] | undefined>;
  sort?: { by: string; dir?: string } | null;
  limit?: number;
  offset?: number;
}

export interface ReportDto {
  id: string;
  name: string;
  query: ReportQuery;
  chartType: string;
  updatedAt: string;
}

/**
 * Stable identity of WHAT a report computes, ignoring paging and row limits.
 * Two requests for the same data (by hand or via the AI) produce the same key,
 * so the same report is never saved twice.
 */
export function canonicalQueryKey(q: ReportQuery): string {
  const filters = Object.entries(q.filters ?? {})
    .filter(([, v]) => Array.isArray(v) && v.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => [k, [...(v as string[])].sort()]);
  const dateRange =
    typeof q.dateRange === "string" || q.dateRange === undefined
      ? (q.dateRange ?? "all")
      : { from: q.dateRange.from, to: q.dateRange.to };
  // Sort only matters for breakdowns; treat "by value, descending" as the default.
  const sort = q.dimension ? (q.sort ? [q.sort.by, q.sort.dir ?? "asc"] : ["value", "desc"]) : null;
  return JSON.stringify({
    metric: q.metric,
    dimension: q.dimension ?? null,
    timeBucket: q.timeBucket ?? null,
    dateRange,
    filters,
    sort,
  });
}

const SHORT_METRIC: Record<string, string> = {
  total_orders: "Total orders",
  delivered_orders: "Delivered orders",
  delayed_orders: "Delayed orders",
  delivery_performance: "Delivered vs delayed",
  on_time_rate: "On-time rate",
  delay_rate: "Delay rate",
  avg_delivery_time: "Avg delivery time",
  total_order_value: "Order value",
  avg_order_value: "Avg order value",
};

const RANGE_LABEL: Record<string, string> = {
  all: "All time",
  last_7_days: "Last 7 days",
  last_1_month: "Last month",
  last_3_months: "Last 3 months",
  last_6_months: "Last 6 months",
  last_12_months: "Last 12 months",
  year_to_date: "Year to date",
};

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** One-line human summary for the report library, e.g. "Delay rate · by carrier · Last 3 months". */
export function summarizeQuery(q: ReportQuery): string {
  const parts: string[] = [SHORT_METRIC[q.metric] ?? q.metric];
  if (q.dimension) parts.push(`by ${q.dimension.replace(/_/g, " ")}`);
  if (q.timeBucket) parts.push(`per ${q.timeBucket}`);
  if (typeof q.dateRange === "string") {
    parts.push(RANGE_LABEL[q.dateRange] ?? q.dateRange);
  } else if (q.dateRange && q.dateRange.from && q.dateRange.to) {
    const sameYear = q.dateRange.from.slice(0, 4) === q.dateRange.to.slice(0, 4);
    parts.push(`${shortDate(q.dateRange.from)} – ${shortDate(q.dateRange.to)}${sameYear ? "" : `, ${q.dateRange.to.slice(0, 4)}`}`);
  }
  for (const [field, values] of Object.entries(q.filters ?? {})) {
    if (values && values.length > 0) parts.push(`${field.replace(/_/g, " ")}: ${values.join(", ")}`);
  }
  return parts.join(" · ");
}

/** Compact relative time for list rows: "just now", "5m ago", "3h ago", "2d ago". */
export function relativeTime(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
