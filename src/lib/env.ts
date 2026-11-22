/**
 * Startup environment validation. Fails fast with a clear message instead of
 * leaking confusing provider/db errors later. Never logs secret values.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

export function getDatabaseUrl(): string {
  return requireEnv("DATABASE_URL");
}

export interface AiConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

/**
 * AI provider config: env defaults, overridable per-request from the dashboard
 * settings panel (headers). Request-supplied keys are used only for that
 * request — never persisted or logged.
 */
export function getAiConfig(override?: Partial<AiConfig>): AiConfig {
  const provider = override?.provider?.trim() || process.env.AI_PROVIDER || "openai_compatible";
  const model = override?.model?.trim() || requireEnv("AI_MODEL");
  const apiKey = override?.apiKey?.trim() || requireEnv("AI_API_KEY");
  const baseUrl =
    override?.baseUrl?.trim() ||
    process.env.AI_BASE_URL ||
    (provider === "anthropic" ? process.env.ANTHROPIC_BASE_URL : undefined) ||
    undefined;
  return { provider, model, apiKey, baseUrl };
}
