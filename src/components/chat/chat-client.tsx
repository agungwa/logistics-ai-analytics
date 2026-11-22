"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Check, Loader2, MessageSquarePlus, Send, Sparkles, Trash2, User as UserIcon, X } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartRenderer } from "@/components/charts/ChartRenderer";
import { QueryExplainability } from "@/components/ai/query-explainability";
import { AiSettingsPanel, loadAiSettings } from "@/components/ai/ai-settings";
import type { AiQueryResult } from "@/modules/ai/orchestrator.service";

const SUGGESTIONS = [
  "Show delayed orders by week for the last 3 months",
  "Which carrier has the highest delay rate?",
  "How many orders were delivered late last month?",
  "What is the on-time delivery rate by region this year?",
  "Forecast demand for the BOOK category for the next 4 months",
  "How is on-time delivery rate calculated?",
];

interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  result?: AiQueryResult | null;
}

function timeLabel(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ChatClient({ userName, canDelete }: { userName: string; canDelete: boolean }) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Array<{ text: string; state: "run" | "ok" | "err" }>>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((d) => setConversations(d.conversations ?? []))
      .catch(() => setError("Failed to load conversations."));
      setLoading(false);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, steps]);

  async function openConversation(id: string) {
    setActiveId(id);
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed to load chat.");
      setMessages(
        json.messages.map((m: { id: string; role: string; content: string; resultJson?: string | null }) => ({
          id: m.id,
          role: m.role === "user" ? "user" : "assistant",
          content: m.content,
          result: m.resultJson ? (JSON.parse(m.resultJson) as AiQueryResult) : null,
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load chat.");
    } finally {
      setLoading(false);
    }
  }

  function newChat() {
    setActiveId(null);
    setMessages([]);
    setError(null);
  }

  async function removeConversation(id: string) {
    if (!confirm("Delete this chat and its history?")) return;
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    setConversations((cs) => cs.filter((c) => c.id !== id));
    if (activeId === id) newChat();
  }

  async function ask(question: string) {
    if (!question.trim() || sending) return;
    setSending(true);
    setError(null);
    setSteps([]);
    setMessages((ms) => [...ms, { id: `tmp-u-${Date.now()}`, role: "user", content: question }]);

    const settings = loadAiSettings();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (settings?.apiKey) {
      headers["x-ai-provider"] = settings.provider;
      headers["x-ai-model"] = settings.model;
      headers["x-ai-base-url"] = settings.baseUrl;
      headers["x-ai-api-key"] = settings.apiKey;
    }

    try {
      const res = await fetch("/api/ai/query/stream", {
        method: "POST",
        headers,
        body: JSON.stringify({ question, conversationId: activeId ?? undefined }),
      });
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "The AI query failed.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let gotAnswer = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const ev = JSON.parse(part.slice(6)) as
            | { type: "status"; text: string }
            | { type: "tool_call"; tool: string; args: unknown }
            | { type: "tool_result"; tool: string; ok: boolean; detail: string }
            | { type: "answer"; conversationId: string } & AiQueryResult
            | { type: "error"; message: string };

          if (ev.type === "status") {
            setSteps((s) => [...s.filter((x) => x.state !== "run" || x.text !== ev.text), { text: ev.text, state: "run" }]);
          } else if (ev.type === "tool_call") {
            setSteps((s) => [
              ...s.map((x) => (x.state === "run" ? { ...x, state: "ok" as const } : x)),
              { text: `Calling ${ev.tool}…`, state: "run" as const },
            ]);
          } else if (ev.type === "tool_result") {
            setSteps((s) => [
              ...s.map((x) => (x.state === "run" ? { ...x, state: ev.ok ? ("ok" as const) : ("err" as const) } : x)),
              ...(ev.ok ? [] : [{ text: `${ev.tool}: ${ev.detail}`, state: "err" as const }]),
            ]);
          } else if (ev.type === "answer") {
            gotAnswer = true;
            const { conversationId, ...result } = ev;
            setMessages((ms) => [...ms, { id: `tmp-a-${Date.now()}`, role: "assistant", content: result.answer, result }]);
            setActiveId(conversationId);
          } else if (ev.type === "error") {
            throw new Error(ev.message);
          }
        }
      }
      if (!gotAnswer) throw new Error("The AI query ended without an answer.");
      const listRes = await fetch("/api/conversations");
      if (listRes.ok) setConversations((await listRes.json()).conversations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The AI query failed.");
    } finally {
      setSteps([]);
      setSending(false);
      setInput("");
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4">
      {/* Conversations sidebar */}
      <div className="hidden w-60 shrink-0 flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm md:flex">
        <Button
          onClick={newChat}
          variant="outline"
          className="mb-3 w-full justify-start gap-2 border-[var(--border)]"
        >
          <MessageSquarePlus className="h-4 w-4" /> New chat
        </Button>
        <div className="flex-1 space-y-1 overflow-y-auto">
          {conversations.length === 0 && (
            <p className="px-2 py-4 text-xs text-[var(--faint)]">No chats yet — ask your first question.</p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`group flex cursor-pointer items-center gap-1 rounded-lg px-2 py-2 text-sm transition-colors ${
                activeId === c.id ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--ink-2)] hover:bg-[var(--hover-wash)]"
              }`}
              onClick={() => openConversation(c.id)}
            >
              <span className="flex-1 truncate" title={c.title}>{c.title}</span>
              {canDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void removeConversation(c.id);
                  }}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label={`Delete chat: ${c.title}`}
                >
                  <Trash2 className="h-3.5 w-3.5 text-[var(--risk)]" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Conversation */}
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-3">
          <span className="h-2 w-2 rounded-full bg-[var(--success)]" />
          <div>
            <h1 className="text-sm font-semibold text-[var(--ink)]">AI Analyst</h1>
            <p className="text-xs text-[var(--ink-muted)]">Your data, just a question away.</p>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-6">
          {messages.length === 0 && !sending && (
            <div className="mx-auto max-w-lg py-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[#7c5cff] text-white shadow">
                <Sparkles className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-semibold text-[var(--ink)]">Ask anything about your logistics data</h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                Every number comes from validated analytics tools — the AI interprets and explains.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs text-[var(--ink-2)] shadow-sm transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading &&
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex items-end justify-end gap-2">
                <div className="max-w-[75%] rounded-2xl bg-[var(--accent-soft)] px-4 py-2.5 text-sm text-[var(--ink)]">
                  {m.content}
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)]">
                  <UserIcon className="h-4 w-4 text-[var(--ink-muted)]" />
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex items-start gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[#7c5cff] text-white">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="max-w-[85%] space-y-3">
                  <div className="chat-md rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm leading-relaxed text-[var(--ink)] shadow-sm">
                    <Markdown remarkPlugins={[remarkGfm]} components={{ table: ({ children }) => (
                      <div className="md-table-wrap"><table>{children}</table></div>
                    ) }}>
                      {m.content}
                    </Markdown>
                    {m.result?.usedNoTool && (
                      <p className="mt-2 text-xs text-[var(--warning)]">
                        No analytics tool was called — the question was outside this dataset&apos;s scope.
                      </p>
                    )}
                  </div>

                  {m.result?.analytics?.chart && (
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
                      <p className="mb-2 text-xs font-medium text-[var(--ink-muted)]">{m.result.analytics.chart.title}</p>
                      <ChartRenderer spec={m.result.analytics.chart} />
                    </div>
                  )}

                  {m.result?.forecast && m.result.forecast.eligibility.eligible && m.result?.forecastChart && (
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
                      <p className="mb-2 text-xs font-medium text-[var(--ink-muted)]">{m.result.forecastChart.title}</p>
                      <ChartRenderer spec={m.result.forecastChart} />
                      <p className="mt-2 text-xs text-[var(--ink-muted)]">
                        Plan for about <span className="font-semibold text-[var(--ink)]">{m.result.forecast.inventory?.recommendedStock} units</span>{" "}
                        — forecast demand plus a {m.result.forecast.inventory?.bufferPct}% safety margin.
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed text-[var(--faint)]">
                        How it&apos;s estimated: the average of the last 3 months, rolled forward · based on{" "}
                        {m.result.forecast.eligibility.observedMonths} months of history · recent estimates have been off
                        by about ±{m.result.forecast.evaluation?.mae ?? "…"} units a month.
                      </p>
                    </div>
                  )}

                  {m.result?.forecast && !m.result.forecast.eligibility.eligible && (
                    <Alert>
                      <AlertTitle>Not enough history to forecast</AlertTitle>
                      <AlertDescription>{m.result.forecast.eligibility.reason}</AlertDescription>
                    </Alert>
                  )}

                  {m.result && m.result.toolRuns.length > 0 && <QueryExplainability result={m.result} />}

                  {m.result?.followUps && m.result.followUps.length > 0 && !sending && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {m.result.followUps.map((q) => (
                        <button
                          key={q}
                          onClick={() => ask(q)}
                          className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] shadow-sm transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          )}

          {sending && (
            <div className="flex items-start gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[#7c5cff] text-white">
                <Bot className="h-4 w-4" />
              </div>
              <div className="min-w-[240px] rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-sm">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--ink-muted)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />
                  Working on it…
                </p>
                <ol className="space-y-1.5">
                  {steps.map((s, i) => (
                    <li key={`${i}-${s.text.slice(0, 20)}`} className="flex items-start gap-2 text-xs">
                      {s.state === "run" && <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-[var(--accent)]" />}
                      {s.state === "ok" && <Check className="mt-0.5 h-3 w-3 shrink-0 text-[var(--success)]" />}
                      {s.state === "err" && <X className="mt-0.5 h-3 w-3 shrink-0 text-[var(--risk)]" />}
                      <span className={s.state === "err" ? "text-[var(--risk)]" : "text-[var(--ink-2)]"}>{s.text}</span>
                    </li>
                  ))}
                  {steps.length === 0 && <li className="text-xs text-[var(--faint)]">Connecting…</li>}
                </ol>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="space-y-2 border-t border-[var(--border)] p-4">
          {error && <p className="text-xs text-[var(--risk)]">{error}</p>}
          <AiSettingsPanel />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about your data…"
              aria-label="Your question"
              maxLength={500}
              className="h-11 flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm text-[var(--ink)] shadow-sm placeholder:text-[var(--faint)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            />
            <Button
              type="submit"
              size="icon"
              className="h-11 w-11 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)]"
              disabled={sending || input.trim().length < 3}
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
