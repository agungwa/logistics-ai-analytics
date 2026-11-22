import { describe, expect, it } from "vitest";
import { resolveDateRange } from "@/lib/date-range";
import { computeKpis } from "@/modules/analytics/analytics.service";
import { AnalyticsQuerySchema } from "@/modules/analytics/analytics.schemas";
import type { StatusCounts } from "@/modules/analytics/analytics.types";

const ANCHOR = "2025-12-30";
const MIN = "2025-01-01";

function counts(overrides: Partial<StatusCounts> = {}): StatusCounts {
  return { delivered: 304, delayed: 55, in_transit: 27, exception: 11, canceled: 3, ...overrides };
}

describe("KPI business rules (computeKpis)", () => {
  it("computes dataset-wide KPIs matching the verified seed profile", () => {
    const kpis = computeKpis(counts(), 4.2, { total: 1000, avg: 2.5, count: 400 });
    expect(kpis.total_orders).toBe(400);
    expect(kpis.delivered_orders).toBe(304);
    expect(kpis.delayed_orders).toBe(55);
    expect(kpis.on_time_rate).toBe(Math.round((304 / 359) * 10000) / 100);
    expect(kpis.delay_rate).toBe(Math.round((55 / 359) * 10000) / 100);
    expect(kpis.avg_delivery_time).toBe(4.2);
  });

  it("on-time rate uses ONLY delivered + delayed as denominator (excludes pending/exception/canceled)", () => {
    const kpis = computeKpis(counts({ in_transit: 1000, exception: 500, canceled: 999 }), 3, { total: 0, avg: 0, count: 0 });
    expect(kpis.on_time_rate).toBe(Math.round((304 / 359) * 10000) / 100);
  });

  it("returns null rates when there are no completed outcomes", () => {
    const kpis = computeKpis(counts({ delivered: 0, delayed: 0 }), null, { total: 0, avg: 0, count: 41 });
    expect(kpis.on_time_rate).toBeNull();
    expect(kpis.delay_rate).toBeNull();
    expect(kpis.avg_delivery_time).toBeNull();
  });
});

describe("date-range resolution", () => {
  it("anchors relative presets to the dataset max date, not the server clock", () => {
    const r = resolveDateRange("last_3_months", ANCHOR, MIN);
    expect(r.anchor).toBe(ANCHOR);
    expect(r.to).toBe(ANCHOR);
    expect(r.from).toBe("2025-10-01"); // anchor minus 3 months + 1 day, inclusive
    expect(r.label).toContain("relative to latest dataset date: 2025-12-30");
  });

  it("last_7_days is inclusive of the anchor", () => {
    const r = resolveDateRange("last_7_days", ANCHOR, MIN);
    expect(r.from).toBe("2025-12-24");
    expect(r.to).toBe("2025-12-30");
  });

  it("clamps the start to the dataset minimum", () => {
    const r = resolveDateRange("last_12_months", "2025-06-30", MIN);
    expect(r.from).toBe(MIN);
  });

  it("year_to_date starts on Jan 1 of the anchor year", () => {
    const r = resolveDateRange("year_to_date", ANCHOR, MIN);
    expect(r.from).toBe("2025-01-01");
    expect(r.to).toBe(ANCHOR);
  });

  it("custom ranges pass through and reject inverted ranges", () => {
    const r = resolveDateRange({ from: "2025-05-01", to: "2025-05-31" }, ANCHOR, MIN);
    expect(r.preset).toBe("custom");
    expect(r.from).toBe("2025-05-01");
    expect(() => resolveDateRange({ from: "2025-06-01", to: "2025-05-01" }, ANCHOR, MIN)).toThrow(/from/);
  });

  it("rejects malformed dates", () => {
    expect(() => resolveDateRange({ from: "2025-13-01", to: "2025-05-01" }, ANCHOR, MIN)).toThrow();
  });
});

describe("analytics query schema (LLM argument validation)", () => {
  it("accepts a valid query", () => {
    const parsed = AnalyticsQuerySchema.safeParse({
      metric: "delayed_orders",
      timeBucket: "week",
      dateRange: "last_3_months",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unsupported metric", () => {
    const parsed = AnalyticsQuerySchema.safeParse({ metric: "revenue_per_km" });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unsupported dimension", () => {
    const parsed = AnalyticsQuerySchema.safeParse({ metric: "delayed_orders", dimension: "driver_name" });
    expect(parsed.success).toBe(false);
  });

  it("rejects unknown extra properties (strict)", () => {
    const parsed = AnalyticsQuerySchema.safeParse({ metric: "delayed_orders", rawSql: "SELECT * FROM orders" });
    expect(parsed.success).toBe(false);
  });

  it("rejects out-of-bounds limit", () => {
    const parsed = AnalyticsQuerySchema.safeParse({ metric: "total_orders", limit: 10000 });
    expect(parsed.success).toBe(false);
  });

  it("defaults dateRange to all and filters to empty", () => {
    const parsed = AnalyticsQuerySchema.parse({ metric: "total_orders" });
    expect(parsed.dateRange).toBe("all");
    expect(parsed.filters).toEqual({});
  });
});
