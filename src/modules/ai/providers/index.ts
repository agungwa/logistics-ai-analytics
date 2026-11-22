import { getAiConfig, type AiConfig } from "@/lib/env";
import type { AiProvider } from "../ai.types";
import { AnthropicProvider } from "./anthropic.provider";
import { OpenAiCompatibleProvider } from "./openai-compatible.provider";

/** Selects the concrete provider from env config (optionally overridden per request). */
export function createProvider(override?: Partial<AiConfig>): AiProvider {
  const cfg = getAiConfig(override);
  switch (cfg.provider) {
    case "anthropic":
      return new AnthropicProvider(cfg.model, cfg.apiKey, cfg.baseUrl);
    case "openai_compatible":
      return new OpenAiCompatibleProvider(
        cfg.model,
        cfg.apiKey,
        cfg.baseUrl ?? "https://api.openai.com/v1"
      );
    default:
      throw new Error(`Unsupported AI provider '${cfg.provider}'. Use 'anthropic' or 'openai_compatible'.`);
  }
}
