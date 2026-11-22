import type { AnalyticsResult } from "@/modules/analytics/analytics.types";
import type { ForecastResult } from "@/modules/forecasting/forecast.service";

/**
 * Suggested next questions shown as chips under an answer.
 *
 * The assistant proposes them itself at the end of each answer (a `NEXT:` line),
 * so they fit the conversation. They are always filtered against what was
 * already asked, and a fixed list is used only as a fallback.
 */

export const MAX_FOLLOW_UPS = 3;

/** Lowercase, drop punctuation, collapse whitespace: "Delay rate by carrier?" == "delay rate by carrier". */
export function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findNextMarker(text: string): { before: string; tail: string } | null {
  const upper = text.toUpperCase();
  let from = upper.length;
  while (from >= 0) {
    const idx = upper.lastIndexOf("NEXT:", from);
    if (idx < 0) return null;
    // Only a line that STARTS with the marker counts (markdown decoration is
    // allowed), so the words "next:" inside a sentence are left alone.
    const lineStart = text.lastIndexOf("\n", idx) + 1;
    if (/^[ \t>*_-]*$/.test(text.slice(lineStart, idx))) {
      return { before: text.slice(0, lineStart), tail: text.slice(idx + 5) };
    }
    from = idx - 1;
  }
  return null;
}

/**
 * Split the assistant's closing `NEXT: a | b` line off the answer so the
 * suggestions become chips and never appear inside the answer text.
 */
export function splitNextSteps(text: string): { answer: string; suggestions: string[] } {
  const found = findNextMarker(text);
  if (!found) return { answer: text.trim(), suggestions: [] };
  const suggestions = found.tail
    .split(/\n|\|/)
    .map((s) => s.replace(/^[\s>*_\-•]*(?:\d+[.)])?\s*(?:\*\*)?/, "").replace(/[`*"“”]+/g, "").trim())
    .filter((s) => s.length >= 3 && s.length <= 120);
  return { answer: found.before.trim(), suggestions: Array.from(new Set(suggestions)) };
}

/** Fixed suggestions, used only when the assistant proposed nothing usable. */
export function fallbackFollowUps(analytics: AnalyticsResult | null, forecast: ForecastResult | null): string[] {
  if (forecast) {
    // The forecast answer already includes the recommended stock, so never
    // suggest an inventory question here.
    return ["Which carrier has the highest delay rate?", "How many orders were delivered late last month?", "Show order volume by month"];
  }
  switch (analytics?.queryPlan.metric) {
    case "delay_rate":
    case "delayed_orders":
      return ["Show delayed orders by week for the last 3 months", "How is on-time delivery rate calculated?", "Show order volume by month"];
    case "on_time_rate":
    case "avg_delivery_time":
      return ["Which carrier has the highest delay rate?", "Show delayed orders by week for the last 3 months", "How is on-time delivery rate calculated?"];
    case "total_order_value":
    case "avg_order_value":
      return ["Which region has the most orders?", "Show order volume by month", "Forecast demand for the BOOK category"];
    default:
      return ["Which carrier has the highest delay rate?", "What is the delay rate by region?", "Forecast demand for the BOOK category"];
  }
}

/**
 * Pick the chips for an answer: the assistant's own suggestions first, minus
 * anything already asked in this conversation; the fixed list if nothing is left.
 */
export function chooseFollowUps(
  suggested: string[],
  askedQuestions: string[],
  analytics: AnalyticsResult | null,
  forecast: ForecastResult | null
): string[] {
  const asked = new Set(askedQuestions.map(normalizeQuestion));
  const clean = (list: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of list) {
      const question = raw.replace(/\s+/g, " ").trim();
      const key = normalizeQuestion(question);
      if (key.length < 3 || seen.has(key) || asked.has(key)) continue;
      seen.add(key);
      out.push(question);
      if (out.length >= MAX_FOLLOW_UPS) break;
    }
    return out;
  };
  const fromAssistant = clean(suggested);
  return fromAssistant.length > 0 ? fromAssistant : clean(fallbackFollowUps(analytics, forecast));
}
