"use client";

import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AiQueryResult } from "@/modules/ai/orchestrator.service";
import type { MetricRow } from "@/modules/analytics/analytics.types";

/**
 * Explainability for one AI answer. Collapsed to a single readable line by
 * default (the assistant stays conversational); one click opens the full audit:
 * tool calls, resolved filters, date range, and the underlying data.
 */

function compactSummary(result: AiQueryResult): string {
  const parts: string[] = [result.model];
  const tools = result.toolRuns.filter((t) => t.ok).map((t) => t.tool);
  if (tools.length > 0) parts.push(tools.join(" + "));
  const failed = result.toolRuns.filter((t) => !t.ok).length;
  if (failed > 0) parts.push(`${failed} failed`);
  const plan = result.analytics?.queryPlan;
  if (plan) {
    let what = plan.metricLabel;
    if (plan.dimension) what += ` by ${plan.dimension.replace(/_/g, " ")}`;
    if (plan.timeBucket) what += ` per ${plan.timeBucket}`;
    parts.push(what);
    parts.push(`${plan.dateRange.from} → ${plan.dateRange.to}`);
  } else if (result.forecast) {
    parts.push(`${result.forecast.entity} (${result.forecast.scope})`);
  }
  return parts.join(" · ");
}

export function QueryExplainability({ result }: { result: AiQueryResult }) {
  const plan = result.analytics?.queryPlan;
  const rows = result.analytics?.rows ?? [];
  const dimLabel = plan?.dimension?.replace(/_/g, " ") ?? plan?.timeBucket ?? "Metric";

  return (
    <details className="explain rounded-xl border border-[var(--border)] bg-[var(--card)] text-xs">
      <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-[var(--faint)] transition-colors hover:text-[var(--ink-muted)]">
        <Chevron className="explain-chev h-3 w-3 shrink-0 transition-transform" />
        <span className="truncate">
          How this answer was computed — {compactSummary(result)}
        </span>
      </summary>

      <div className="space-y-3 border-t border-[var(--border)] px-3 py-3">
        <div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">{result.provider} · {result.model}</Badge>
            {result.toolRuns.map((t, i) => (
              <Badge key={i} variant={t.ok ? "secondary" : "destructive"}>
                {t.tool} {t.ok ? "✓" : "✕"}
              </Badge>
            ))}
            {result.toolRuns.length === 0 && <Badge variant="destructive">no tool call</Badge>}
          </div>
          {result.toolRuns.some((t) => !t.ok) && (
            <ul className="mt-2 space-y-1 text-[var(--risk)]">
              {result.toolRuns.filter((t) => !t.ok).map((t, i) => (
                <li key={i}>
                  <span className="font-medium">{t.tool}:</span> {t.error}
                </li>
              ))}
            </ul>
          )}
        </div>

        {plan && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)] p-2">
              <div className="font-medium text-[var(--ink)]">Metric &amp; dimension</div>
              <p className="text-[var(--ink-muted)]">
                {plan.metricLabel}
                {plan.dimension ? ` by ${plan.dimension.replace(/_/g, " ")}` : ""}
                {plan.timeBucket ? ` (${plan.timeBucket} buckets)` : ""}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border)] p-2">
              <div className="font-medium text-[var(--ink)]">Resolved date range</div>
              <p className="text-[var(--ink-muted)]">{plan.dateRange.label}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] p-2">
              <div className="font-medium text-[var(--ink)]">Filters applied</div>
              <p className="text-[var(--ink-muted)]">
                {Object.keys(plan.filters).length === 0
                  ? "none"
                  : Object.entries(plan.filters)
                      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v.join(", ")}`)
                      .join(" · ")}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border)] p-2">
              <div className="font-medium text-[var(--ink)]">Unit</div>
              <p className="text-[var(--ink-muted)]">{plan.unit}</p>
            </div>
          </div>
        )}

        {plan?.notes && plan.notes.length > 0 && (
          <p className="text-[var(--faint)]">{plan.notes.join(" ")}</p>
        )}

        {rows.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-medium text-[var(--ink)]">Underlying data ({rows.length} rows)</span>
              <button
                onClick={() => exportCsv(rows, dimLabel, plan?.metricLabel ?? "value")}
                className="flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
              >
                <Download className="h-3 w-3" /> CSV
              </button>
            </div>
            <div className="max-h-56 overflow-auto rounded-lg border border-[var(--border)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{dimLabel}</TableHead>
                    <TableHead className="text-right">{plan?.metricLabel ?? "Value"}</TableHead>
                    {rows.some((r) => r.denominator !== undefined) && (
                      <TableHead className="text-right">num / denom</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell className="font-medium">{r.key}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.value}
                        {plan?.unit === "%" ? "%" : ""}
                      </TableCell>
                      {rows.some((x) => x.denominator !== undefined) && (
                        <TableCell className="text-right tabular-nums text-[var(--ink-muted)]">
                          {r.numerator ?? "—"} / {r.denominator ?? "—"}
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
    </details>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function exportCsv(rows: MetricRow[], keyHeader: string, valueHeader: string): void {
  const header = [keyHeader, valueHeader, "numerator", "denominator"].map(csvEscape).join(",");
  const body = rows
    .map((r) => [r.key, r.value, r.numerator ?? "", r.denominator ?? ""].map(csvEscape).join(","))
    .join("\n");
  const blob = new Blob([`${header}\n${body}\n`], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "analytics-result.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
