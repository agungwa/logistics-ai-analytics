import type { DateRangePreset } from "@/lib/date-range";

export type MetricId =
  | "total_orders"
  | "delivered_orders"
  | "delayed_orders"
  | "delivery_performance"
  | "on_time_rate"
  | "delay_rate"
  | "avg_delivery_time"
  | "total_order_value"
  | "avg_order_value";

export type DimensionId =
  | "carrier"
  | "region"
  | "warehouse"
  | "product_category"
  | "status"
  | "destination_city"
  | "origin_city";

export type TimeBucket = "day" | "week" | "month";

export type FilterField =
  | "carrier"
  | "region"
  | "warehouse"
  | "product_category"
  | "status"
  | "destination_city"
  | "origin_city";

export interface OrderFilters {
  carrier?: string[];
  region?: string[];
  warehouse?: string[];
  product_category?: string[];
  status?: string[];
  destination_city?: string[];
  origin_city?: string[];
}

export interface StatusCounts {
  delivered: number;
  delayed: number;
  in_transit: number;
  exception: number;
  canceled: number;
}

export interface Kpis {
  total_orders: number;
  delivered_orders: number;
  delayed_orders: number;
  /** delivered / (delivered + delayed) * 100 — status-based proxy, disclosed */
  on_time_rate: number | null;
  /** delayed / (delivered + delayed) * 100 */
  delay_rate: number | null;
  /** avg calendar days delivery_date - order_date, delivered+delayed only */
  avg_delivery_time: number | null;
  total_order_value: number;
  avg_order_value: number;
}

export interface QueryPlan {
  metric: MetricId;
  metricLabel: string;
  unit: string;
  dimension: DimensionId | null;
  timeBucket: TimeBucket | null;
  filters: OrderFilters;
  dateRange: { from: string; to: string; anchor: string; preset: string; label: string };
  notes: string[];
}

export type ChartType = "line" | "bar" | "pie";

export interface ChartSpec {
  type: ChartType;
  title: string;
  xKey: string;
  yKey: string;
  xLabel: string;
  yLabel: string;
  unit: string;
  /** Null values create gaps in line charts (e.g. history vs forecast series). */
  data: Array<Record<string, string | number | null>>;
  /** Optional multi-series definition (e.g. delivered vs delayed). Single series uses yKey. */
  series?: Array<{ key: string; name: string; colorRole: "primary" | "accent"; dashed?: boolean }>;
  /** Optional uncertainty band behind the lines (low/high keys). */
  band?: { lowKey: string; highKey: string };
}

export interface MetricRow {
  key: string;
  value: number;
  numerator?: number;
  denominator?: number;
  /** Present only for the delivery_performance comparison metric. */
  delivered?: number;
  delayed?: number;
}

export interface AnalyticsResult {
  rows: MetricRow[];
  /** Total rows matching the query before pagination (rows.length = page size). */
  totalRows: number;
  queryPlan: QueryPlan;
  chart: ChartSpec | null;
}
