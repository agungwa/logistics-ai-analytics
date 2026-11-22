import type { AiProvider, ProviderTurn, TurnMessage, WireTool } from "../ai.types";
import { AiProviderError } from "../ai.types";

/**
 * OpenAI-compatible chat-completions adapter. Covers OpenAI and any
 * compatible endpoint (e.g. GLM via z.ai: set AI_BASE_URL). Plain fetch —
 * no vendor SDK dependency.
 */
export class OpenAiCompatibleProvider implements AiProvider {
  readonly name: string;

  constructor(
    readonly model: string,
    private apiKey: string,
    private baseUrl: string, // e.g. https://api.openai.com/v1 or https://api.z.ai/api/paas/v4
  ) {
    this.name = "openai_compatible";
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private fetchWithRetry = fetchWithRetryImpl;

  async runTurn(params: { system: string; messages: TurnMessage[]; tools: WireTool[] }): Promise<ProviderTurn> {
    const body = {
      model: this.model,
      max_tokens: 4096,
      messages: [
        { role: "system", content: params.system },
        ...params.messages.flatMap(toOpenAiMessages),
      ],
      tools: params.tools.map((t) => ({
        type: "function" as const,
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
    };

    const res = await this.fetchWithRetry(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new AiProviderError(`AI provider returned ${res.status}: ${detail.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{
        finish_reason?: string;
        message?: { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> };
      }>;
    };
    const choice = json.choices?.[0];
    const text = choice?.message?.content ?? "";
    const toolCalls = (choice?.message?.tool_calls ?? []).map((c) => ({
      id: c.id,
      name: c.function.name,
      arguments: safeParse(c.function.arguments),
    }));
    return {
      stop: (choice?.finish_reason === "tool_calls" ? "tool_use" : "end") as ProviderTurn["stop"],
      text,
      toolCalls,
    };
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return { __unparsable__: s };
  }
}

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;

/** Retry on 429/5xx/network errors with backoff, honoring Retry-After when sent. */
export async function fetchWithRetryImpl(
  url: string,
  init: RequestInit,
  maxRetries = MAX_RETRIES
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (e) {
      lastError = e;
      if (attempt === maxRetries) {
        throw new AiProviderError(`AI provider request failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      await sleep(2 ** attempt * 1000);
      continue;
    }
    if (!RETRYABLE_STATUS.has(res.status) || attempt === maxRetries) return res;
    const retryAfter = Number(res.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000;
    await sleep(Math.min(delay, 8_000));
  }
  throw new AiProviderError(`AI provider request failed: ${lastError instanceof Error ? lastError.message : "unknown"}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** One neutral turn may map to several wire messages (OpenAI: one role:"tool" per result). */
function toOpenAiMessages(msg: TurnMessage): Array<Record<string, unknown>> {
  switch (msg.role) {
    case "user":
      return [{ role: "user", content: msg.text }];
    case "assistant":
      return [
        {
          role: "assistant",
          content: msg.text || null,
          ...(msg.toolCalls.length > 0
            ? {
                tool_calls: msg.toolCalls.map((c) => ({
                  id: c.id,
                  type: "function",
                  function: { name: c.name, arguments: JSON.stringify(c.arguments ?? {}) },
                })),
              }
            : {}),
        },
      ];
    case "tool_results":
      return msg.results.map((r) => ({
        role: "tool",
        tool_call_id: r.call.id,
        content: r.content,
      }));
  }
}
