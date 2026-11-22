"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Pencil, Trash2, UserPlus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RoleInlineSelect, RolesManager, type RoleDto } from "@/components/admin/roles-manager";

interface UserRow {
  id: string;
  email: string;
  name: string;
  roleId: string | null;
  roleName: string;
  status: "active" | "disabled";
  createdAt: string;
  invitePending: boolean;
}

export function UsersClient({ currentUserId, currentRoleKey }: { currentUserId: string; currentRoleKey: string }) {
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const [editing, setEditing] = useState<{ id: string; name: string; email: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [u, r] = await Promise.all([fetch("/api/users"), fetch("/api/roles")]);
      if (u.ok) setUsers((await u.json()).users ?? []);
      if (r.ok) {
        const roleList = ((await r.json()).roles ?? []) as RoleDto[];
        setRoles(roleList);
        setInviteRoleId((prev) => prev || roleList.find((x) => x.key === "analyst")?.id || roleList[0]?.id || "");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInviteUrl(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, name: inviteName, roleId: inviteRoleId }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(json?.error?.message ?? "Invite failed.");
      return;
    }
    setInviteUrl(json.inviteUrl);
    setEmailed(Boolean(json.emailed));
    setInviteEmail("");
    setInviteName("");
    await refresh();
  }

  async function patchUser(body: Record<string, unknown>, failureMessage: string) {
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(json?.error?.message ?? failureMessage);
      return false;
    }
    await refresh();
    return true;
  }

  async function removeUser(u: UserRow) {
    if (!confirm(`Delete ${u.name} (${u.email}) and all their chats and reports?`)) return;
    const res = await fetch(`/api/users?id=${u.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => null);
    if (!res.ok) setError(json?.error?.message ?? "Couldn't delete the user.");
    await refresh();
  }

  async function saveEditing() {
    if (!editing || !editing.name.trim() || !editing.email.trim()) return;
    setBusy(true);
    const ok = await patchUser({ id: editing.id, name: editing.name.trim(), email: editing.email.trim() }, "Couldn't update the user.");
    setBusy(false);
    if (ok) setEditing(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">Users &amp; roles</h1>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
            Invite teammates, manage what each role can access, and deactivate accounts.
          </p>
        </div>
        <div className="flex rounded-lg border border-[var(--border)] bg-[var(--card)] p-1 shadow-sm" role="tablist" aria-label="Administration">
          {(
            [
              { key: "users", label: "Users", icon: Users },
              { key: "roles", label: "Roles", icon: null },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className="flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors"
              style={{
                background: tab === t.key ? "var(--accent-soft)" : "transparent",
                color: tab === t.key ? "var(--accent)" : "var(--ink-muted)",
              }}
            >
              {t.icon && <t.icon className="h-4 w-4" />}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-[var(--risk)]">{error}</p>}

      {tab === "users" ? (
        <>
          <form onSubmit={invite} className="flex flex-wrap items-end gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]" htmlFor="invite-email">Email</label>
              <Input id="invite-email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required placeholder="teammate@company.com" />
            </div>
            <div className="min-w-[160px] flex-1">
              <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]" htmlFor="invite-name">Name</label>
              <Input id="invite-name" value={inviteName} onChange={(e) => setInviteName(e.target.value)} required placeholder="Jane Doe" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]" htmlFor="invite-role">Role</label>
              <RoleInlineSelect value={inviteRoleId || null} roles={roles} onChange={setInviteRoleId} />
            </div>
            <Button type="submit" className="bg-[var(--accent)] hover:bg-[var(--accent-hover)]">
              <UserPlus className="mr-1 h-4 w-4" /> Invite
            </Button>
          </form>

          {inviteUrl && (
            <div className="rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] p-4 text-sm">
              <p className="font-medium text-[var(--ink)]">
                {emailed ? "Invitation sent — share this link too if you like (valid 7 days):" : "Invitation created — share this link (valid 7 days):"}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg bg-[var(--card)] px-3 py-2 text-xs text-[var(--ink-2)]">{inviteUrl}</code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(inviteUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? <Check className="h-4 w-4" /> : "Copy"}
                </Button>
              </div>
              <p className="mt-2 text-xs text-[var(--ink-muted)]">The invitee sets their own password via this link — no passwords are shared by admins.</p>
            </div>
          )}

          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={4} className="text-[var(--ink-muted)]">Loading…</TableCell></TableRow>
                ) : (
                  users.map((u) => {
                    const isSelf = u.id === currentUserId;
                    return (
                      <TableRow key={u.id}>
                        <TableCell>
                          {editing?.id === u.id ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-8 w-36 text-xs" aria-label="Name" maxLength={80} />
                              <Input value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} className="h-8 w-52 text-xs" aria-label="Email" />
                              <Button size="sm" className="h-8 bg-[var(--accent)] text-xs hover:bg-[var(--accent-hover)]" onClick={saveEditing} disabled={busy}>
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditing(null)} aria-label="Cancel edit">
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <p className="font-medium text-[var(--ink)]">
                                {u.name}
                                {isSelf && <span className="ml-1.5 text-xs font-normal text-[var(--faint)]">(you)</span>}
                              </p>
                              <p className="text-xs text-[var(--ink-muted)]">{u.email}</p>
                            </>
                          )}
                        </TableCell>
                        <TableCell>
                          <RoleInlineSelect
                            value={u.roleId}
                            roles={roles}
                            disabled={isSelf}
                            onChange={(roleId) => void patchUser({ id: u.id, roleId }, "Couldn't change the role.")}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {u.status === "active" ? (
                              <Badge variant="secondary" className="bg-[var(--success-soft)] text-[var(--success)]">Active</Badge>
                            ) : (
                              <Badge variant="outline" style={{ color: "var(--ink-muted)" }}>Deactivated</Badge>
                            )}
                            {u.invitePending && <Badge variant="outline">Invite pending</Badge>}
                            {!isSelf && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => void patchUser({ id: u.id, status: u.status === "active" ? "disabled" : "active" }, "Couldn't change the status.")}
                              >
                                {u.status === "active" ? "Deactivate" : "Reactivate"}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditing({ id: u.id, name: u.name, email: u.email })} aria-label={`Edit ${u.email}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {!isSelf && (
                              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => removeUser(u)} aria-label={`Delete ${u.email}`}>
                                <Trash2 className="h-3.5 w-3.5 text-[var(--risk)]" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            <p className="border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--faint)]">
              Deactivating keeps the account and its history but blocks sign-in and all API access immediately. Deleting removes the account and its chats and reports.
            </p>
          </div>
        </>
      ) : (
        <RolesManager
          roles={roles}
          currentRoleKey={currentRoleKey}
          onChanged={refresh}
          onError={(m) => setError(m)}
        />
      )}
    </div>
  );
}
