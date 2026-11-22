import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider, ProviderTurn, TurnMessage, WireTool } from "../ai.types";
import { AiProviderError } from "../ai.types";

/**
 * Anthropic Claude adapter (default provider). Tool calling via the Messages
 * API; `tool_choice: auto` — forced tool use is not supported on current models.
 * Omitting `thinking` runs adaptive thinking (always-on on current models).
 */
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(
    readonly model: string,
    apiKey: string,
    baseUrl?: string, // e.g. GLM's Anthropic-compatible endpoint https://api.z.ai/api/anthropic
  ) {
    // SDK retries 429/5xx/connection errors automatically; 3 covers provider
    // rate-limit bursts (limits differ per provider/model).
    this.client = new Anthropic(baseUrl ? { apiKey, baseURL: baseUrl, maxRetries: 3 } : { apiKey, maxRetries: 3 });
  }

  async runTurn(params: { system: string; messages: TurnMessage[]; tools: WireTool[] }): Promise<ProviderTurn> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: params.system,
        messages: params.messages.map(toAnthropicMessage),
        tools: params.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters as Anthropic.Tool.InputSchema,
        })),
        tool_choice: { type: "auto" },
      });
    } catch (e) {
      throw new AiProviderError(`Anthropic API call failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    let text = "";
    const toolCalls: Array<{ id: string; name: string; arguments: unknown }> = [];
    for (const block of response.content) {
      if (block.type === "text") text += block.text;
      if (block.type === "tool_use") {
        toolCalls.push({ id: block.id, name: block.name, arguments: block.input });
      }
    }
    return {
      stop: response.stop_reason === "tool_use" ? "tool_use" : "end",
      text,
      toolCalls,
    };
  }
}

type AnthropicMessage = Anthropic.MessageParam;

function toAnthropicMessage(msg: TurnMessage): AnthropicMessage {
  switch (msg.role) {
    case "user":
      return { role: "user", content: msg.text };
    case "assistant": {
      const content: Anthropic.ContentBlockParam[] = [];
      if (msg.text) content.push({ type: "text", text: msg.text });
      for (const call of msg.toolCalls) {
        content.push({ type: "tool_use", id: call.id, name: call.name, input: msg.toolCalls && call.arguments as Record<string, unknown> });
      }
      return { role: "assistant", content };
    }
    case "tool_results":
      return {
        role: "user",
        content: msg.results.map((r) => ({
          type: "tool_result" as const,
          tool_use_id: r.call.id,
          content: r.content,
          is_error: r.isError,
        })),
      };
  }
}
