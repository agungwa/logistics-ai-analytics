import { resolveDateRange, type DateRangePreset, type ResolvedDateRange } from "@/lib/date-range";
import { cached } from "@/lib/cache";
import { METRIC_REGISTRY } from "./metrics.registry";
import { AnalyticsRepository, buildWhere } from "./analytics.repository";
import type {
  AnalyticsResult,
  ChartSpec,
  DimensionId,
  Kpis,
  MetricRow,
  OrderFilters,
  QueryPlan,
  StatusCounts,
  TimeBucket,
} from "./analytics.types";

/**
 * Pure KPI math — extracted so unit tests can verify business rules without a
 * database. These are the ONLY implementations of KPI semantics; the
 * dashboard, AI tools and tests all reuse them.
 */
export function computeKpis(
  counts: StatusCounts,
  avgDeliveryDays: number | null,
  value: { total: number; avg: number; count: number }
): Kpis {
  const completed = counts.delivered + counts.delayed;
  return {
    total_orders: Object.values(counts).reduce((a, b) => a + b, 0),
    delivered_orders: counts.delivered,
    delayed_orders: counts.delayed,
    on_time_rate: completed === 0 ? null : round2((counts.delivered / completed) * 100),
    delay_rate: completed === 0 ? null : round2((counts.delayed / completed) * 100),
    avg_delivery_time: avgDeliveryDays === null ? null : round2(avgDeliveryDays),
    total_order_value: round2(value.total),
    avg_order_value: value.count === 0 ? 0 : round2(value.avg),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface DashboardData {
  kpis: Kpis;
  dateRange: ResolvedDateRange;
  orderVolume: ChartSpec; // monthly order volume
  deliveryPerformance: ChartSpec; // monthly delivered vs delayed
  carrierBreakdown: ChartSpec; // delay rate per carrier with counts
}

export class AnalyticsService {
  private repo = new AnalyticsRepository();

  private async resolveRange(range: DateRangePreset | { from: string; to: string }): Promise<{
    resolved: ResolvedDateRange;
  }> {
    const { min, max } = await this.repo.getDatasetBounds();
    const resolved = resolveDateRange(range, max, min);
    return { resolved };
  }

  /** Validate filter values against actual dataset values; reject unknown values clearly. */
  private async validateFilters(filters: OrderFilters): Promise<void> {
    for (const [field, values] of Object.entries(filters)) {
      if (!values || values.length === 0) continue;
      const valid = new Set(await this.repo.getDistinctValues(field as never));
      const unknown = (values as string[]).filter((v: string) => !valid.has(v));
      if (unknown.length > 0) {
        throw new AnalyticsValidationError(
          `Unknown ${field} value(s): ${unknown.join(", ")}. Supported values: ${Array.from(valid).join(", ")}`
        );
      }
    }
  }

  getDashboard(range: DateRangePreset | { from: string; to: string } = "all", filters: OrderFilters = {}): Promise<DashboardData> {
    return cached(`dash:${JSON.stringify({ range, filters })}`, 60_000, () => this.getDashboardUncached(range, filters));
  }

  private async getDashboardUncached(range: DateRangePreset | { from: string; to: string } = "all", filters: OrderFilters = {}): Promise<DashboardData> {
    await this.validateFilters(filters);
    const { resolved } = await this.resolveRange(range);
    const where = buildWhere(filters, resolved.from, resolved.to);

    const [counts, avgDays, valueAgg, volume, perfByStatus, carriers] = await Promise.all([
      this.repo.getStatusCounts(where),
      this.repo.avgDeliveryDays(where),
      this.repo.valueAggregates(where),
      this.repo.timeSeries("month", where),
      this.repo.timeSeriesByStatus("month", where, ["delivered", "delayed"]),
      this.repo.dimensionBreakdown("carrier", where),
    ]);

    const kpis = computeKpis(counts, avgDays, valueAgg);

    const volumeChart: ChartSpec = {
      type: "line",
      title: "Order volume over time (monthly, by order date)",
      xKey: "bucket",
      yKey: "count",
      xLabel: "Month",
      yLabel: "Orders",
      unit: "orders",
      data: volume.map((v) => ({ bucket: formatMonth(v.bucket), count: v.count })),
    };

    const perfMap = new Map<string, { delivered: number; delayed: number }>();
    for (const row of perfByStatus) {
      const entry = perfMap.get(row.bucket) ?? { delivered: 0, delayed: 0 };
      if (row.status === "delivered") entry.delivered = row.count;
      if (row.status === "delayed") entry.delayed = row.count;
      perfMap.set(row.bucket, entry);
    }
    const perfChart: ChartSpec = {
      type: "bar",
      title: "Delivery performance (delivered vs delayed, by order month)",
      xKey: "bucket",
      yKey: "count",
      xLabel: "Month",
      yLabel: "Orders",
      unit: "orders",
      series: [
        { key: "delivered", name: "Delivered", colorRole: "primary" },
        { key: "delayed", name: "Delayed", colorRole: "accent" },
      ],
      data: Array.from(perfMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([bucket, v]) => ({ bucket: formatMonth(bucket), delivered: v.delivered, delayed: v.delayed })),
    };

    const carrierChart: ChartSpec = {
      type: "bar",
      title: "Delay rate by carrier (completed outcomes only)",
      xKey: "carrier",
      yKey: "delay_rate",
      xLabel: "Carrier",
      yLabel: "Delay rate (%)",
      unit: "%",
      data: carriers
        .map((c) => {
          const completed = c.statusCounts.delivered + c.statusCounts.delayed;
          return {
            carrier: c.key,
            delay_rate: completed === 0 ? 0 : round2((c.statusCounts.delayed / completed) * 100),
            delayed: c.statusCounts.delayed,
            completed,
          };
        })
        .filter((c) => c.completed > 0) // carriers with zero completed outcomes are not ranked
        .sort((a, b) => b.delay_rate - a.delay_rate),
    };

    return { kpis, dateRange: resolved, orderVolume: volumeChart, deliveryPerformance: perfChart, carrierBreakdown: carrierChart };
  }

  /**
   * The single analytics tool behind both the dashboard drill-downs and the
   * AI layer: allowlisted metric, optional dimension breakdown or time
   * series, validated filters, resolved dates, query plan, chart spec.
   */
  async queryMetric(input: {
    metric: keyof typeof METRIC_REGISTRY;
    dimension?: DimensionId;
    timeBucket?: "day" | "week" | "month";
    dateRange?: DateRangePreset | { from: string; to: string };
    filters?: OrderFilters;
    sort?: { by: "value" | "key"; dir?: "asc" | "desc" };
    limit?: number;
    offset?: number;
  }): Promise<AnalyticsResult> {
    return cached(`aq:${JSON.stringify(input)}`, 60_000, () => this.queryMetricUncached(input));
  }

  private async queryMetricUncached(input: {
    metric: keyof typeof METRIC_REGISTRY;
    dimension?: DimensionId;
    timeBucket?: "day" | "week" | "month";
    dateRange?: DateRangePreset | { from: string; to: string };
    filters?: OrderFilters;
    sort?: { by: "value" | "key"; dir?: "asc" | "desc" };
    limit?: number;
    offset?: number;
  }): Promise<AnalyticsResult> {
    const filters = input.filters ?? {};
    await this.validateFilters(filters);
    const { resolved } = await this.resolveRange(input.dateRange ?? "all");
    const where = buildWhere(filters, resolved.from, resolved.to);
    const def = METRIC_REGISTRY[input.metric];
    const limit = Math.min(input.limit ?? 20, 100);

    let rows: MetricRow[] = [];
    let chartType: ChartSpec["type"] = "bar";
    const notes: string[] = [];

    const countMetric = async (): Promise<number> => {
      if (input.metric === "total_orders") return this.repo.count(where);
      const counts = await this.repo.getStatusCounts(where);
      if (input.metric === "delivered_orders") return counts.delivered;
      if (input.metric === "delayed_orders") return counts.delayed;
      throw new Error("unreachable");
    };

    const scalarMetric = async (): Promise<number | null> => {
      switch (input.metric) {
        case "total_orders":
        case "delivered_orders":
        case "delayed_orders":
          return countMetric();
        case "on_time_rate":
        case "delay_rate": {
          const counts = await this.repo.getStatusCounts(where);
          const completed = counts.delivered + counts.delayed;
          if (completed === 0) {
            notes.push("No completed delivery outcomes (delivered + delayed) in this range.");
            return null;
          }
          return input.metric === "on_time_rate"
            ? round2((counts.delivered / completed) * 100)
            : round2((counts.delayed / completed) * 100);
        }
        case "avg_delivery_time":
          return this.repo.avgDeliveryDays(where);
        case "total_order_value": {
          const agg = await this.repo.valueAggregates(where);
          return round2(agg.total);
        }
        case "avg_order_value": {
          const agg = await this.repo.valueAggregates(where);
          return agg.count === 0 ? null : round2(agg.avg);
        }
        case "delivery_performance":
          throw new AnalyticsValidationError(
            "delivery_performance needs a timeBucket or dimension — it compares delivered vs delayed."
          );
        default:
          throw new Error(`Unsupported metric: ${input.metric satisfies never}`);
      }
    };

    if (input.timeBucket) {
      if (input.dimension) {
        throw new AnalyticsValidationError("Specify either timeBucket or dimension, not both.");
      }
      chartType = "line";
      if (input.metric === "delivery_performance") {
        const series = await this.repo.timeSeriesByStatus(input.timeBucket, where, ["delivered", "delayed"]);
        const map = new Map<string, { delivered: number; delayed: number }>();
        for (const point of series) {
          const entry = map.get(point.bucket) ?? { delivered: 0, delayed: 0 };
          if (point.status === "delivered") entry.delivered = point.count;
          if (point.status === "delayed") entry.delayed = point.count;
          map.set(point.bucket, entry);
        }
        rows = Array.from(map.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([bucket, v]) => ({
            key: formatBucketKey(bucket, input.timeBucket!),
            value: v.delivered + v.delayed,
            delivered: v.delivered,
            delayed: v.delayed,
          }));
      } else if (input.metric === "delayed_orders" || input.metric === "delivered_orders" || input.metric === "total_orders") {
        if (input.metric === "delayed_orders" || input.metric === "delivered_orders") {
          const series = await this.repo.timeSeriesByStatus(
            input.timeBucket,
            where,
            [input.metric === "delayed_orders" ? "delayed" : "delivered"]
          );
          rows = series.map((r) => ({ key: formatBucketKey(r.bucket, input.timeBucket!), value: r.count }));
        } else {
          const series = await this.repo.timeSeries(input.timeBucket, where);
          rows = series.map((r) => ({ key: formatBucketKey(r.bucket, input.timeBucket!), value: r.count }));
        }
      } else {
        // Rate/value metrics per time bucket are not in the supported question
        // set for v1; reject explicitly rather than returning a misleading count.
        throw new AnalyticsValidationError(
          `Metric ${input.metric} is not supported over time buckets. Supported time-series metrics: total_orders, delivered_orders, delayed_orders.`
        );
      }
    } else if (input.dimension) {
      if (input.metric === "delivery_performance") {
        const breakdown = await this.repo.dimensionBreakdown(input.dimension, where);
        rows = breakdown
          .filter((b) => b.statusCounts.delivered + b.statusCounts.delayed > 0)
          .map((b) => ({
            key: b.key,
            value: b.statusCounts.delivered + b.statusCounts.delayed,
            delivered: b.statusCounts.delivered,
            delayed: b.statusCounts.delayed,
          }));
        notes.push("Rows with zero completed delivery outcomes (delivered + delayed) are excluded.");
      } else {
      const isValueMetric = input.metric === "total_order_value" || input.metric === "avg_order_value";
      const breakdown = isValueMetric
        ? (await this.repo.dimensionValueBreakdown(input.dimension, where)).map((v) => ({
            key: v.key,
            value: input.metric === "total_order_value" ? round2(v.total) : v.count === 0 ? 0 : round2(v.avg),
            numerator: round2(v.total),
            denominator: v.count,
          }))
        : (await this.repo.dimensionBreakdown(input.dimension, where)).map((b) => {
            const completed = b.statusCounts.delivered + b.statusCounts.delayed;
            switch (input.metric) {
              case "total_orders":
                return { key: b.key, value: sumStatuses(b.statusCounts) };
              case "delivered_orders":
                return { key: b.key, value: b.statusCounts.delivered };
              case "delayed_orders":
                return { key: b.key, value: b.statusCounts.delayed };
              case "on_time_rate":
              case "delay_rate": {
                if (completed === 0) return { key: b.key, value: 0, numerator: 0, denominator: 0 };
                const rate = round2(
                  ((input.metric === "on_time_rate" ? b.statusCounts.delivered : b.statusCounts.delayed) / completed) * 100
                );
                return {
                  key: b.key,
                  value: rate,
                  numerator: input.metric === "on_time_rate" ? b.statusCounts.delivered : b.statusCounts.delayed,
                  denominator: completed,
                };
              }
              default:
                throw new AnalyticsValidationError(
                  `Metric ${input.metric} is not supported grouped by ${input.dimension}. Supported grouped metrics: counts, rates, and order-value metrics.`
                );
            }
          });
      rows = breakdown;
      // Carriers/dimensions with zero completed outcomes are not ranked for rate metrics.
      if (input.metric === "on_time_rate" || input.metric === "delay_rate") {
        rows = rows.filter((r) => (r.denominator ?? 0) > 0);
        notes.push("Entries with zero completed delivery outcomes (delivered + delayed) were excluded from ranking.");
      }
      chartType = "bar";
      }
    } else if (input.metric === "delivery_performance") {
      throw new AnalyticsValidationError(
        "delivery_performance compares delivered vs delayed — it needs a timeBucket (trend) or a dimension (breakdown)."
      );
    } else {
      const value = await scalarMetric();
      rows = value === null ? [] : [{ key: def.label, value }];
    }

    if (input.sort) {
      rows.sort((a, b) =>
        input.sort!.by === "value" ? a.value - b.value : a.key.localeCompare(b.key)
      );
      if (input.sort.dir === "desc") rows.reverse();
    }
    const totalRows = rows.length;
    const offset = Math.min(input.offset ?? 0, Math.max(0, totalRows - 1));
    rows = rows.slice(offset, offset + limit);

    const queryPlan: QueryPlan = {
      metric: input.metric,
      metricLabel: def.label,
      unit: def.unit,
      dimension: input.dimension ?? null,
      timeBucket: input.timeBucket ?? null,
      filters,
      dateRange: resolved,
      notes,
    };

    const chart = this.buildChart(input.metric, chartType, rows, input.dimension, input.timeBucket);
    return { rows, totalRows, queryPlan, chart };
  }

  private buildChart(
    metric: keyof typeof METRIC_REGISTRY,
    type: ChartSpec["type"],
    rows: MetricRow[],
    dimension: DimensionId | undefined,
    timeBucket: "day" | "week" | "month" | undefined
  ): ChartSpec | null {
    if (rows.length === 0) return null;
    const def = METRIC_REGISTRY[metric];
    const isTimeSeries = Boolean(timeBucket);
    if (metric === "delivery_performance") {
      return {
        type: isTimeSeries ? "bar" : "bar",
        title: isTimeSeries
          ? `Delivery performance (delivered vs delayed, by ${timeBucket})`
          : `Delivery performance by ${dimension?.replace(/_/g, " ")}`,
        xKey: isTimeSeries ? "bucket" : dimension ?? "key",
        yKey: "value",
        xLabel: isTimeSeries ? (timeBucket as string) : dimension ? dimension.replace(/_/g, " ") : "",
        yLabel: "Orders",
        unit: "orders",
        series: [
          { key: "delivered", name: "Delivered (on-time proxy)", colorRole: "primary" },
          { key: "delayed", name: "Delayed", colorRole: "accent" },
        ],
        data: rows.map((r) =>
          isTimeSeries
            ? { bucket: timeBucket === "month" ? r.key.slice(0, 7) : r.key, delivered: r.delivered ?? 0, delayed: r.delayed ?? 0 }
            : { [dimension ?? "key"]: r.key, delivered: r.delivered ?? 0, delayed: r.delayed ?? 0 }
        ),
      };
    }
    const title = isTimeSeries
      ? `${def.label} by ${timeBucket} (order date)`
      : dimension
        ? `${def.label} by ${dimension.replace(/_/g, " ")}`
        : def.label;
    return {
      type: rows.length === 1 ? "bar" : type,
      title,
      xKey: isTimeSeries ? "bucket" : dimension ?? "key",
      yKey: "value",
      xLabel: isTimeSeries ? (timeBucket as string) : dimension ? dimension.replace(/_/g, " ") : "",
      yLabel: def.label,
      unit: def.unit,
      data: rows.map((r) =>
        isTimeSeries
          ? { bucket: timeBucket === "month" ? formatMonth(r.key) : r.key, value: r.value }
          : { [dimension ?? "key"]: r.key, value: r.value }
      ),
    };
  }

  getMetadata() {
    return cached("meta", 5 * 60_000, () => this.getMetadataUncached());
  }

  private async getMetadataUncached() {
    const [bounds, carriers, regions, warehouses, categories, destinations] = await Promise.all([
      this.repo.getDatasetBounds(),
      this.repo.getDistinctValues("carrier"),
      this.repo.getDistinctValues("region"),
      this.repo.getDistinctValues("warehouse"),
      this.repo.getDistinctValues("product_category"),
      this.repo.getDistinctValues("destination_city"),
    ]);
    return {
      datasetDateRange: bounds,
      dimensions: {
        carrier: carriers,
        region: regions,
        warehouse: warehouses,
        product_category: categories,
        destination_city: destinations,
      },
      supportedMetrics: Object.values(METRIC_REGISTRY).map((m) => ({ id: m.id, label: m.label, unit: m.unit })),
    };
  }
}

export class AnalyticsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyticsValidationError";
  }
}

function sumStatuses(c: StatusCounts): number {
  return Object.values(c).reduce((a, b) => a + b, 0);
}

function formatMonth(iso: string): string {
  return iso.slice(0, 7);
}

/** Human-friendly bucket keys for both the chart and the data table. */
function formatBucketKey(bucketStart: string, bucket: TimeBucket): string {
  return bucket === "month" ? bucketStart.slice(0, 7) : bucketStart;
}
