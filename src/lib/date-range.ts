/**
 * Relative date-range resolution.
 *
 * The dataset is historical (ends 2025-12-30) and may be reviewed much later,
 * so relative presets anchor to the dataset's max order_date (not the server
 * clock), unless the caller explicitly supplies concrete dates. All values
 * are date-only strings (YYYY-MM-DD); no timezone arithmetic is involved.
 */

export const DATE_RANGE_PRESETS = [
  "last_7_days",
  "last_1_month",
  "last_3_months",
  "last_6_months",
  "last_12_months",
  "year_to_date",
  "all",
] as const;

export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export interface ResolvedDateRange {
  from: string; // inclusive YYYY-MM-DD
  to: string; // inclusive YYYY-MM-DD
  anchor: string; // the date the range was resolved against
  preset: DateRangePreset | "custom";
  label: string; // human-readable, shown in UI explainability panel
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseIso(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

/** Calendar-aware month subtraction: returns date exactly `n` months earlier. */
function minusMonths(d: Date, n: number): Date {
  const target = new Date(d);
  target.setUTCMonth(target.getUTCMonth() - n);
  return target;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(s: string): boolean {
  if (!ISO.test(s)) return false;
  const d = parseIso(s);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function resolveDateRange(
  input: DateRangePreset | { from: string; to: string },
  anchor: string, // dataset max order_date (YYYY-MM-DD)
  datasetMin: string // dataset min order_date, used for the "all" preset
): ResolvedDateRange {
  if (!ISO.test(anchor) || !ISO.test(datasetMin)) {
    throw new Error(`Invalid anchor dates: anchor=${anchor}, min=${datasetMin}`);
  }

  if (typeof input !== "string") {
    if (!isValidIsoDate(input.from) || !isValidIsoDate(input.to)) {
      throw new Error("Custom date range must use valid YYYY-MM-DD dates");
    }
    if (parseIso(input.from) > parseIso(input.to)) {
      throw new Error("Custom date range 'from' must not be after 'to'");
    }
    return {
      from: input.from,
      to: input.to,
      anchor,
      preset: "custom",
      label: `${input.from} to ${input.to} (custom range)`,
    };
  }

  const anchorDate = parseIso(anchor);
  let from: Date;
  let to: Date = anchorDate;

  switch (input) {
    case "last_7_days":
      from = new Date(anchorDate);
      from.setUTCDate(from.getUTCDate() - 6);
      break;
    case "last_1_month":
    case "last_3_months":
    case "last_6_months":
    case "last_12_months": {
      const n = {
        last_1_month: 1,
        last_3_months: 3,
        last_6_months: 6,
        last_12_months: 12,
      }[input];
      from = minusMonths(anchorDate, n);
      from.setUTCDate(from.getUTCDate() + 1); // make the window inclusive of the anchor month day
      if (from > anchorDate) from = new Date(anchorDate);
      break;
    }
    case "year_to_date":
      from = new Date(Date.UTC(anchorDate.getUTCFullYear(), 0, 1));
      break;
    case "all":
      from = parseIso(datasetMin);
      to = anchorDate;
      break;
  }

  // Never start before the dataset begins.
  if (from < parseIso(datasetMin)) from = parseIso(datasetMin);

  return {
    from: toIso(from),
    to: toIso(to),
    anchor,
    preset: input,
    label: `${toIso(from)} to ${toIso(to)} (preset: ${input}, relative to latest dataset date: ${anchor})`,
  };
}
