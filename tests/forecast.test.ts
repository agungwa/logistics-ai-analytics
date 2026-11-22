import { describe, expect, it } from "vitest";
import {
  checkEligibility,
  holdoutMae,
  inventoryRecommendation,
  movingAverageForecast,
  monthsBetween,
  nextMonth,
  type MonthlyObservation,
} from "@/modules/forecasting/forecast.service";
import { ForecastRequestSchema } from "@/modules/forecasting/forecast.schemas";

function hist(quantities: number[]): MonthlyObservation[] {
  return quantities.map((q, i) => ({ month: `2025-${String((i % 12) + 1).padStart(2, "0")}`, quantity: q }));
}

describe("forecast eligibility", () => {
  it("rejects entities with fewer than 6 observed months — no fabricated forecast", () => {
    const e = checkEligibility(hist([5, 3, 8]));
    expect(e.eligible).toBe(false);
    expect(e.reason).toContain("3 observed month(s)");
  });

  it("rejects sparse coverage even with 6+ observed months (missing months ≠ zero)", () => {
    const sparse = [
      { month: "2025-01", quantity: 2 },
      { month: "2025-03", quantity: 1 },
      { month: "2025-05", quantity: 4 },
      { month: "2025-08", quantity: 2 },
      { month: "2025-10", quantity: 3 },
      { month: "2025-12", quantity: 1 },
    ];
    const e = checkEligibility(sparse); // 6 of 12 months = 50% < 0.5? equal — use 6/13 to be clearly sparse
    expect(e.eligible).toBe(true); // 50% exactly meets the floor; document boundary
    const sparser = [
      { month: "2025-01", quantity: 2 },
      { month: "2025-04", quantity: 1 },
      { month: "2025-07", quantity: 4 },
      { month: "2025-10", quantity: 2 },
      { month: "2025-12", quantity: 3 },
      { month: "2026-02", quantity: 1 },
    ];
    const e2 = checkEligibility(sparser); // 6 of 14 = 43%
    expect(e2.eligible).toBe(false);
    expect(e2.reason).toContain("Coverage too sparse");
  });

  it("accepts dense-enough history with 6+ months", () => {
    const e = checkEligibility(hist([10, 12, 9, 14, 11, 13, 12, 10]));
    expect(e.eligible).toBe(true);
  });
});

describe("moving average", () => {
  it("one-step forecast is the mean of the last 3 actuals", () => {
    const f = movingAverageForecast(hist([10, 12, 9, 14, 11, 13]), 1);
    expect(f).toEqual([12.67]); // mean(14, 11, 13)
  });

  it("multi-step is recursive and deterministic", () => {
    const run1 = movingAverageForecast(hist([10, 12, 9, 14, 11, 13]), 3);
    const run2 = movingAverageForecast(hist([10, 12, 9, 14, 11, 13]), 3);
    expect(run1).toEqual(run2);
    // step 2 uses step 1's forecast in the window
    const step1 = run1[0];
    const step2 = round2((11 + 13 + step1) / 3);
    expect(run1[1]).toBe(step2);
  });

  it("returns nothing when history is shorter than the window", () => {
    expect(movingAverageForecast(hist([1, 2]), 3)).toEqual([]);
  });
});

describe("holdout MAE", () => {
  it("returns null when the sample is too small", () => {
    expect(holdoutMae(hist([1, 2, 3, 4, 5]))).toBeNull();
  });

  it("computes MAE over the chronological holdout", () => {
    const mae = holdoutMae(hist([10, 12, 9, 14, 11, 13, 12, 10, 15]), 3);
    expect(mae).not.toBeNull();
    expect(mae).toBeGreaterThan(0);
  });
});

describe("inventory recommendation", () => {
  it("rounds up with the configured buffer", () => {
    const r = inventoryRecommendation([10, 12, 9.5]);
    expect(r.totalForecastDemand).toBe(31.5);
    expect(r.recommendedStock).toBe(Math.ceil(31.5 * 1.2)); // 38
  });

  it("buffer percentage is configurable", () => {
    const r = inventoryRecommendation([10, 10], 50);
    expect(r.recommendedStock).toBe(30);
  });
});

describe("forecast request schema", () => {
  it("accepts a valid request and defaults horizon to 3", () => {
    const p = ForecastRequestSchema.parse({ scope: "category", entity: "BOOK" });
    expect(p.horizon).toBe(3);
  });
  it("rejects bad scope and out-of-range horizon", () => {
    expect(ForecastRequestSchema.safeParse({ scope: "warehouse", entity: "X" }).success).toBe(false);
    expect(ForecastRequestSchema.safeParse({ scope: "sku", entity: "X", horizon: 12 }).success).toBe(false);
  });
});

describe("month arithmetic", () => {
  it("monthsBetween and nextMonth handle year rollover", () => {
    expect(monthsBetween("2025-01", "2025-12")).toBe(11);
    expect(monthsBetween("2025-11", "2026-02")).toBe(3);
    expect(nextMonth("2025-12")).toBe("2026-01");
    expect(nextMonth("2025-01")).toBe("2025-02");
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
