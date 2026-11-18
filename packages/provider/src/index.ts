/**
 * Model provider port. DeepSeek is the only production provider in V1.
 *
 * M0 status: no network calls, no key handling. The adapter and capability
 * tests arrive in M3. The server enforces `safety_check: high`; clients cannot
 * override it.
 */

export type ModelId = "deepseek-flash" | "deepseek-v4-pro";

export interface ModelCapabilities {
  readonly modelId: ModelId;
  readonly contextWindowTokens: number;
  readonly maxOutputTokens: number;
  readonly streaming: boolean;
  readonly usageInFinalChunk: boolean;
  readonly safetyCheckField: string;
  readonly tariffVersion: string;
}

export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface ChatRequest {
  readonly runId: string;
  readonly modelId: ModelId;
  readonly messages: readonly ChatMessage[];
  readonly maxOutputTokens: number;
  readonly clientRequestId: string;
}

export interface Usage {
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens?: number;
}

export type StreamEvent =
  | { readonly type: "started"; readonly providerRequestId?: string }
  | { readonly type: "delta"; readonly text: string }
  | { readonly type: "usage"; readonly usage: Usage }
  | { readonly type: "finished"; readonly finishReason: string };

export interface ModelProvider {
  readonly modelId: ModelId;
  capabilities(): ModelCapabilities;
  streamChat(request: ChatRequest, signal: AbortSignal): AsyncIterable<StreamEvent>;
}

export class ProviderNotConfiguredError extends Error {
  constructor() {
    super("Model provider is not configured in M0; no model call was attempted.");
    this.name = "ProviderNotConfiguredError";
  }
}
