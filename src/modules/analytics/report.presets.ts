/**
 * Built-in report presets — deterministic, code-owned, available to every user.
 * Saved custom reports live in the DB; these are the starter library.
 */
export interface ReportPreset {
  name: string;
  description: string;
  query: {
    metric: string;
    dimension?: string;
    timeBucket?: string;
    dateRange?: string;
    filters?: Record<string, string[]>;
    sort?: { by: "value" | "key"; dir: "asc" | "desc" };
    limit?: number;
  };
}

/** Overview-page chart deep links: /explore?chart=<key> opens that exact query. */
export const OVERVIEW_CHART_PRESETS: Record<string, ReportPreset["query"]> = {
  volume: { metric: "total_orders", timeBucket: "month", dateRange: "all" },
  performance: { metric: "delivery_performance", timeBucket: "month", dateRange: "all" },
  carrier: { metric: "delay_rate", dimension: "carrier", dateRange: "all", sort: { by: "value", dir: "desc" } },
};

export const REPORT_PRESETS: ReportPreset[] = [
  {
    name: "Weekly delays (last 3 months)",
    description: "Delayed orders per week, Oct–Dec 2025",
    query: { metric: "delayed_orders", timeBucket: "week", dateRange: "last_3_months" },
  },
  {
    name: "Carrier delay ranking",
    description: "Delay rate by carrier with counts",
    query: { metric: "delay_rate", dimension: "carrier", dateRange: "all", sort: { by: "value", dir: "desc" } },
  },
  {
    name: "Regional delay rate",
    description: "Delay rate by region with counts",
    query: { metric: "delay_rate", dimension: "region", dateRange: "all", sort: { by: "value", dir: "desc" } },
  },
  {
    name: "Monthly order volume",
    description: "All orders per month, full year",
    query: { metric: "total_orders", timeBucket: "month", dateRange: "all" },
  },
  {
    name: "Delivered vs delayed trend",
    description: "Monthly delivered orders (pair with delayed preset)",
    query: { metric: "delivered_orders", timeBucket: "month", dateRange: "all" },
  },
  {
    name: "Order value by category",
    description: "Total USD value per product category",
    query: { metric: "total_order_value", dimension: "product_category", dateRange: "all", sort: { by: "value", dir: "desc" } },
  },
];
