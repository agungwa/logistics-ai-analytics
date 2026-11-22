"use client";

import { useEffect, useRef, useState } from "react";

/**
 * SKU autocomplete combobox — 355 SKUs means nobody types them from memory.
 * Shows the top 10 matches with order counts so users can pick SKUs that
 * actually have history. Picking one runs the forecast immediately.
 */

interface SkuOption {
  sku: string;
  orders: number;
}

export function SkuCombobox({
  value,
  onChange,
  onPick,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (sku: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<SkuOption[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function search(q: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/skus?q=${encodeURIComponent(q)}`);
        if (res.ok) setOptions((await res.json()).skus ?? []);
      } finally {
        setLoading(false);
      }
    }, 180);
  }

  return (
    <div className="relative" ref={ref}>
      <input
        id="entity"
        value={value}
        autoComplete="off"
        placeholder="Search SKU…"
        onFocus={() => {
          setOpen(true);
          search(value);
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          search(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && options.length > 0 && open) {
            e.preventDefault();
            onPick(options[0].sku);
            setOpen(false);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        className="h-10 w-[200px] rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--ink)] shadow-sm placeholder:text-[var(--faint)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        style={{ borderColor: open ? "var(--accent)" : undefined }}
      />

      {open && (
        <div
          className="absolute left-0 z-50 mt-1 w-[260px] overflow-hidden rounded-xl py-1"
          style={{
            top: "100%",
            background: "var(--card)",
            border: "1px solid var(--border)",
            boxShadow: "0 16px 40px rgba(2, 6, 23, 0.18)",
          }}
          role="listbox"
          aria-label="SKU suggestions"
        >
          {loading && <p className="px-3 py-2 text-xs" style={{ color: "var(--faint)" }}>Searching…</p>}
          {!loading && options.length === 0 && (
            <p className="px-3 py-2 text-xs" style={{ color: "var(--faint)" }}>
              No SKUs match “{value}”.
            </p>
          )}
          {options.map((o) => (
            <button
              key={o.sku}
              type="button"
              role="option"
              aria-selected={o.sku === value}
              onClick={() => {
                onPick(o.sku);
                setOpen(false);
              }}
              className="my-select-option flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs"
              style={{ color: "var(--ink-2)" }}
            >
              <span className="font-mono font-medium">{o.sku}</span>
              <span style={{ color: o.orders >= 3 ? "var(--success)" : "var(--faint)" }}>
                {o.orders} order{o.orders === 1 ? "" : "s"}
              </span>
            </button>
          ))}
          {!loading && options.length > 0 && (
            <p className="mt-1 border-t px-3 py-1.5 text-[10px]" style={{ borderColor: "var(--border)", color: "var(--faint)" }}>
              Green = more history. Most SKUs here have 1 order — category forecasts
              are the meaningful ones on this dataset.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
