import { describe, expect, it } from "vitest";
import { chooseFollowUps, normalizeQuestion, splitNextSteps } from "@/modules/ai/follow-ups";
import type { AnalyticsResult } from "@/modules/analytics/analytics.types";

const analytics = (metric: string): AnalyticsResult =>
  ({
    rows: [],
    totalRows: 0,
    chart: null,
    queryPlan: {
      metric: metric as AnalyticsResult["queryPlan"]["metric"],
      metricLabel: metric,
      unit: "orders",
      dimension: null,
      timeBucket: null,
      filters: {},
      dateRange: { from: "2025-01-01", to: "2025-12-30", anchor: "2025-12-30", preset: "all", label: "all" },
      notes: [],
    },
  }) as unknown as AnalyticsResult;

describe("splitNextSteps", () => {
  it("splits a trailing NEXT line into chips and keeps it out of the answer", () => {
    const { answer, suggestions } = splitNextSteps(
      "GLS had the highest delay rate at 28.6%.\n\nNEXT: What about by region? | Show monthly volume"
    );
    expect(answer).toBe("GLS had the highest delay rate at 28.6%.");
    expect(suggestions).toEqual(["What about by region?", "Show monthly volume"]);
  });

  it("tolerates bold decoration and bullets", () => {
    const { suggestions } = splitNextSteps("Answer here.\n**NEXT:** - First question | *Second?*");
    expect(suggestions).toEqual(["First question", "Second?"]);
  });

  it("leaves an ordinary answer untouched", () => {
    const { answer, suggestions } = splitNextSteps("3 orders were late in December.");
    expect(answer).toBe("3 orders were late in December.");
    expect(suggestions).toEqual([]);
  });

  it("ignores 'next:' written mid-sentence", () => {
    const { answer, suggestions } = splitNextSteps("I wonder what comes next: maybe nothing.");
    expect(answer).toBe("I wonder what comes next: maybe nothing.");
    expect(suggestions).toEqual([]);
  });

  it("uses the LAST marker when several appear", () => {
    const { suggestions } = splitNextSteps("A.\nNEXT: stale | also stale\nB text.\nNEXT: fresh one");
    expect(suggestions).toEqual(["fresh one"]);
  });
});

describe("normalizeQuestion", () => {
  it("treats punctuation and case as noise", () => {
    expect(normalizeQuestion("Delay rate by carrier?")).toBe(normalizeQuestion("delay rate  by carrier"));
  });
});

describe("chooseFollowUps", () => {
  const asked = ["Which carrier has the highest delay rate?", "How much inventory should I plan for BOOK?"];

  it("never suggests a question already asked", () => {
    const picks = chooseFollowUps(
      ["Which carrier has the highest delay rate?", "What about regions?", "What about regions?"],
      asked,
      analytics("delay_rate"),
      null
    );
    expect(picks).toEqual(["What about regions?"]);
  });

  it("falls back to a fixed list that also respects what was asked", () => {
    const picks = chooseFollowUps([], asked, analytics("delay_rate"), null);
    expect(picks.length).toBeGreaterThan(0);
    for (const p of picks) {
      expect(asked.map(normalizeQuestion)).not.toContain(normalizeQuestion(p));
    }
  });

  it("caps at three suggestions", () => {
    const picks = chooseFollowUps(["One?", "Two?", "Three?", "Four?", "Five?"], [], analytics("delay_rate"), null);
    expect(picks).toEqual(["One?", "Two?", "Three?"]);
  });
});
