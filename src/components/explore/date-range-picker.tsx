"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Popover date-range picker (no dependency, inline — no portal).
 * Click a start date, then an end date: the range applies immediately.
 * Days outside [min, max] are disabled.
 */

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function iso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function parse(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}
function fmtShort(s: string): string {
  const d = parse(s);
  return `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`;
}

export function DateRangePicker({
  min,
  max,
  from,
  to,
  onChange,
}: {
  min: string;
  max: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const start = from ? parse(from) : parse(min);
    return { y: start.getUTCFullYear(), m: start.getUTCMonth() };
  });
  const [selStart, setSelStart] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSelStart(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setSelStart(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const days = useMemo(() => {
    const first = new Date(Date.UTC(viewMonth.y, viewMonth.m, 1));
    // Monday-first offset
    const offset = (first.getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(viewMonth.y, viewMonth.m + 1, 0)).getUTCDate();
    const cells: Array<{ date: string | null }> = [];
    for (let i = 0; i < offset; i++) cells.push({ date: null });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: iso(new Date(Date.UTC(viewMonth.y, viewMonth.m, d))) });
    }
    return cells;
  }, [viewMonth]);

  const minD = parse(min);
  const maxD = parse(max);
  const canPrev = new Date(Date.UTC(viewMonth.y, viewMonth.m, 1)) > new Date(Date.UTC(minD.getUTCFullYear(), minD.getUTCMonth(), 1));
  const canNext = new Date(Date.UTC(viewMonth.y, viewMonth.m, 1)) < new Date(Date.UTC(maxD.getUTCFullYear(), maxD.getUTCMonth(), 1));

  function pick(date: string) {
    if (!selStart || (from && to)) {
      // start a new selection
      setSelStart(date);
      return;
    }
    const s = parse(selStart);
    const d = parse(date);
    if (d < s) {
      setSelStart(date);
      return;
    }
    onChange(selStart, date);
    setOpen(false);
    setSelStart(null);
    setHover(null);
  }

  // Effective range for highlight (during selection, preview with hover)
  const effFrom = selStart ?? from;
  const effTo = selStart ? (hover && hover >= selStart ? hover : null) : to;

  function dayStyle(date: string): React.CSSProperties {
    const inRange = effFrom && effTo && date > effFrom && date < effTo;
    const isEdge = (effFrom && date === effFrom) || (effTo && date === effTo);
    const disabled = parse(date) < minD || parse(date) > maxD;
    return {
      background: isEdge ? "var(--accent)" : inRange ? "var(--accent-soft)" : "transparent",
      color: disabled ? "var(--faint)" : isEdge ? "#ffffff" : "var(--ink-2)",
      cursor: disabled ? "default" : "pointer",
      opacity: disabled ? 0.4 : 1,
      borderRadius: 8,
    };
  }

  const label = from && to ? `${fmtShort(from)} – ${fmtShort(to)}, ${parse(to).getUTCFullYear()}` : "Pick dates";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Custom date range"
        className="flex h-10 w-[210px] items-center justify-between gap-2 rounded-lg px-3 text-sm"
        style={{
          background: "var(--card)",
          border: `1px solid ${open ? "var(--accent)" : "var(--border)"}`,
          color: from && to ? "var(--ink)" : "var(--ink-muted)",
          boxShadow: "0 1px 2px rgba(2,6,23,0.05)",
          cursor: "pointer",
        }}
      >
        <span className="flex items-center gap-2 truncate">
          <CalendarDays className="h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />
          {label}
        </span>
        {selStart && <span className="text-[10px]" style={{ color: "var(--faint)" }}>pick end date…</span>}
      </button>

      {open && (
        <div
          className="absolute left-0 z-50 mt-2 w-[280px] rounded-xl p-3"
          style={{
            top: "100%",
            background: "var(--card)",
            border: "1px solid var(--border)",
            boxShadow: "0 16px 40px rgba(2, 6, 23, 0.18)",
          }}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => canPrev && setViewMonth(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))}
              disabled={!canPrev}
              aria-label="Previous month"
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ color: canPrev ? "var(--ink-2)" : "var(--faint)", cursor: canPrev ? "pointer" : "default" }}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
              {MONTHS[viewMonth.m]} {viewMonth.y}
            </p>
            <button
              type="button"
              onClick={() => canNext && setViewMonth(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))}
              disabled={!canNext}
              aria-label="Next month"
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ color: canNext ? "var(--ink-2)" : "var(--faint)", cursor: canNext ? "pointer" : "default" }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7">
            {WEEKDAYS.map((w) => (
              <span key={w} className="py-1 text-center text-[10px] font-semibold uppercase" style={{ color: "var(--faint)" }}>
                {w}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7" onMouseLeave={() => setHover(null)}>
            {days.map((c, i) =>
              c.date === null ? (
                <span key={`e-${i}`} />
              ) : (
                <button
                  key={c.date}
                  type="button"
                  onClick={() => pick(c.date!)}
                  onMouseEnter={() => setHover(c.date!)}
                  className="mx-auto my-0.5 flex h-8 w-8 items-center justify-center text-xs font-medium transition-colors"
                  style={dayStyle(c.date!)}
                >
                  {parse(c.date!).getUTCDate()}
                </button>
              )
            )}
          </div>

          <p className="mt-2 border-t pt-2 text-[10px]" style={{ borderColor: "var(--border)", color: "var(--faint)" }}>
            Click a start date, then an end date — applied immediately. Dataset: {fmtShort(min)} – {fmtShort(max)} {parse(max).getUTCFullYear()}.
          </p>
        </div>
      )}
    </div>
  );
}
