import { z } from "zod";
import { AnalyticsQuerySchema } from "@/modules/analytics/analytics.schemas";
import { AnalyticsService } from "@/modules/analytics/analytics.service";
import { METRIC_REGISTRY, SUPPORTED_METRICS } from "@/modules/analytics/metrics.registry";
import type { AnalyticsResult } from "@/modules/analytics/analytics.types";
import { ForecastService, type ForecastResult } from "@/modules/forecasting/forecast.service";
import { ForecastRequestSchema } from "@/modules/forecasting/forecast.schemas";
import { db } from "@/lib/db";

/**
 * The allowlisted tool set exposed to the LLM. Four composable tools; every
 * input is validated with Zod before execution, and every numeric result comes
 * from a deterministic service — never from model memory.
 */

export type ToolResultKind = "analytics" | "forecast" | "metadata" | "definition";

export interface RegisteredTool {
  name: string;
  description: string;
  schema: z.ZodType;
  parameters: Record<string, unknown>;
  kind: ToolResultKind;
  execute: (args: never) => Promise<unknown>;
}

const analytics = new AnalyticsService();
const forecast = new ForecastService();

export const TOOLS: RegisteredTool[] = [
  {
    name: "query_logistics_analytics",
    description:
      "Run a deterministic analytics query over the logistics orders dataset: KPI values, aggregations, group-by breakdowns, and time series. " +
      "Metrics: total_orders, delivered_orders, delayed_orders, on_time_rate, delay_rate, avg_delivery_time, total_order_value, avg_order_value. " +
      "delivery_performance returns delivered AND delayed counts together (needs a dimension or timeBucket) — use it to compare on-time vs late side by side. " +
      "Use timeBucket (day|week|month) for count trends over time (counts only), dimension for group-by breakdowns — counts, rates, and order-value metrics by carrier, region, warehouse, category, or city (e.g. delay_rate by carrier, total_order_value by product_category). " +
      "Relative dateRange presets are anchored to the dataset's latest date (2025-12-30), so 'last 3 months' resolves to Oct–Dec 2025 — prefer presets over hardcoded dates unless the user names explicit dates.",
    schema: AnalyticsQuerySchema,
    parameters: z.toJSONSchema(AnalyticsQuerySchema),
    kind: "analytics",
    execute: ((args: unknown) => analytics.queryMetric(args as never)) as never,
  },
  {
    name: "forecast_demand",
    description:
      "Forecast future monthly demand (order quantity) for one product category or SKU, using a 3-period moving average over monthly history. " +
      "Returns history, forecast values, eligibility (sparse entities are rejected with a reason — most SKUs have too little history), holdout MAE when meaningful, and an inventory recommendation. " +
      "For 'how much inventory should I plan' questions, use the returned recommendedStock.",
    schema: ForecastRequestSchema,
    parameters: z.toJSONSchema(ForecastRequestSchema),
    kind: "forecast",
    execute: ((args: unknown) => {
      const parsed = ForecastRequestSchema.parse(args);
      return forecast.forecast(parsed.scope, parsed.entity, parsed.horizon);
    }) as never,
  },
  {
    name: "get_dataset_metadata",
    description:
      "Dataset facts: date range, distinct dimension values (carriers, regions, warehouses, categories, destination cities), supported metrics, and data-quality notes. " +
      "Use to check valid filter values or what the data contains before querying.",
    schema: z.strictObject({}),
    parameters: { type: "object", properties: {}, additionalProperties: false },
    kind: "metadata",
    execute: (async () => {
      const meta = await analytics.getMetadata();
      const [rows, nullDeliveries] = await Promise.all([
        db.order.count(),
        db.order.count({ where: { delivery_date: null } }),
      ]);
      return {
        ...meta,
        dataQuality: {
          totalOrders: rows,
          nullDeliveryDates: nullDeliveries,
          note:
            "The dataset has no promised-delivery/SLA field: on-time vs delayed is a status-based proxy. delivery_date is null for non-completed and some other rows.",
        },
      };
    }) as never,
  },
  {
    name: "get_metric_definition",
    description:
      "Get the canonical definition of a supported KPI/metric: formula, numerator/denominator, included and excluded statuses, units, and caveats. " +
      "Use for 'how is X calculated' or 'why is Y excluded' questions. This tool explains semantics only — call query_logistics_analytics for current values.",
    schema: z.strictObject({ metric: z.enum(SUPPORTED_METRICS as [string, ...string[]]) }),
    parameters: z.toJSONSchema(z.strictObject({ metric: z.enum(SUPPORTED_METRICS as [string, ...string[]]) })),
    kind: "definition",
    execute: ((args: unknown) => {
      const { metric } = z.strictObject({ metric: z.enum(SUPPORTED_METRICS as [string, ...string[]]) }).parse(args);
      const def = METRIC_REGISTRY[metric as keyof typeof METRIC_REGISTRY];
      if (!def) {
        throw new Error(`Unknown metric '${metric}'. Supported: ${SUPPORTED_METRICS.join(", ")}`);
      }
      return def;
    }) as never,
  },
];

export function findTool(name: string): RegisteredTool | undefined {
  return TOOLS.find((t) => t.name === name);
}

export type { AnalyticsResult, ForecastResult };
