"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUSES = ["delivered", "delayed", "in_transit", "exception", "canceled"] as const;
const RANGES = [
  { value: "all", label: "All time" },
  { value: "last_1_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "year_to_date", label: "Year to date" },
];
const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  delivered: { bg: "var(--success-soft)", fg: "var(--success)" },
  delayed: { bg: "var(--risk-soft)", fg: "var(--risk)" },
  in_transit: { bg: "var(--accent-soft)", fg: "var(--accent)" },
  exception: { bg: "var(--warning-soft)", fg: "var(--warning)" },
  canceled: { bg: "var(--hover-wash)", fg: "var(--ink-muted)" },
};

interface OrderRow {
  order_id: string;
  order_date: string;
  delivery_date: string | null;
  status: string;
  carrier: string;
  route: string;
  region: string;
  product_category: string;
  sku: string;
  quantity: number;
  order_value_usd: number;
  is_promo: boolean;
}

interface OrdersResponse {
  total: number;
  page: number;
  pageSize: number;
  dateRange: { from: string; to: string; label: string };
  rows: OrderRow[];
}

export function OrdersClient() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [carrier, setCarrier] = useState("all");
  const [range, setRange] = useState("all");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [carriers, setCarriers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/metadata")
      .then((r) => r.json())
      .then((m) => setCarriers(m.dimensions.carrier ?? []))
      .catch(() => undefined);
  }, []);

  const load = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ page: String(targetPage), pageSize: "20", dateRange: range });
        if (q.trim()) params.set("q", q.trim());
        if (status !== "all") params.set("status", status);
        if (carrier !== "all") params.set("carrier", carrier);
        const res = await fetch(`/api/orders?${params}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error?.message ?? "Failed to load orders.");
        setData(json as OrdersResponse);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load orders.");
      } finally {
        setLoading(false);
      }
    },
    [q, status, carrier, range]
  );

  useEffect(() => {
    void load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, carrier, range]);

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(0);
    void load(0);
  }

  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : page * 20 + 1;
  const to = Math.min((page + 1) * 20, total);
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">Orders</h1>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
            Raw order records — the drill-down behind every KPI. {data ? data.dateRange.label : ""}
          </p>
        </div>
        <form onSubmit={applySearch} className="flex items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]" htmlFor="ord-q">Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--faint)" }} />
              <input
                id="ord-q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="order id, SKU, client, city…"
                className="h-10 w-[220px] rounded-lg border border-[var(--border)] bg-[var(--card)] pl-8 pr-3 text-sm text-[var(--ink)] shadow-sm placeholder:text-[var(--faint)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]" htmlFor="ord-status">Status</label>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(0);
              }}
            >
              <SelectTrigger id="ord-status" className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]" htmlFor="ord-carrier">Carrier</label>
            <Select
              value={carrier}
              onValueChange={(v) => {
                setCarrier(v);
                setPage(0);
              }}
            >
              <SelectTrigger id="ord-carrier" className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All carriers</SelectItem>
                {carriers.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]" htmlFor="ord-range">Range</label>
            <Select
              value={range}
              onValueChange={(v) => {
                setRange(v);
                setPage(0);
              }}
            >
              <SelectTrigger id="ord-range" className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </form>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to load</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && !data ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        data && (
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Placed</TableHead>
                  <TableHead>Delivered</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Carrier</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Category / SKU</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-sm text-[var(--ink-muted)]">
                      No orders match these filters.
                    </TableCell>
                  </TableRow>
                )}
                {data.rows.map((o) => (
                  <TableRow key={o.order_id}>
                    <TableCell className="font-mono text-xs">{o.order_id}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{o.order_date}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {o.delivery_date ?? <span style={{ color: "var(--faint)" }}>—</span>}
                    </TableCell>
                    <TableCell>
                      <span
                        className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize"
                        style={{
                          background: STATUS_COLORS[o.status]?.bg ?? "var(--hover-wash)",
                          color: STATUS_COLORS[o.status]?.fg ?? "var(--ink-2)",
                        }}
                      >
                        {o.status.replace(/_/g, " ")}
                      </span>
                    </TableCell>
                    <TableCell>{o.carrier}</TableCell>
                    <TableCell className="max-w-[220px] truncate" title={o.route}>{o.route}</TableCell>
                    <TableCell className="text-xs">
                      <span className="font-medium">{o.product_category}</span>
                      <span style={{ color: "var(--faint)" }}> · {o.sku}</span>
                      {o.is_promo && <span style={{ color: "var(--accent)" }}> · promo</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{o.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">${o.order_value_usd.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-2.5">
              <p className="text-xs text-[var(--ink-muted)]">
                {total === 0 ? "No results" : `Showing ${from}–${to} of ${total}`}
                {totalPages > 1 && ` · page ${page + 1} of ${totalPages}`}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-[var(--border)] text-xs"
                  disabled={page === 0 || loading}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-[var(--border)] text-xs"
                  disabled={(page + 1) * 20 >= total || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
