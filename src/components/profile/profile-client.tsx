"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, KeyRound, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function ProfileClient({ name, email, role }: { name: string; email: string; role: string }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(name);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savedName, setSavedName] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function saveName() {
    setBusy(true);
    setSavedName(false);
    const res = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: displayName }),
    });
    if (res.ok) {
      setSavedName(true);
      router.refresh();
      setTimeout(() => setSavedName(false), 2000);
    }
    setBusy(false);
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setPwError(null);
    setPwOk(false);
    const res = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setPwError(json?.error?.message ?? "Password change failed.");
    } else {
      setPwOk(true);
      setCurrentPassword("");
      setNewPassword("");
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">Profile</h1>
        <p className="mt-0.5 text-sm text-[var(--ink-muted)]">Your account settings.</p>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-soft)] text-lg font-semibold text-[var(--accent)]">
            {name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-[var(--ink)]">{name}</p>
            <p className="text-xs text-[var(--ink-muted)]">{email}</p>
          </div>
          <Badge variant="secondary" className="ml-auto capitalize">{role}</Badge>
        </div>

        <div className="border-t border-[var(--border)] pt-4">
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[var(--ink-muted)]" htmlFor="display-name">
            <UserRound className="h-3.5 w-3.5" /> Display name
          </label>
          <div className="flex gap-2">
            <Input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} />
            <Button onClick={saveName} disabled={busy || !displayName.trim() || displayName === name} className="bg-[var(--accent)] hover:bg-[var(--accent-hover)]">
              {savedName ? <Check className="h-4 w-4" /> : "Save"}
            </Button>
          </div>
          {savedName && <p className="mt-1.5 text-xs text-[var(--success)]">Saved.</p>}
        </div>
      </div>

      <form onSubmit={savePassword} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <p className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-[var(--ink)]">
          <KeyRound className="h-4 w-4 text-[var(--accent)]" /> Change password
        </p>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]" htmlFor="current-pw">Current password</label>
            <Input id="current-pw" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]" htmlFor="new-pw">New password (min 8 chars)</label>
            <Input id="new-pw" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          </div>
          {pwError && <p className="text-sm text-[var(--risk)]">{pwError}</p>}
          {pwOk && <p className="text-sm text-[var(--success)]">Password updated.</p>}
          <Button type="submit" disabled={busy} className="bg-[var(--accent)] hover:bg-[var(--accent-hover)]">
            Update password
          </Button>
        </div>
      </form>
    </div>
  );
}
