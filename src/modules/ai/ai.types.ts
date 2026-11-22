/**
 * Provider-agnostic AI orchestration types. Providers translate these into
 * their own wire formats; the orchestrator and tools never see vendor types.
 */

export interface WireTool {
  name: string;
  description: string;
  /** JSON Schema for the tool's input object. */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

/** Conversation turns in our neutral shape. */
export type TurnMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls: ToolCall[] }
  | { role: "tool_results"; results: Array<{ call: ToolCall; content: string; isError: boolean }> };

export interface ProviderTurn {
  stop: "end" | "tool_use";
  text: string;
  toolCalls: ToolCall[];
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  runTurn(params: { system: string; messages: TurnMessage[]; tools: WireTool[] }): Promise<ProviderTurn>;
}

export class AiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiProviderError";
  }
}
