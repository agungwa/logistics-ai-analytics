"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PERMISSION_KEYS } from "@/lib/permissions";

export interface RoleDto {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  permissions: string[];
  isSystem: boolean;
  userCount: number;
}

interface Draft {
  id?: string; // present when editing
  name: string;
  description: string;
  permissions: string[];
  isSystem?: boolean;
}

/** Role matrix editor: create custom roles, edit permission sets, delete unused ones. */
export function RolesManager({
  roles,
  currentRoleKey,
  onChanged,
  onError,
}: {
  roles: RoleDto[];
  currentRoleKey: string;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  // Roles can change while the editor is open (e.g. name edits) — keep the
  // editor's own state; it only reads `roles` for the list below.

  function togglePermission(key: string) {
    setDraft((d) =>
      d
        ? {
            ...d,
            permissions: d.permissions.includes(key) ? d.permissions.filter((p) => p !== key) : [...d.permissions, key],
          }
        : d
    );
  }

  async function save() {
    if (!draft || !draft.name.trim() || draft.permissions.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch(draft.id ? `/api/roles/${draft.id}` : "/api/roles", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim() || undefined,
          permissions: draft.permissions,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        onError(json?.error?.message ?? "Couldn't save the role.");
        return;
      }
      setDraft(null);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove(role: RoleDto) {
    if (!confirm(`Delete the role “${role.name}”?`)) return;
    const res = await fetch(`/api/roles/${role.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      onError(json?.error?.message ?? "Couldn't delete the role.");
      return;
    }
    await onChanged();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--ink-muted)]">
          A role is a set of permissions — which menus and actions its users can access. Built-in roles can be edited but not deleted.
        </p>
        <Button
          size="sm"
          className="bg-[var(--accent)] hover:bg-[var(--accent-hover)]"
          onClick={() => setDraft({ name: "", description: "", permissions: ["viewDashboard"] })}
        >
          <Plus className="mr-1 h-4 w-4" /> New role
        </Button>
      </div>

      {draft && (
        <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] p-4">
          <p className="mb-3 text-sm font-semibold text-[var(--ink)]">
            {draft.id ? `Edit “${draft.name}”` : "New role"}
            {draft.isSystem && <span className="ml-2 text-xs font-normal text-[var(--ink-muted)]">built-in role</span>}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]" htmlFor="role-name">Role name</label>
              <Input id="role-name" value={draft.name} maxLength={40} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. EU Operations" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]" htmlFor="role-desc">Description</label>
              <Input id="role-desc" value={draft.description} maxLength={120} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="What this role is for" />
            </div>
          </div>

          <p className="mb-2 mt-3 text-xs font-medium text-[var(--ink-muted)]">Permissions (menus & actions)</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PERMISSION_KEYS.map((p) => {
              const checked = draft.permissions.includes(p.key);
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => togglePermission(p.key)}
                  aria-pressed={checked}
                  className="flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors"
                  style={{
                    borderColor: checked ? "var(--accent)" : "var(--border)",
                    background: checked ? "var(--card)" : "var(--card)",
                  }}
                >
                  <span
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded"
                    style={{ background: checked ? "var(--accent)" : "transparent", border: `1.5px solid ${checked ? "var(--accent)" : "var(--border)"}` }}
                  >
                    {checked && <Check className="h-3 w-3 text-white" />}
                  </span>
                  <span>
                    <span className="block text-xs font-semibold text-[var(--ink)]">{p.label}</span>
                    <span className="block text-[11px] text-[var(--faint)]">{p.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {draft.id && roles.find((r) => r.id === draft.id)?.key === currentRoleKey && (
            <p className="mt-2 text-xs" style={{ color: "var(--warning)" }}>
              This is your own role — “Users &amp; roles” stays on to avoid locking yourself out.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="bg-[var(--accent)] hover:bg-[var(--accent-hover)]" onClick={save} disabled={busy || !draft.name.trim() || draft.permissions.length === 0}>
              {busy ? "Saving…" : draft.id ? "Save changes" : "Create role"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {roles.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3.5 shadow-sm">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                {r.name}
                {r.isSystem && (
                  <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--hover-wash)", color: "var(--ink-muted)" }}>
                    <ShieldCheck className="h-3 w-3" /> built-in
                  </span>
                )}
              </p>
              {r.description && <p className="truncate text-xs text-[var(--ink-muted)]">{r.description}</p>}
              <div className="mt-1.5 flex flex-wrap gap-1">
                {r.permissions.map((p) => {
                  const label = PERMISSION_KEYS.find((k) => k.key === p)?.label ?? p;
                  return (
                    <span key={p} className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>
            <span className="text-xs text-[var(--faint)]">{r.userCount} user{r.userCount === 1 ? "" : "s"}</span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-[var(--border)] text-xs"
                onClick={() => setDraft({ id: r.id, name: r.name, description: r.description ?? "", permissions: r.permissions, isSystem: r.isSystem })}
              >
                <Pencil className="mr-1 h-3 w-3" /> Edit
              </Button>
              {!r.isSystem && r.userCount === 0 && (
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => remove(r)} aria-label={`Delete ${r.name}`}>
                  <Trash2 className="h-3.5 w-3.5 text-[var(--risk)]" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Inline role selector for the users table. */
export function RoleInlineSelect({ value, roles, disabled, onChange }: { value: string | null; roles: RoleDto[]; disabled?: boolean; onChange: (roleId: string) => void }) {
  const current = roles.find((r) => r.id === value) ?? roles.find((r) => r.key === "viewer");
  return (
    <Select value={current?.id ?? ""} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[150px] text-xs" disabled={disabled} aria-label="Role">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map((r) => (
          <SelectItem key={r.id} value={r.id} className="text-xs">
            {r.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
