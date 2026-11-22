"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";

const DEMO_ACCOUNTS = [
  { email: "admin@demo.com", role: "Admin — everything incl. delete chats" },
  { email: "analyst@demo.com", role: "Analyst — analytics + AI chat" },
  { email: "viewer@demo.com", role: "Viewer — Overview only" },
];

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const isInvite = Boolean(inviteToken);

  const [email, setEmail] = useState("admin@demo.com");
  const [password, setPassword] = useState("demo1234");
  const [invitePassword, setInvitePassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      if (isInvite) {
        const res = await fetch("/api/auth/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: inviteToken, password: invitePassword }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error?.message ?? "Activation failed.");
        setNotice(`Password set for ${json.email}. You can sign in now.`);
      } else {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error?.message ?? "Login failed.");
        }
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  if (isInvite) {
    return (
      <div className="relative flex min-h-screen items-center justify-center p-6">
        <div className="absolute right-4 top-4"><ThemeToggle /></div>
        <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[#7c5cff] text-white shadow">
              <Sparkles className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-semibold text-[var(--ink)]">Set your password</h1>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">You were invited to Logistics AI Analytics.</p>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label htmlFor="invite-password" className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">New password (min 8 chars)</label>
              <Input id="invite-password" type="password" value={invitePassword} onChange={(e) => setInvitePassword(e.target.value)} required minLength={8} />
            </div>
            {error && <p className="text-sm text-[var(--risk)]">{error}</p>}
            {notice && (
              <>
                <p className="text-sm text-[var(--success)]">{notice}</p>
                <Button type="button" className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)]" onClick={() => router.push("/login")}>
                  Go to sign in
                </Button>
              </>
            )}
            {!notice && (
              <Button type="submit" className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)]" disabled={loading}>
                {loading ? "Activating…" : "Activate account"}
              </Button>
            )}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center p-6">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[#7c5cff] text-white shadow">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold text-[var(--ink)]">Logistics AI Analytics</h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">Your data, just a question away.</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Email</label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Password</label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          {error && <p className="text-sm text-[var(--risk)]">{error}</p>}
          <Button type="submit" className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)]" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--content)] p-3 text-xs text-[var(--ink-muted)]">
          <p className="mb-1 font-medium text-[var(--ink-2)]">Demo accounts (password: demo1234)</p>
          {DEMO_ACCOUNTS.map((a) => (
            <button
              key={a.email}
              type="button"
              onClick={() => {
                setEmail(a.email);
                setPassword("demo1234");
              }}
              className="block w-full truncate rounded px-1 py-0.5 text-left hover:text-[var(--accent)]"
            >
              <span className="font-medium">{a.email}</span> — {a.role}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
