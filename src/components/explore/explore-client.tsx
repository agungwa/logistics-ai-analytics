"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlus, Download, Wand2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartRenderer } from "@/components/charts/ChartRenderer";
import { DateRangePicker } from "@/components/explore/date-range-picker";
import { ReportLibrary } from "@/components/explore/report-library";
import { loadAiSettings } from "@/components/ai/ai-settings";
import { COUNT_METRICS, GROUPABLE_METRICS } from "@/modules/analytics/analytics.schemas";
import { OVERVIEW_CHART_PRESETS, REPORT_PRESETS } from "@/modules/analytics/report.presets";
import {
  EXPLORE_PAGE_SIZE,
  REPORT_CHART_TYPES,
  REPORT_LIMIT,
  type ReportChartType,
  type ReportDto,
  type ReportQuery,
} from "@/modules/analytics/report.utils";
import type { AnalyticsResult } from "@/modules/analytics/analytics.types";

const METRICS = [
  { value: "total_orders", label: "Total orders" },
  { value: "delivered_orders", label: "Delivered orders" },
  { value: "delayed_orders", label: "Delayed orders" },
  { value: "delivery_performance", label: "Delivery performance (delivered vs delayed)" },
  { value: "on_time_rate", label: "On-time rate (%)" },
  { value: "delay_rate", label: "Delay rate (%)" },
  { value: "avg_delivery_time", label: "Avg delivery time (days)" },
  { value: "total_order_value", label: "Total order value (USD)" },
  { value: "avg_order_value", label: "Avg order value (USD)" },
];
const isComparison = (m: string) => m === "delivery_performance";
const DIMENSIONS = [
  { value: "carrier", label: "By carrier" },
  { value: "region", label: "By region" },
  { value: "warehouse", label: "By warehouse" },
  { value: "product_category", label: "By category" },
  { value: "destination_city", label: "By destination city" },
  { value: "origin_city", label: "By origin city" },
  { value: "status", label: "By status" },
];
const BUCKETS = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];
const RANGES = [
  { value: "all", label: "All time" },
  { value: "last_1_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "last_6_months", label: "Last 6 months" },
  { value: "year_to_date", label: "Year to date" },
  { value: "custom", label: "Custom range…" },
];
const REPORTS_PAGE = 20;

const AI_EXAMPLES = [
  "Which carriers struggled most with delays last quarter?",
  "How many orders did we get each month this year?",
  "Compare delivered and delayed orders by region",
  "Show me the order value for each product category",
];

export function ExploreClient({ canUseAi }: { canUseAi: boolean }) {
  const [metric, setMetric] = useState("delayed_orders");
  const [dimension, setDimension] = useState("none"); // "none" | dimension id
  const [bucket, setBucket] = useState("month"); // "none" | bucket
  const [range, setRange] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [carrier, setCarrier] = useState("all");
  const [meta, setMeta] = useState<{ dimensions: { carrier: string[] }; datasetDateRange?: { min: string; max: string } } | null>(null);
  const [result, setResult] = useState<AnalyticsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const [reportName, setReportName] = useState("");
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [chartType, setChartType] = useState<ReportChartType>("auto");

  const [reports, setReports] = useState<ReportDto[]>([]);
  const [reportsTotal, setReportsTotal] = useState(0);
  const [reportsLimit, setReportsLimit] = useState(REPORT_LIMIT);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const listRequest = useRef(0);

  const mode = dimension !== "none" ? "dimension" : bucket !== "none" ? "time" : "scalar";
  const metricOptions = METRICS.filter((m) => {
    if (isComparison(m.value)) return mode !== "scalar"; // comparison needs a bucket or dimension
    if (mode === "time") return (COUNT_METRICS as readonly string[]).includes(m.value);
    if (mode === "dimension") return (GROUPABLE_METRICS as readonly string[]).includes(m.value);
    return true;
  });

  useEffect(() => {
    fetch("/api/metadata").then((r) => r.json()).then(setMeta).catch(() => setError("Failed to load metadata."));
  }, []);

  // Report library: search debounced; the same fetch is used for load-more.
  useEffect(() => {
    const timer = setTimeout(() => void fetchReports(search, 0, false), search ? 250 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function fetchReports(q: string, pageToLoad: number, append: boolean) {
    const requestId = ++listRequest.current;
    append ? setLoadingMore(true) : setSearching(true);
    try {
      const res = await fetch(`/api/reports?q=${encodeURIComponent(q)}&page=${pageToLoad}&pageSize=${REPORTS_PAGE}`);
      if (!res.ok) return;
      const json = await res.json();
      if (requestId !== listRequest.current) return; // a newer request has superseded this one
      setReports((prev) => (append ? [...prev, ...json.reports] : json.reports));
      setReportsTotal(json.total);
      setReportsLimit(json.limit ?? REPORT_LIMIT);
    } catch {
      /* the library is non-critical; keep showing the last list */
    } finally {
      if (requestId === listRequest.current) {
        setLoadingMore(false);
        setSearching(false);
      }
    }
  }

  function currentQuery(overrides?: { metric?: string; dimension?: string; bucket?: string; range?: string; carrier?: string; page?: number }) {
    const m = overrides?.metric ?? metric;
    const d = overrides?.dimension ?? dimension;
    const b = overrides?.bucket ?? bucket;
    const r = overrides?.range ?? range;
    const effectiveRange = r === "custom" ? { from: customFrom, to: customTo } : r;
    return {
      metric: m,
      dimension: d !== "none" ? d : undefined,
      timeBucket: b !== "none" ? b : undefined,
      dateRange: effectiveRange,
      filters: (overrides?.carrier ?? carrier) !== "all" ? { carrier: [overrides?.carrier ?? carrier] } : {},
      // Time series stay chronological (SQL order); only breakdowns sort by value.
      ...(b === "none" ? { sort: { by: "value" as const, dir: "desc" as const } } : {}),
      limit: EXPLORE_PAGE_SIZE,
      offset: (overrides?.page ?? page) * EXPLORE_PAGE_SIZE,
    };
  }

  /** Run a query with the page reset to 0 (any filter/metric change restarts paging). */
  async function runReset(overrides: Parameters<typeof currentQuery>[0]) {
    setPage(0);
    await runQuery(currentQuery({ ...overrides, page: 0 }));
  }

  async function runQuery(query: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    try {
      // Always paged the way the table expects, wherever the query came from.
      const normalized = { ...query, limit: EXPLORE_PAGE_SIZE, offset: typeof query.offset === "number" ? query.offset : 0 };
      const res = await fetch("/api/explore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalized),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Query failed.");
      setResult(json as AnalyticsResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Query failed.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  /** Apply a query (preset or saved report) to the controls and run it. */
  function applyReport(source: { query: ReportQuery | Record<string, unknown>; chartType?: string }, precomputed?: AnalyticsResult) {
    const q = source.query as { metric: string; dimension?: string; timeBucket?: string; dateRange?: string; filters?: { carrier?: string[] } };
    setMetric(q.metric);
    setDimension(q.dimension ?? "none");
    setBucket(q.timeBucket ?? "none");
    setRange(typeof q.dateRange === "string" ? q.dateRange : "all");
    setCarrier(q.filters?.carrier?.[0] ?? "all");
    setChartType((REPORT_CHART_TYPES as readonly string[]).includes(source.chartType ?? "") ? (source.chartType as ReportChartType) : "auto");
    setPage(0);
    if (precomputed) {
      setResult(precomputed);
      setError(null);
    } else {
      void runQuery({ ...q, offset: 0 });
    }
  }

  async function saveReport() {
    if (!reportName.trim() || !result) return;
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: reportName.trim(), query: { ...currentQuery({ page: 0 }), offset: 0 }, chartType }),
    });
    const json = await res.json().catch(() => null);
    if (res.ok) {
      setSaveNote(json?.updatedExisting ? `Updated “${json.report.name}”` : `Saved “${json.report.name}”`);
      setReportName("");
      setTimeout(() => setSaveNote(null), 2500);
      void fetchReports(search, 0, false);
    } else {
      setError(json?.error?.message ?? "Failed to save the report.");
    }
  }

  async function renameReport(id: string, name: string): Promise<boolean> {
    const res = await fetch(`/api/reports/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(json?.error?.message ?? "Couldn't rename the report.");
      return false;
    }
    void fetchReports(search, 0, false);
    return true;
  }

  function deleteReport(report: ReportDto) {
    if (!confirm(`Delete “${report.name}”?`)) return;
    void (async () => {
      await fetch(`/api/reports/${report.id}`, { method: "DELETE" });
      await fetchReports(search, 0, false);
    })();
  }

  /** AI report generation: natural language -> one validated query -> executed -> saved. */
  async function generateWithAi(e: React.FormEvent) {
    e.preventDefault();
    if (!aiPrompt.trim() || aiBusy) return;
    setAiBusy(true);
    setError(null);
    setAiNote(null);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const settings = loadAiSettings();
    if (settings?.apiKey) {
      headers["x-ai-provider"] = settings.provider;
      headers["x-ai-model"] = settings.model;
      headers["x-ai-base-url"] = settings.baseUrl;
      headers["x-ai-api-key"] = settings.apiKey;
    }
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt: aiPrompt.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Generation failed.");
      applyReport(json.report as { query: Record<string, unknown>; chartType?: string }, json.result as AnalyticsResult);
      const n = (json.result as AnalyticsResult).rows.length;
      setAiNote(
        json.updatedExisting
          ? `You already had this one — updated “${json.report.name}” (${n} rows)`
          : `Saved as “${json.report.name}” · ${n} rows · rename it below if you like`
      );
      setAiPrompt("");
      void fetchReports(search, 0, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setAiBusy(false);
    }
  }

  // Initial load: ?chart= deep link from the Overview page (or the monthly volume preset)
  useEffect(() => {
    const deepLink = new URLSearchParams(window.location.search).get("chart");
    const query = (deepLink && OVERVIEW_CHART_PRESETS[deepLink]) || (REPORT_PRESETS[3].query as Record<string, unknown>);
    applyReport({ query: query as Record<string, unknown> });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = result?.rows ?? [];
  const dimLabel = DIMENSIONS.find((d) => d.value === result?.queryPlan.dimension)?.label ?? "";

  /** Apply the user's chart-type override to the server-built spec. */
  const displaySpec = useMemo(() => {
    if (!result?.chart || chartType === "auto") return result?.chart ?? null;
    let spec = { ...result.chart, type: chartType } as typeof result.chart;
    if (chartType === "pie" && spec.data.length > 8) {
      // Fold small slices into "Other" — keep the pie readable
      const top = spec.data.slice(0, 7);
      const restValue = spec.data.slice(7).reduce((sum, d) => sum + (Number(d[spec.yKey]) || 0), 0);
      spec = { ...spec, data: [...top, { [spec.xKey]: "Other", [spec.yKey]: Math.round(restValue * 100) / 100 }] };
    }
    return spec;
  }, [result, chartType]);

  const canSwitchChart = Boolean(result?.chart) && (result?.rows.length ?? 0) >= 2;
  const pieAllowed = mode === "dimension";

  function exportCsv() {
    if (!result) return;
    const header = [dimLabel || result.queryPlan.timeBucket || "metric", "value", "numerator", "denominator"];
    const body = rows.map((r) => [r.key, r.value, r.numerator ?? "", r.denominator ?? ""].map(csvEscape).join(","));
    const blob = new Blob([[header.join(","), ...body].join("\n") + "\n"], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "explore-chart.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">Explore</h1>
        <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
          Build a chart from any supported metric, save it as a report, and reload it anytime.
        </p>
      </div>

      {/* AI report generation */}
      {canUseAi && (
        <form onSubmit={generateWithAi} className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] p-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[var(--ink)]">
            <Wand2 className="h-4 w-4 text-[var(--accent)]" /> Describe a report — the AI writes the query and the title
          </p>
          <div className="flex gap-2">
            <input
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="In your own words — e.g. “which carriers struggled most with delays last quarter?”"
              aria-label="Report description"
              maxLength={300}
              className="h-10 flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 text-sm text-[var(--ink)] shadow-sm placeholder:text-[var(--faint)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            />
            <Button type="submit" disabled={aiBusy || aiPrompt.trim().length < 3} className="bg-[var(--accent)] hover:bg-[var(--accent-hover)]">
              {aiBusy ? "Writing…" : "Create report"}
            </Button>
          </div>
          {aiBusy && <p className="mt-2 text-xs text-[var(--ink-muted)]">Nothing is saved until the query runs and returns data.</p>}
          {!aiBusy && aiNote && <p className="mt-2 text-xs text-[var(--success)]">{aiNote}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {AI_EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setAiPrompt(ex)}
                className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[11px] text-[var(--ink-muted)] transition-colors hover:text-[var(--accent)]"
              >
                {ex}
              </button>
            ))}
          </div>
        </form>
      )}

      {/* Presets + saved-report library */}
      <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">Presets</span>
          {REPORT_PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => applyReport({ query: p.query as Record<string, unknown> })}
              title={p.description}
              className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] shadow-sm transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              {p.name}
            </button>
          ))}
        </div>

        <ReportLibrary
          reports={reports}
          total={reportsTotal}
          limit={reportsLimit}
          search={search}
          searching={searching}
          loadingMore={loadingMore}
          onSearch={setSearch}
          onLoadMore={() => void fetchReports(search, Math.floor(reports.length / REPORTS_PAGE), true)}
          onRun={(r) => applyReport(r)}
          onRename={renameReport}
          onDelete={deleteReport}
        />
      </div>

      {/* Builder */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]" htmlFor="exp-metric">Metric</label>
          <Select
            value={metric}
            onValueChange={(v) => {
              setMetric(v);
              void runReset({ metric: v });
            }}
          >
            <SelectTrigger id="exp-metric" className="w-[210px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {metricOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]" htmlFor="exp-dim">Breakdown</label>
          <Select
            value={dimension}
            onValueChange={(v) => {
              const nextMetric = (GROUPABLE_METRICS as readonly string[]).includes(metric) ? metric : "delayed_orders";
              setDimension(v);
              setBucket("none");
              setMetric(nextMetric);
              void runReset({ dimension: v, bucket: "none", metric: nextMetric });
            }}
          >
            <SelectTrigger id="exp-dim" className="w-[170px]"><SelectValue placeholder="No breakdown" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No breakdown</SelectItem>
              {DIMENSIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]" htmlFor="exp-bucket">Time series</label>
          <Select
            value={bucket}
            onValueChange={(v) => {
              const nextMetric = (COUNT_METRICS as readonly string[]).includes(metric) ? metric : "delayed_orders";
              setBucket(v);
              setDimension("none");
              setMetric(nextMetric);
              void runReset({ bucket: v, dimension: "none", metric: nextMetric });
            }}
          >
            <SelectTrigger id="exp-bucket" className="w-[150px]"><SelectValue placeholder="No time series" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No time series</SelectItem>
              {BUCKETS.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]" htmlFor="exp-range">Date range</label>
          <Select
            value={range}
            onValueChange={(v) => {
              setRange(v);
              if (v !== "custom") void runReset({ range: v });
            }}
          >
            <SelectTrigger id="exp-range" className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>{RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {range === "custom" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Custom range</label>
            <DateRangePicker
              min={meta?.datasetDateRange?.min ?? "2025-01-01"}
              max={meta?.datasetDateRange?.max ?? "2025-12-30"}
              from={customFrom}
              to={customTo}
              onChange={(f, t) => {
                setCustomFrom(f);
                setCustomTo(t);
                void runReset({});
              }}
            />
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]" htmlFor="exp-carrier">Carrier</label>
          <Select value={carrier} onValueChange={(v) => { setCarrier(v); void runReset({ carrier: v }); }}>
            <SelectTrigger id="exp-carrier" className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All carriers</SelectItem>
              {(meta?.dimensions.carrier ?? []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => void runReset({})} disabled={loading} className="bg-[var(--accent)] hover:bg-[var(--accent-hover)]">
          <Wand2 className="mr-1 h-4 w-4" /> {loading ? "Building…" : "Build chart"}
        </Button>
      </div>

      {/* Save bar */}
      {result && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 gap-2 sm:max-w-sm">
            <input
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              placeholder="Name this report…"
              maxLength={80}
              aria-label="Report name"
              className="h-9 flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--ink)] shadow-sm placeholder:text-[var(--faint)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            />
            <Button onClick={saveReport} disabled={!reportName.trim()} size="sm" className="h-9" variant="outline">
              <BookmarkPlus className="mr-1 h-4 w-4" /> {saveNote ? "Saved!" : "Save report"}
            </Button>
          </div>
          {saveNote && <p className="text-xs text-[var(--success)]">{saveNote}</p>}
          <Button size="sm" variant="outline" className="h-9" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="mr-1 h-3.5 w-3.5" /> CSV
          </Button>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      )}

      {result && !loading && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-[var(--ink-2)]">{result.chart?.title ?? result.queryPlan.metricLabel}</h2>
                <p className="text-xs text-[var(--faint)]">{result.queryPlan.dateRange.label}</p>
              </div>
              {canSwitchChart && (
                <div className="flex overflow-hidden rounded-lg border border-[var(--border)]" role="group" aria-label="Chart type">
                  {(["auto", "bar", "line", ...(pieAllowed ? (["pie"] as const) : [])] as ReportChartType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setChartType(t)}
                      aria-pressed={chartType === t}
                      title={t === "auto" ? "Server-selected type" : `Show as ${t} chart`}
                      className="px-3 py-1.5 text-xs font-medium capitalize transition-colors"
                      style={{
                        background: chartType === t ? "var(--accent-soft)" : "var(--card)",
                        color: chartType === t ? "var(--accent)" : "var(--ink-muted)",
                      }}
                    >
                      {t === "auto" ? "Auto" : t}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {displaySpec ? (
              <ChartRenderer spec={displaySpec} />
            ) : (
              <p className="py-10 text-center text-sm text-[var(--ink-muted)]">No data for this selection.</p>
            )}
          </div>

          {rows.length > 0 && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
              <h2 className="p-4 pb-2 text-sm font-semibold text-[var(--ink-2)]">Underlying data</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{dimLabel || result.queryPlan.timeBucket || "Metric"}</TableHead>
                    {isComparison(result.queryPlan.metric) ? (
                      <>
                        <TableHead className="text-right">Delivered</TableHead>
                        <TableHead className="text-right">Delayed</TableHead>
                        <TableHead className="text-right">Completed total</TableHead>
                      </>
                    ) : (
                      <>
                        <TableHead className="text-right">{result.queryPlan.metricLabel} ({result.queryPlan.unit})</TableHead>
                        {rows.some((r) => r.denominator !== undefined) && (
                          <TableHead className="text-right">num / denom</TableHead>
                        )}
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell className="font-medium">{r.key}</TableCell>
                      {isComparison(result.queryPlan.metric) ? (
                        <>
                          <TableCell className="text-right tabular-nums">{r.delivered}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.delayed}</TableCell>
                          <TableCell className="text-right tabular-nums text-[var(--ink-muted)]">{r.value}</TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="text-right tabular-nums">{r.value}</TableCell>
                          {rows.some((x) => x.denominator !== undefined) && (
                            <TableCell className="text-right tabular-nums text-[var(--ink-muted)]">
                              {r.numerator ?? "—"} / {r.denominator ?? "—"}
                            </TableCell>
                          )}
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {result.totalRows > EXPLORE_PAGE_SIZE && (
                <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-2.5">
                  <p className="text-xs text-[var(--ink-muted)]">
                    Showing {page * EXPLORE_PAGE_SIZE + 1}–{Math.min((page + 1) * EXPLORE_PAGE_SIZE, result.totalRows)} of {result.totalRows}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-[var(--border)] text-xs"
                      disabled={page === 0 || loading}
                      onClick={() => {
                        const next = page - 1;
                        setPage(next);
                        void runQuery(currentQuery({ page: next }));
                      }}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-[var(--border)] text-xs"
                      disabled={(page + 1) * EXPLORE_PAGE_SIZE >= result.totalRows || loading}
                      onClick={() => {
                        const next = page + 1;
                        setPage(next);
                        void runQuery(currentQuery({ page: next }));
                      }}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {result.queryPlan.notes.length > 0 && (
            <p className="text-xs text-[var(--faint)]">{result.queryPlan.notes.join(" ")}</p>
          )}
        </div>
      )}
    </div>
  );
}

function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
