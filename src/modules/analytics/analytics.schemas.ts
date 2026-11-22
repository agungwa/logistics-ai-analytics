import { z } from "zod";
import { DATE_RANGE_PRESETS } from "@/lib/date-range";

/**
 * Zod schemas validating every analytics query input — including arguments
 * proposed by the LLM. Anything failing these schemas is rejected before any
 * computation runs.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

export const MetricIdSchema = z.enum([
  "total_orders",
  "delivered_orders",
  "delayed_orders",
  "delivery_performance",
  "on_time_rate",
  "delay_rate",
  "avg_delivery_time",
  "total_order_value",
  "avg_order_value",
]);

export const DimensionIdSchema = z.enum([
  "carrier",
  "region",
  "warehouse",
  "product_category",
  "status",
  "destination_city",
  "origin_city",
]);

export const TimeBucketSchema = z.enum(["day", "week", "month"]);

export const FilterFieldSchema = z.enum([
  "carrier",
  "region",
  "warehouse",
  "product_category",
  "status",
  "destination_city",
  "origin_city",
]);

const stringArray = z.array(z.string().min(1)).max(50);

export const OrderFiltersSchema = parseStringified(
  z
    .object({
      carrier: stringArray.optional(),
      region: stringArray.optional(),
      warehouse: stringArray.optional(),
      product_category: stringArray.optional(),
      status: stringArray.optional(),
      destination_city: stringArray.optional(),
      origin_city: stringArray.optional(),
    })
    .strict()
);

/** LLMs (esp. via compatibility endpoints) sometimes stringify nested objects —
 *  parse JSON-string inputs before validating. */
function parseStringified<T extends z.ZodType>(schema: T) {
  return z.preprocess((v) => {
    if (typeof v === "string") {
      const s = v.trim();
      if (s.startsWith("{") || s.startsWith("[")) {
        try {
          return JSON.parse(s);
        } catch {
          return v;
        }
      }
    }
    return v;
  }, schema);
}

export const DateRangeSchema = parseStringified(
  z.union([z.enum(DATE_RANGE_PRESETS), z.strictObject({ from: isoDate, to: isoDate })])
);

export const AnalyticsQuerySchema = z
  .object({
    metric: MetricIdSchema,
    dimension: DimensionIdSchema.optional(),
    timeBucket: TimeBucketSchema.optional(),
    dateRange: DateRangeSchema.optional().default("all"),
    filters: OrderFiltersSchema.optional().default({}),
    sort: z.strictObject({ by: z.enum(["value", "key"]), dir: z.enum(["asc", "desc"]).optional() }).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).max(10000).optional().default(0),
  })
  .strict()
  .superRefine((v, ctx) => {
    // Early validation: reject unsupported metric × breakdown combos before any query runs.
    const isComparison = v.metric === "delivery_performance";
    if (v.timeBucket && !(COUNT_METRICS as readonly string[]).includes(v.metric) && !isComparison) {
      ctx.addIssue({
        code: "custom",
        path: ["metric"],
        message: `Metric '${v.metric}' is not supported over time buckets. Supported time-series metrics: ${COUNT_METRICS.join(", ")}, delivery_performance.`,
      });
    }
    if (v.dimension && !(GROUPABLE_METRICS as readonly string[]).includes(v.metric) && !isComparison) {
      ctx.addIssue({
        code: "custom",
        path: ["metric"],
        message: `Metric '${v.metric}' cannot be grouped by dimension. Supported grouped metrics: ${GROUPABLE_METRICS.join(", ")}, delivery_performance.`,
      });
    }
    if (v.dimension && v.timeBucket) {
      ctx.addIssue({
        code: "custom",
        path: ["dimension"],
        message: "Specify either a dimension breakdown or a time bucket, not both.",
      });
    }
    if (isComparison && !v.dimension && !v.timeBucket) {
      ctx.addIssue({
        code: "custom",
        path: ["metric"],
        message: "delivery_performance compares delivered vs delayed — it needs a timeBucket (trend) or a dimension (breakdown).",
      });
    }
  });

/** Metrics supported as a time series (counts only in v1). */
export const COUNT_METRICS = ["total_orders", "delivered_orders", "delayed_orders"] as const;
/** Metrics supported grouped by a dimension. */
export const GROUPABLE_METRICS = [
  ...COUNT_METRICS,
  "on_time_rate",
  "delay_rate",
  "total_order_value",
  "avg_order_value",
] as const;

export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>;

export const DashboardQuerySchema = z
  .object({
    dateRange: DateRangeSchema.optional().default("all"),
    filters: OrderFiltersSchema.optional().default({}),
  })
  .strict();

export type DashboardQuery = z.infer<typeof DashboardQuerySchema>;
