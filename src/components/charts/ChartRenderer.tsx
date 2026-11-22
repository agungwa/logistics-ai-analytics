"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSpec } from "@/modules/analytics/analytics.types";

/**
 * The ONLY chart renderer. Renders a server-validated ChartSpec — the AI layer
 * never emits chart components, only this fixed vocabulary (line / bar / pie).
 * Series colors come from the theme tokens, so light/dark both work.
 */

const CATEGORICAL = [
  "var(--viz-series-1)",
  "var(--viz-series-2)",
  "var(--viz-series-3)",
  "var(--viz-series-4)",
  "var(--viz-series-5)",
  "var(--viz-series-6)",
  "var(--viz-series-7)",
  "var(--viz-series-8)",
];

function seriesColors(spec: ChartSpec): Array<{ key: string; name: string; color: string; dashed?: boolean }> {
  if (spec.series && spec.series.length > 0) {
    return spec.series.map((s, i) => ({
      key: s.key,
      name: s.name,
      dashed: s.dashed,
      color: s.colorRole === "accent" ? "var(--viz-series-2)" : `var(--viz-series-${(i % 8) + 1})`,
    }));
  }
  return [{ key: spec.yKey, name: spec.yLabel, color: "var(--viz-series-1)" }];
}

const axisTick = { fill: "var(--viz-ink-muted)", fontSize: 12 };
// Every tooltip text surface set explicitly — label, items, and container — so
// nothing falls back to a browser default that breaks in dark mode.
const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--ink)",
  fontSize: 13,
  boxShadow: "0 4px 16px rgba(15, 23, 42, 0.08)",
};
const tooltipLabelStyle = { color: "var(--ink)", fontWeight: 600, marginBottom: 4 };
const tooltipItemStyle = { color: "var(--ink-2)" };

function unitSuffix(unit: string): string {
  if (unit === "%" || unit === "days") return ` ${unit}`;
  if (unit === "orders" || unit === "units" || unit === "USD") return ` ${unit}`;
  return "";
}

export function ChartRenderer({ spec }: { spec: ChartSpec }) {
  const series = seriesColors(spec);
  const hasLegend = series.length >= 2;
  // Recharts passes ValueType (which includes range arrays for band areas) — accept unknown.
  const tooltipFormatter = (value: unknown, name: unknown) =>
    [value === null || value === undefined ? "—" : `${String(value)}${unitSuffix(spec.unit)}`, String(name)] as [string, string];

  if (spec.data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--ink-muted)]">
        No data for this selection
      </div>
    );
  }

  // Line (with optional dashed forecast series + uncertainty band + gradient fill)
  if (spec.type === "line") {
    const gradientId = `grad-${series[0].key.replace(/[^a-z0-9]/gi, "")}`;
    return (
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={spec.data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--viz-series-1)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--viz-series-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
          <XAxis dataKey={spec.xKey} tick={axisTick} stroke="var(--viz-axis)" tickLine={false} />
          <YAxis tick={axisTick} stroke="var(--viz-axis)" tickLine={false} width={48} allowDecimals={false} />
          <Tooltip formatter={tooltipFormatter} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={{ stroke: "var(--viz-axis)" }} />
          {hasLegend && <Legend wrapperStyle={{ fontSize: 12, color: "var(--viz-ink)" }} />}
          {spec.band && (
            <Area
              dataKey={(d: Record<string, number | null>) => [d[spec.band!.lowKey], d[spec.band!.highKey]]}
              name="Uncertainty (±MAE)"
              stroke="none"
              fill="var(--viz-series-1)"
              fillOpacity={0.12}
              isAnimationActive={false}
              connectNulls={false}
              activeDot={false}
            />
          )}
          {series.map((s) =>
            s.dashed ? (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={{ r: 3, strokeWidth: 0, fill: s.color }}
                activeDot={{ r: 4 }}
                connectNulls
              />
            ) : (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={series.length === 1 ? false : { r: 3, strokeWidth: 0, fill: s.color }}
                activeDot={{ r: 4 }}
              />
            )
          )}
          {series.length === 1 && (
            <Area dataKey={series[0].key} stroke="none" fill={`url(#${gradientId})`} isAnimationActive={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  if (spec.type === "pie") {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Tooltip formatter={tooltipFormatter} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--viz-ink)" }} />
          <Pie data={spec.data} dataKey={spec.yKey} nameKey={spec.xKey} innerRadius="45%" outerRadius="80%" paddingAngle={2} strokeWidth={2} stroke="var(--viz-surface)">
            {spec.data.map((_, i) => (
              <Cell key={i} fill={CATEGORICAL[i % 8]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  // bar
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={spec.data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} barCategoryGap="24%">
        <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
        <XAxis dataKey={spec.xKey} tick={axisTick} stroke="var(--viz-axis)" tickLine={false} />
        <YAxis tick={axisTick} stroke="var(--viz-axis)" tickLine={false} width={48} allowDecimals={false} />
        <Tooltip formatter={tooltipFormatter} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={{ fill: "var(--accent-soft)" }} />
        {hasLegend && <Legend wrapperStyle={{ fontSize: 12, color: "var(--viz-ink)" }} />}
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={40} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
