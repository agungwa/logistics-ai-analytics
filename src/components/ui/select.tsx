"use client";

/**
 * Custom dropdown select — deliberately NOT Radix. Renders inline (no portal)
 * with explicit token-based inline styles, so it looks identical in light and
 * dark mode with zero cascade surprises. Same component API as the previous
 * shadcn wrapper (Select/SelectTrigger/SelectValue/SelectContent/SelectItem),
 * so call sites are unchanged.
 *
 * Option labels are derived from the <SelectItem> elements at render time, so
 * the selected value always displays its human label from the very first
 * render (including SSR) — no "raw value until first open" flash.
 */

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  value: string;
  setValue: (v: string) => void;
  labelFor: (v: string) => React.ReactNode;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

function useSelect(): SelectContextValue {
  const ctx = React.useContext(SelectContext);
  if (!ctx) throw new Error("Select components must be used inside <Select>");
  return ctx;
}

/** Walk the <SelectContent><SelectItem value>label</SelectItem>… tree and collect value → label. */
function collectLabels(children: React.ReactNode): Map<string, React.ReactNode> {
  const labels = new Map<string, React.ReactNode>();
  const isType = (el: React.ReactElement, component: unknown) =>
    el.type === component || (el.type as { displayName?: string } | null)?.displayName === (component as { displayName?: string } | null)?.displayName;
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child) || !isType(child, SelectContent)) return;
    React.Children.forEach((child.props as { children?: React.ReactNode }).children, (item) => {
      if (React.isValidElement(item) && isType(item, SelectItem)) {
        const { value, children: label } = item.props as { value: string; children: React.ReactNode };
        labels.set(value, label);
      }
    });
  });
  return labels;
}

const Select = ({ value, onValueChange, children }: { value?: string; onValueChange?: (v: string) => void; children: React.ReactNode }) => {
  const [open, setOpen] = React.useState(false);
  const [internal, setInternal] = React.useState(value ?? "");
  const labels = collectLabels(children);
  const currentValue = value ?? internal;

  React.useEffect(() => {
    if (value !== undefined) setInternal(value);
  }, [value]);

  const setValue = (v: string) => {
    setInternal(v);
    onValueChange?.(v);
    setOpen(false);
  };

  const ctx: SelectContextValue = {
    open,
    setOpen,
    value: currentValue,
    setValue,
    labelFor: (v) => labels.get(v) ?? v,
  };

  return (
    <SelectContext.Provider value={ctx}>
      <div className="relative" style={{ color: "var(--ink)" }}>
        {children}
      </div>
    </SelectContext.Provider>
  );
};

const SelectTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }>(
  ({ className, children, ...props }, ref) => {
    const { open, setOpen } = useSelect();
    return (
      <button
        ref={ref}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn("flex h-10 w-full items-center justify-between gap-2 rounded-lg px-3 text-sm", className)}
        style={{
          background: "var(--card)",
          border: "1px solid " + (open ? "var(--accent)" : "var(--border)"),
          color: "var(--ink)",
          boxShadow: "0 1px 2px rgba(2,6,23,0.05)",
          cursor: "pointer",
          textAlign: "left",
        }}
        {...props}
      >
        <span className="truncate">{children}</span>
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform"
          style={{ color: "var(--ink-muted)", transform: open ? "rotate(180deg)" : undefined }}
        />
      </button>
    );
  }
);
SelectTrigger.displayName = "SelectTrigger";

const SelectValue = ({ placeholder }: { placeholder?: React.ReactNode }) => {
  const { value, labelFor } = useSelect();
  const hasValue = Boolean(value);
  return (
    <span className="truncate" style={{ color: hasValue ? "var(--ink)" : "var(--ink-muted)" }}>
      {hasValue ? labelFor(value) : placeholder}
    </span>
  );
};

const SelectContent = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  const { open, setOpen } = useSelect();
  const ref = React.useRef<HTMLDivElement>(null);
  // Flip the list upward when the trigger sits near the bottom of the viewport
  // (e.g. the last row of a table), and cap its height to the free space.
  const [dropUp, setDropUp] = React.useState(false);
  const [maxH, setMaxH] = React.useState(288);

  React.useEffect(() => {
    if (!open) return;
    const wrapper = ref.current?.parentElement; // the relative wrapper around the trigger
    if (wrapper) {
      const rect = wrapper.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const up = spaceBelow < 240 && spaceAbove > spaceBelow;
      setDropUp(up);
      setMaxH(Math.max(160, Math.min(288, up ? spaceAbove - 12 : spaceBelow - 12)));
    }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      role="listbox"
      className={cn("absolute left-0 z-50 w-full min-w-[10rem] overflow-y-auto py-1.5", className)}
      style={{
        ...(dropUp ? { bottom: "100%", marginBottom: 4 } : { top: "100%", marginTop: 4 }),
        maxHeight: maxH,
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        boxShadow: "0 16px 40px rgba(2, 6, 23, 0.18)",
      }}
    >
      {children}
    </div>
  );
};
SelectContent.displayName = "SelectContent";

const SelectItem = ({ value, children, className, disabled }: { value: string; children: React.ReactNode; className?: string; disabled?: boolean }) => {
  const { value: current, setValue } = useSelect();
  const selected = current === value;
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      disabled={disabled}
      onClick={() => setValue(value)}
      className={cn("my-select-option flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm", className)}
      style={{
        background: selected ? "var(--accent-soft)" : "transparent",
        color: selected ? "var(--accent)" : "var(--ink-2)",
        fontWeight: selected ? 600 : 400,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        width: "100%",
      }}
    >
      <span className="truncate">{children}</span>
      {selected && (
        <span aria-hidden style={{ color: "var(--accent)", fontWeight: 700 }}>
          ✓
        </span>
      )}
    </button>
  );
};
SelectItem.displayName = "SelectItem";

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
