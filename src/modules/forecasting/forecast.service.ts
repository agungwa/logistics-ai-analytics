import { db } from "@/lib/db";
import { cached } from "@/lib/cache";
import { Prisma } from "@prisma/client";

/**
 * Forecast domain types and pure algorithms. Everything deterministic and
 * unit-tested; the repository query is the only DB touchpoint.
 */

export type ForecastScope = "category" | "sku";
export type ForecastMethod = "moving_average";

export interface MonthlyObservation {
  /** YYYY-MM calendar month */
  month: string;
  quantity: number;
}

export interface EligibilityResult {
  eligible: boolean;
  reason: string;
  observedMonths: number;
  spanMonths: number; // calendar months between first and last observed month
  coverage: number; // observedMonths / spanMonths
}

export interface ForecastPoint {
  month: string;
  quantity: number;
}

export interface ForecastResult {
  scope: ForecastScope;
  entity: string;
  eligibility: EligibilityResult;
  /** Present only when eligible — never fabricated. */
  history: MonthlyObservation[];
  forecast: ForecastPoint[];
  method: { id: ForecastMethod; window: number; multiStepStrategy: string };
  evaluation: { holdoutMonths: number; mae: number | null; note: string } | null;
  inventory: {
    totalForecastDemand: number;
    bufferPct: number;
    recommendedStock: number;
    note: string;
  } | null;
  limitations: string[];
}

export const MIN_OBSERVED_MONTHS = 6;
export const MIN_COVERAGE = 0.5;
export const WINDOW = 3;
export const BUFFER_PCT = 20;

/** Eligibility: enough observed months AND adequate calendar coverage. */
export function checkEligibility(history: MonthlyObservation[]): EligibilityResult {
  const observedMonths = history.length;
  if (observedMonths === 0) {
    return { eligible: false, reason: "No demand history found for this entity.", observedMonths: 0, spanMonths: 0, coverage: 0 };
  }
  const spanMonths = monthsBetween(history[0].month, history[history.length - 1].month) + 1;
  const coverage = observedMonths / spanMonths;
  if (observedMonths < MIN_OBSERVED_MONTHS) {
    return {
      eligible: false,
      reason: `Only ${observedMonths} observed month(s) of demand history (minimum ${MIN_OBSERVED_MONTHS}). This is a pragmatic prototype rule, not a statistical standard.`,
      observedMonths,
      spanMonths,
      coverage: round2(coverage),
    };
  }
  if (coverage < MIN_COVERAGE) {
    return {
      eligible: false,
      reason: `Coverage too sparse: ${observedMonths} of ${spanMonths} calendar months (${Math.round(coverage * 100)}%, minimum ${MIN_COVERAGE * 100}%). Missing months are not treated as zero demand, so the series is too incomplete to forecast.`,
      observedMonths,
      spanMonths,
      coverage: round2(coverage),
    };
  }
  return { eligible: true, reason: "Eligible", observedMonths, spanMonths, coverage: round2(coverage) };
}

/** Calendar months between two YYYY-MM values (b - a). */
export function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

/** Next calendar month after YYYY-MM. */
export function nextMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo, 1)); // month index `mo` (1-based input) = first day of next month
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * 3-period moving average. One-step: mean of the last 3 actuals. Multi-step:
 * recursive — prior forecast values enter the window. Deterministic, rounded
 * to 2 decimals at each step so results are reproducible.
 */
export function movingAverageForecast(history: MonthlyObservation[], horizon: number, window = WINDOW): number[] {
  if (history.length < window || horizon < 1) return [];
  const actuals = history.map((h) => h.quantity);
  const out: number[] = [];
  let series = [...actuals];
  for (let i = 0; i < horizon; i++) {
    const next = round2(series.slice(-window).reduce((a, b) => a + b, 0) / window);
    out.push(next);
    series.push(next);
  }
  return out;
}

/** Chronological holdout evaluation: hold out the last k months, forecast each. */
export function holdoutMae(history: MonthlyObservation[], k = 3, window = WINDOW): number | null {
  if (history.length < k + window) return null; // not meaningful on tiny samples
  const actuals = history.map((h) => h.quantity);
  const train = actuals.slice(0, actuals.length - k);
  const preds = movingAverageForecast(
    train.map((q, i) => ({ month: `m${i}`, quantity: q })),
    k,
    window
  );
  const held = actuals.slice(actuals.length - k);
  const absErrors = held.map((a, i) => Math.abs(a - preds[i]));
  return round2(absErrors.reduce((a, b) => a + b, 0) / absErrors.length);
}

export function inventoryRecommendation(forecast: number[], bufferPct = BUFFER_PCT) {
  const total = round2(forecast.reduce((a, b) => a + b, 0));
  return {
    totalForecastDemand: total,
    bufferPct,
    recommendedStock: Math.ceil(total * (1 + bufferPct / 100)),
    note: `Illustrative ${bufferPct}% configurable safety buffer. Lead time, service level, replenishment cadence and stock-on-hand are not present in the dataset, so this is not statistically calculated safety stock.`,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Service (DB-backed)
// ---------------------------------------------------------------------------

const LIMITATIONS = [
  "Simple 3-period moving average: captures level, not seasonality or trend.",
  "Sparse monthly aggregation from a 400-order sample — wide uncertainty.",
  "Missing months are not treated as zero demand; sparse entities are rejected by eligibility instead.",
  "Inventory buffer is a fixed illustrative percentage, not derived from demand variability or lead times.",
];

export class ForecastService {
  /** Sum of quantity by calendar month for a category or SKU. */
  async getMonthlyHistory(scope: ForecastScope, entity: string): Promise<MonthlyObservation[]> {
    const column = scope === "category" ? Prisma.raw('"product_category"') : Prisma.raw('"sku"');
    const rows = await db.$queryRaw<Array<{ m: string; q: bigint }>>(
      Prisma.sql`SELECT to_char("order_date", 'YYYY-MM') AS m, SUM("quantity") AS q
                 FROM "Order" WHERE ${column} = ${entity}
                 GROUP BY 1 ORDER BY 1`
    );
    return rows.map((r) => ({ month: r.m, quantity: Number(r.q) }));
  }

  forecast(scope: ForecastScope, entity: string, horizon: number): Promise<ForecastResult> {
    return cached(`fc:${scope}|${entity}|${horizon}`, 60_000, () => this.forecastUncached(scope, entity, horizon));
  }

  private async forecastUncached(scope: ForecastScope, entity: string, horizon: number): Promise<ForecastResult> {
    const history = await this.getMonthlyHistory(scope, entity);
    const eligibility = checkEligibility(history);

    if (!eligibility.eligible) {
      return {
        scope,
        entity,
        eligibility,
        history,
        forecast: [],
        method: { id: "moving_average", window: WINDOW, multiStepStrategy: "recursive" },
        evaluation: null,
        inventory: null,
        limitations: LIMITATIONS,
      };
    }

    const values = movingAverageForecast(history, horizon);
    const lastMonth = history[history.length - 1].month;
    const points: ForecastPoint[] = values.map((v, i) => ({ month: advanceMonths(lastMonth, i + 1), quantity: v }));
    const mae = holdoutMae(history);

    return {
      scope,
      entity,
      eligibility,
      history,
      forecast: points,
      method: { id: "moving_average", window: WINDOW, multiStepStrategy: "recursive (prior forecasts enter the window)" },
      evaluation: mae === null
        ? { holdoutMonths: 3, mae: null, note: "History too short for a meaningful holdout evaluation (needs ≥ 9 observed months)." }
        : { holdoutMonths: 3, mae, note: "MAE from a chronological 3-month holdout using the same method." },
      inventory: inventoryRecommendation(values),
      limitations: LIMITATIONS,
    };
  }
}

function advanceMonths(from: string, n: number): string {
  let m = from;
  for (let i = 0; i < n; i++) m = nextMonth(m);
  return m;
}
