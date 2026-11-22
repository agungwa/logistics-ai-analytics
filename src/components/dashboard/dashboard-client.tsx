"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { ChartRenderer } from "@/components/charts/ChartRenderer";
import type { DashboardData } from "@/modules/analytics/analytics.service";

const RANGE_OPTIONS = [
  { value: "all", label: "All time (2025)" },
  { value: "last_1_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "last_6_months", label: "Last 6 months" },
  { value: "year_to_date", label: "Year to date" },
];

interface Metadata {
  datasetDateRange: { min: string; max: string };
  dimensions: { carrier: string[] };
}

export function DashboardClient({ userName, role }: { userName: string; role: string }) {
  const [range, setRange] = useState("all");
  const [carrier, setCarrier] = useState("all");
  const [meta, setMeta] = useState<Metadata | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/metadata")
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => setError("Failed to load dataset metadata."));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const filters = carrier === "all" ? {} : { carrier: [carrier] };
    const qs = new URLSearchParams({ dateRange: range, filters: JSON.stringify(filters) });
    fetch(`/api/dashboard?${qs}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error?.message ?? "Failed to load dashboard");
        return r.json();
      })
      .then((d: DashboardData) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, carrier]);

  const kpiCards = useMemo(() => {
    const k = data?.kpis;
    if (!k) return [];
    return [
      { label: "Total orders", value: k.total_orders.toLocaleString(), unit: "orders" },
      { label: "Delivered orders", value: k.delivered_orders.toLocaleString(), unit: "orders" },
      { label: "Delayed orders", value: k.delayed_orders.toLocaleString(), unit: "orders" },
      {
        label: "On-time rate (status proxy)",
        value: k.on_time_rate === null ? "—" : `${k.on_time_rate}`,
        unit: "%",
        hint: "delivered ÷ (delivered + delayed)",
      },
      {
        label: "Avg delivery time",
        value: k.avg_delivery_time === null ? "—" : `${k.avg_delivery_time}`,
        unit: "days",
        hint: "completed orders with delivery date",
      },
    ];
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">Overview</h1>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
            Welcome back, {userName} ({role}) · {data ? data.dateRange.label : "Loading date range…"}
          </p>
          {data && (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--faint)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" aria-hidden />
              Data refreshed {new Date().toLocaleTimeString()} · dataset: Jan–Dec 2025 (mock, read-only)
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Select value={carrier} onValueChange={setCarrier}>
            <SelectTrigger className="w-[160px] border-[var(--border)] bg-[var(--card)]" aria-label="Carrier filter">
              <SelectValue placeholder="Carrier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All carriers</SelectItem>
              {(meta?.dimensions.carrier ?? []).map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-[180px] border-[var(--border)] bg-[var(--card)]" aria-label="Date range">
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && !data ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {kpiCards.map((k) => (
            <div key={k.label} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--faint)]">{k.label}</p>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl font-bold tabular-nums text-[var(--ink)]">{k.value}</span>
                <span className="text-xs text-[var(--ink-muted)]">{k.unit}</span>
              </div>
              {k.hint && <p className="mt-1 text-[11px] leading-snug text-[var(--faint)]">{k.hint}</p>}
            </div>
          ))}
        </div>
      )}

      {loading && !data ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : (
        data && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm md:col-span-2">
              <div className="mb-3 flex items-start justify-between gap-2">
                <h2 className="text-sm font-semibold text-[var(--ink-2)]">{data.orderVolume.title}</h2>
                <ExploreLink chart="volume" />
              </div>
              <ChartRenderer spec={data.orderVolume} />
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-2">
                <h2 className="text-sm font-semibold text-[var(--ink-2)]">{data.deliveryPerformance.title}</h2>
                <ExploreLink chart="performance" />
              </div>
              <ChartRenderer spec={data.deliveryPerformance} />
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-2">
                <h2 className="text-sm font-semibold text-[var(--ink-2)]">{data.carrierBreakdown.title}</h2>
                <ExploreLink chart="carrier" />
              </div>
              <ChartRenderer spec={data.carrierBreakdown} />
              <p className="mt-2 text-xs text-[var(--faint)]">
                Hover a bar for delayed / completed counts. Carriers with zero completed outcomes are not ranked.
              </p>
            </div>
          </div>
        )
      )}
    </div>
  );
}

/** One-click drill-through: opens this exact chart in Explore with its query
 *  plan, underlying data table and CSV export (explainability requirement 4.4). */
function ExploreLink({ chart }: { chart: string }) {
  return (
    <Link
      href={`/explore?chart=${chart}`}
      className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
      title="Query plan, data table and CSV for this chart"
    >
      Inspect in Explore <ExternalLink className="h-3 w-3" />
    </Link>
  );
}
