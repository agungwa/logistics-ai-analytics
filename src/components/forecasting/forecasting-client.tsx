"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, PackageCheck, ShieldAlert, TrendingUp } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartRenderer } from "@/components/charts/ChartRenderer";
import { SkuCombobox } from "@/components/forecasting/sku-combobox";
import type { ChartSpec } from "@/modules/analytics/analytics.types";
import type { ForecastResult } from "@/modules/forecasting/forecast.service";

const HORIZONS = [1, 2, 3, 4, 5, 6];

export function ForecastingClient() {
  const [scope, setScope] = useState<"category" | "sku">("category");
  const [entity, setEntity] = useState("BOOK");
  const [horizon, setHorizon] = useState("4");
  const [entities, setEntities] = useState<string[]>([]);
  const [result, setResult] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/metadata")
      .then((r) => r.json())
      .then((meta) => {
        const cats = meta.dimensions.product_category as string[];
        setEntities(cats);
        setEntity((prev) => (cats.includes(prev) ? prev : cats[0] ?? ""));
      })
      .catch(() => setError("Failed to load dataset metadata."));
  }, []);

  async function run(next?: { scope?: "category" | "sku"; entity?: string; horizon?: number }) {
    const s = next?.scope ?? scope;
    const e = next?.entity ?? entity;
    const h = next?.horizon ?? Number(horizon);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: s, entity: e, horizon: h }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Forecast failed.");
      setResult(json as ForecastResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Forecast failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (entities.length > 0) void run({ entity: entities.includes(entity) ? entity : entities[0] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities]);

  /** Chart with dashed forecast line + illustrative ±MAE uncertainty band. */
  const chart: ChartSpec | null = useMemo(() => {
    if (!result || !result.eligibility.eligible) return null;
    const mae = result.evaluation?.mae;
    const historyMap = new Map(result.history.map((h) => [h.month, h.quantity]));
    const forecastMap = new Map(result.forecast.map((p) => [p.month, p.quantity]));
    const months = [...result.history.map((h) => h.month), ...result.forecast.map((p) => p.month)];
    const last = result.history.at(-1)?.month;
    return {
      type: "line",
      title: `Demand forecast vs actuals — ${result.entity} (${result.scope})`,
      xKey: "month",
      yKey: "quantity",
      xLabel: "Month",
      yLabel: "Units demanded",
      unit: "units",
      series: [
        { key: "historical", name: "Actual demand", colorRole: "primary" },
        { key: "forecast", name: "Forecasted demand", colorRole: "accent", dashed: true },
      ],
      band: mae != null ? { lowKey: "bandLow", highKey: "bandHigh" } : undefined,
      data: months.map((m) => {
        const f = forecastMap.has(m) ? (forecastMap.get(m) as number) : m === last ? (historyMap.get(m) as number) : null;
        return {
          month: m,
          historical: historyMap.has(m) ? (historyMap.get(m) as number) : null,
          forecast: f,
          bandLow: f !== null && mae != null ? Math.max(0, Math.round((f - mae) * 100) / 100) : null,
          bandHigh: f !== null && mae != null ? Math.round((f + mae) * 100) / 100 : null,
        };
      }),
    };
  }, [result]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">Demand Forecasting</h1>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
            3-month moving average with eligibility checks and an inventory recommendation.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]" htmlFor="scope">Scope</label>
            <Select
              value={scope}
              onValueChange={(v) => {
                const s = v as "category" | "sku";
                setScope(s);
                // Reset the entity for the new scope — a category name is never
                // a valid SKU and vice versa.
                if (s === "category") {
                  const first = entities.includes(entity) ? entity : entities[0] ?? "";
                  setEntity(first);
                  void run({ scope: s, entity: first });
                } else {
                  setEntity("");
                  setResult(null);
                }
              }}
            >
              <SelectTrigger id="scope" className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="category">Category</SelectItem>
                <SelectItem value="sku">SKU</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]" htmlFor="entity">
              {scope === "category" ? "Category" : "SKU"}
            </label>
            {scope === "category" ? (
              <Select value={entity} onValueChange={setEntity}>
                <SelectTrigger id="entity" className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {entities.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <SkuCombobox
                value={entity}
                onPick={(sku) => {
                  setEntity(sku);
                  void run({ scope: "sku", entity: sku });
                }}
                onChange={setEntity}
              />
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]" htmlFor="horizon">Horizon</label>
            <Select value={horizon} onValueChange={setHorizon}>
              <SelectTrigger id="horizon" className="w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {HORIZONS.map((h) => (
                  <SelectItem key={h} value={String(h)}>{h} months</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => run()} disabled={loading || !entity} className="bg-[var(--accent)] hover:bg-[var(--accent-hover)]">
            {loading ? "Forecasting…" : "Forecast"}
          </Button>
        </div>
      </div>

      {scope === "sku" && (
        <div className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--warning-soft)] p-4 text-sm">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warning)]" />
          <p className="text-[var(--ink-2)]">
            <span className="font-medium">Heads-up:</span> 355 SKUs share 400 orders (~1 order per SKU), so nearly every
            SKU fails the 6-month eligibility check by design — that rejection is shown honestly. Try a category for a
            real forecast.
          </p>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Forecast failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-80 rounded-xl" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        </div>
      )}

      {result && !loading && !result.eligibility.eligible && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warning)]" />
            <div>
              <h2 className="font-semibold text-[var(--ink)]">Insufficient history — no forecast produced</h2>
              <p className="mt-1 text-sm text-[var(--ink-2)]">{result.eligibility.reason}</p>
              <p className="mt-2 text-xs text-[var(--ink-muted)]">
                Observed months: {result.eligibility.observedMonths} · calendar span: {result.eligibility.spanMonths} ·
                coverage: {Math.round(result.eligibility.coverage * 100)}%
              </p>
              {result.history.length > 0 && (
                <p className="mt-1 text-xs text-[var(--ink-muted)]">
                  Available history: {result.history.map((h) => `${h.month}: ${h.quantity}`).join(", ")}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {result && !loading && result.eligibility.eligible && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold text-[var(--ink-2)]">{chart?.title}</h2>
            {chart && <ChartRenderer spec={chart} />}
            <p className="mt-2 text-xs text-[var(--faint)]">
              Dashed = forecast. Band = illustrative ±{result.evaluation?.mae ?? "n/a"} units (holdout MAE), not a
              statistical confidence interval.
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--faint)]">Forecast demand</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--ink)]">
                  {result.inventory?.totalForecastDemand}
                </p>
                <p className="text-xs text-[var(--faint)]">units · next {result.forecast.length} months</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--faint)]">Holdout MAE</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--ink)]">{result.evaluation?.mae ?? "n/a"}</p>
                <p className="text-xs text-[var(--faint)]">3-month chronological holdout</p>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--risk)]/30 bg-[var(--risk-soft)] p-4">
              <div className="flex items-center gap-2">
                <PackageCheck className="h-5 w-5 text-[var(--risk)]" />
                <h3 className="font-semibold text-[var(--ink)]">Recommended stock</h3>
              </div>
              <p className="mt-2 text-3xl font-bold tabular-nums text-[var(--ink)]">
                {result.inventory?.recommendedStock} <span className="text-base font-normal text-[var(--ink-muted)]">units</span>
              </p>
              <p className="mt-1 text-xs text-[var(--ink-2)]">
                = ceil({result.inventory?.totalForecastDemand} × 1.{result.inventory?.bufferPct === 20 ? "20" : "00"}) —
                illustrative {result.inventory?.bufferPct}% safety buffer. Lead time, service level, replenishment
                cadence and stock-on-hand are not in the dataset, so this is not statistically calculated safety stock.
              </p>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--accent-soft)] p-4 text-xs text-[var(--ink-2)]">
              <div className="mb-1 flex items-center gap-2 font-semibold text-[var(--ink)]">
                <TrendingUp className="h-4 w-4 text-[var(--accent)]" /> Methodology
              </div>
              <ul className="list-disc space-y-1 pl-4">
                <li>Recursive 3-month moving average; one-step = mean of last 3 observed months.</li>
                <li>
                  Eligibility: ≥ 6 observed months and ≥ 50% calendar coverage; missing months are never treated as
                  zero demand. This entity: {result.eligibility.observedMonths} months,{" "}
                  {Math.round(result.eligibility.coverage * 100)}% coverage.
                </li>
                {result.limitations.slice(0, 3).map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm lg:col-span-3">
            <h2 className="mb-2 p-4 pb-0 text-sm font-semibold text-[var(--ink-2)]">Forecast values</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Forecast (units)</TableHead>
                  {result.evaluation?.mae != null && <TableHead className="text-right">Illustrative range (±MAE)</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.forecast.map((p) => (
                  <TableRow key={p.month}>
                    <TableCell className="font-medium">{p.month}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.quantity}</TableCell>
                    {result.evaluation?.mae != null && (
                      <TableCell className="text-right tabular-nums text-[var(--ink-muted)]">
                        {Math.max(0, Math.round((p.quantity - result.evaluation!.mae!) * 10) / 10)} –{" "}
                        {Math.round((p.quantity + result.evaluation!.mae!) * 10) / 10}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
