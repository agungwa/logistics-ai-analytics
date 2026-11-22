"use client";

import { useEffect, useState } from "react";
import { Check, FolderOpen, Pencil, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { relativeTime, summarizeQuery, type ReportDto } from "@/modules/analytics/report.utils";

/**
 * The user's saved reports. Designed for volume: searchable, scrollable,
 * paged from the API, with a query summary under each name — not a wall of
 * chips. Click a report to load it; rename or delete from the row actions.
 */
export function ReportLibrary({
  reports,
  total,
  limit,
  search,
  searching,
  loadingMore,
  onSearch,
  onLoadMore,
  onRun,
  onRename,
  onDelete,
}: {
  reports: ReportDto[];
  total: number;
  limit: number;
  search: string;
  searching: boolean;
  loadingMore: boolean;
  onSearch: (q: string) => void;
  onLoadMore: () => void;
  onRun: (report: ReportDto) => void;
  onRename: (id: string, name: string) => Promise<boolean>;
  onDelete: (report: ReportDto) => void;
}) {
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [savingRename, setSavingRename] = useState(false);
  // Relative times are computed after mount so server and browser agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  const nearLimit = limit > 0 && total / limit >= 0.8;

  async function saveRename() {
    if (!editing || !editing.value.trim()) return;
    setSavingRename(true);
    const ok = await onRename(editing.id, editing.value.trim());
    setSavingRename(false);
    if (ok) setEditing(null);
  }

  return (
    <div className="border-t border-[var(--border)] pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4" style={{ color: "var(--accent)" }} />
          <h3 className="text-sm font-semibold text-[var(--ink)]">Saved reports</h3>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ background: "var(--hover-wash)", color: "var(--ink-muted)" }}
            title={`${total} of ${limit} report slots used`}
          >
            {total} / {limit}
          </span>
          {searching && <span className="text-[11px] text-[var(--faint)]">searching…</span>}
        </div>
        {total > 0 && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--faint)" }} />
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search reports…"
              aria-label="Search saved reports"
              className="h-8 w-52 rounded-lg border border-[var(--border)] bg-[var(--card)] pl-8 pr-3 text-xs text-[var(--ink)] shadow-sm placeholder:text-[var(--faint)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            />
          </div>
        )}
      </div>

      {nearLimit && (
        <p className="mt-2 text-xs" style={{ color: "var(--warning)" }}>
          You&apos;ve used {total} of {limit} report slots. Delete the ones you no longer need to free up space.
        </p>
      )}

      {total === 0 && !search ? (
        <p className="mt-2 text-xs text-[var(--faint)]">
          Nothing saved yet — build a chart and press “Save report”, or describe one to the AI above.
        </p>
      ) : (
        <ul className="mt-1.5 max-h-72 space-y-0.5 overflow-y-auto pr-1">
          {reports.map((r) => {
            const isEditing = editing?.id === r.id;
            return (
              <li key={r.id}>
                {isEditing ? (
                  <div className="flex items-center gap-1.5 rounded-lg px-2 py-1.5" style={{ background: "var(--accent-soft)" }}>
                    <input
                      autoFocus
                      value={editing.value}
                      disabled={savingRename}
                      maxLength={80}
                      aria-label="Report name"
                      onChange={(e) => setEditing({ id: r.id, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveRename();
                        if (e.key === "Escape") setEditing(null);
                      }}
                      className="h-8 flex-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-2.5 text-sm text-[var(--ink)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                    />
                    <button
                      onClick={() => void saveRename()}
                      disabled={savingRename || !editing.value.trim()}
                      aria-label="Save name"
                      className="flex h-8 w-8 items-center justify-center rounded-md disabled:opacity-40"
                      style={{ color: "var(--success)" }}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button onClick={() => setEditing(null)} aria-label="Cancel renaming" className="flex h-8 w-8 items-center justify-center rounded-md" style={{ color: "var(--ink-muted)" }}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onRun(r)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRun(r);
                      }
                    }}
                    className="group -mx-1.5 flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--hover-wash)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
                    title={`Run “${r.name}”`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--ink)]">{r.name}</p>
                      <p className="truncate text-xs text-[var(--faint)]">{summarizeQuery(r.query)}</p>
                    </div>
                    {now !== null && (
                      <span className="shrink-0 whitespace-nowrap text-[11px] text-[var(--faint)]">{relativeTime(r.updatedAt, now)}</span>
                    )}
                    <div className="flex shrink-0 gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing({ id: r.id, value: r.name });
                        }}
                        aria-label={`Rename ${r.name}`}
                        title="Rename"
                        className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--card)]"
                        style={{ color: "var(--ink-muted)" }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(r);
                        }}
                        aria-label={`Delete ${r.name}`}
                        title="Delete"
                        className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--card)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" style={{ color: "var(--risk)" }} />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
          {reports.length === 0 && (
            <li className="px-2 py-3 text-xs text-[var(--faint)]">
              No reports match “{search}”.
            </li>
          )}
        </ul>
      )}

      {reports.length > 0 && reports.length < total && (
        <div className="mt-1.5 flex items-center justify-between">
          <p className="text-[11px] text-[var(--faint)]">Showing {reports.length} of {total}</p>
          <Button size="sm" variant="outline" className="h-7 border-[var(--border)] text-xs" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
