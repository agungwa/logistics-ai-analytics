import type { NextRequest } from "next/server";
import type { AiConfig } from "@/lib/env";

/**
 * Per-request AI provider overrides sent by the dashboard settings panel.
 * Values are length-capped and validated; a key supplied this way is used for
 * this request only — never persisted, logged, or returned.
 */

const ALLOWED_PROVIDERS = new Set(["anthropic", "openai_compatible"]);

export function readAiOverrideHeaders(req: NextRequest): Partial<AiConfig> {
  const h = (name: string) => req.headers.get(name)?.slice(0, 300) ?? undefined;
  const provider = h("x-ai-provider");
  const model = h("x-ai-model");
  const apiKey = h("x-ai-api-key");
  const baseUrl = h("x-ai-base-url");
  const override: Partial<AiConfig> = {};
  if (provider && ALLOWED_PROVIDERS.has(provider)) override.provider = provider;
  if (model) override.model = model;
  if (apiKey) override.apiKey = apiKey;
  if (baseUrl && /^https:\/\//.test(baseUrl)) override.baseUrl = baseUrl;
  return override;
}
