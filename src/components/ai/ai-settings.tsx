"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Optional AI provider settings, stored in the browser's localStorage and sent
 * per-request as headers. When unset, the app uses the server's env default
 * (GLM via z.ai). The API key is never displayed back in full — only a masked
 * preview — and is never persisted server-side.
 */

export interface AiSettings {
  provider: "openai_compatible" | "anthropic";
  model: string;
  baseUrl: string;
  apiKey: string;
}

const STORAGE_KEY = "ai-settings";

const PROVIDER_PRESETS: Record<AiSettings["provider"], { label: string; baseUrl: string; models: string[] }> = {
  openai_compatible: { label: "OpenAI-compatible", baseUrl: "https://api.z.ai/api/paas/v4", models: ["glm-4.6", "glm-4.5-air", "gpt-4o-mini", "gpt-4o"] },
  anthropic: { label: "Anthropic-compatible", baseUrl: "https://api.z.ai/api/anthropic", models: ["glm-4.6", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"] },
};

const CUSTOM = "__custom__";

export function loadAiSettings(): AiSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AiSettings;
    if (s.provider !== "openai_compatible" && s.provider !== "anthropic") return null;
    return { provider: s.provider, model: s.model ?? "", baseUrl: s.baseUrl ?? "", apiKey: s.apiKey ?? "" };
  } catch {
    return null;
  }
}

function maskKey(key: string): string {
  if (!key) return "";
  return `••••${key.slice(-4)}`;
}

export function AiSettingsPanel() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [draft, setDraft] = useState<AiSettings>({
    provider: "openai_compatible",
    model: "glm-4.6",
    baseUrl: PROVIDER_PRESETS.openai_compatible.baseUrl,
    apiKey: "",
  });
  const [customModel, setCustomModel] = useState(false);

  useEffect(() => {
    const s = loadAiSettings();
    setSettings(s);
    if (s) {
      setDraft(s);
      setCustomModel(!PROVIDER_PRESETS[s.provider].models.includes(s.model));
    }
  }, []);

  function switchProvider(p: AiSettings["provider"]) {
    setDraft((d) => ({
      ...d,
      provider: p,
      baseUrl: PROVIDER_PRESETS[p].baseUrl,
      model: PROVIDER_PRESETS[p].models[0],
    }));
    setCustomModel(false);
  }

  function save() {
    if (draft.apiKey && draft.apiKey.length < 8) return; // obviously invalid; don't persist
    if (!draft.apiKey) {
      localStorage.removeItem(STORAGE_KEY);
      setSettings(null);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      setSettings(draft);
    }
    setOpen(false);
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[var(--ink-muted)]">
          AI provider:{" "}
          <span className="font-medium text-[var(--ink)]">
            {settings ? `${PROVIDER_PRESETS[settings.provider].label} · ${settings.model}` : "Server default (GLM via z.ai)"}
          </span>
          {settings?.apiKey ? ` · key ${maskKey(settings.apiKey)}` : ""}
        </p>
        <Button variant="outline" size="sm" className="h-7 border-[var(--border)] text-xs" onClick={() => setOpen(!open)}>
          {open ? "Close" : "Change provider"}
        </Button>
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t border-[var(--border)] pt-4">
          {/* Provider: segmented control */}
          <div>
            <p className="mb-1.5 font-medium text-[var(--ink-2)]">Provider protocol</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Provider protocol">
              {(Object.keys(PROVIDER_PRESETS) as Array<keyof typeof PROVIDER_PRESETS>).map((p) => (
                <button
                  key={p}
                  type="button"
              role="radio"
                  aria-checked={draft.provider === p}
                  onClick={() => switchProvider(p)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    draft.provider === p
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]"
                      : "border-[var(--border)] bg-[var(--card)] text-[var(--ink-muted)] hover:border-[var(--accent)]/50 hover:text-[var(--ink)]"
                  }`}
                >
                  <span className="block text-xs font-semibold">{PROVIDER_PRESETS[p].label}</span>
                  <span className="mt-0.5 block text-[10px] opacity-70">GLM · OpenAI{p === "anthropic" ? " · Claude" : ""}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Model: dropdown per provider + custom escape hatch */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-medium text-[var(--ink-2)]" htmlFor="ai-model">Model</label>
              {customModel ? (
                <Input
                  id="ai-model"
                  value={draft.model}
                  onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
                  placeholder="your-model-id"
                  className="h-9 text-xs"
                />
              ) : (
                <Select
                  value={draft.model}
                  onValueChange={(v) => {
                    if (v === CUSTOM) {
                      setCustomModel(true);
                      setDraft((d) => ({ ...d, model: "" }));
                    } else {
                      setDraft((d) => ({ ...d, model: v }));
                    }
                  }}
                >
                  <SelectTrigger id="ai-model" className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROVIDER_PRESETS[draft.provider].models.map((m) => (
                      <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                    ))}
                    <SelectItem value={CUSTOM} className="text-xs">Custom model ID…</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <label className="mb-1 block font-medium text-[var(--ink-2)]" htmlFor="ai-base">Base URL</label>
              <Input
                id="ai-base"
                value={draft.baseUrl}
                onChange={(e) => setDraft((d) => ({ ...d, baseUrl: e.target.value }))}
                className="h-9 text-xs"
                placeholder={PROVIDER_PRESETS[draft.provider].baseUrl}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block font-medium text-[var(--ink-2)]" htmlFor="ai-key">API key (stays in your browser)</label>
              <Input
                id="ai-key"
                type="password"
                value={draft.apiKey}
                onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
                className="h-9 text-xs"
                placeholder="paste key — or leave empty for the server default"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="h-8 bg-[var(--accent)] text-xs hover:bg-[var(--accent-hover)]" onClick={save}>Save</Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => {
                localStorage.removeItem(STORAGE_KEY);
                setSettings(null);
                setCustomModel(false);
                setDraft({ provider: "openai_compatible", model: "glm-4.6", baseUrl: PROVIDER_PRESETS.openai_compatible.baseUrl, apiKey: "" });
                setOpen(false);
              }}
            >
              Use server default
            </Button>
            <span className="text-[10px] text-[var(--faint)]">
              Sent only with your own requests; the key is masked above and never stored on the server.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
