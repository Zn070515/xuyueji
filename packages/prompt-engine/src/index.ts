/**
 * Deterministic prompt compiler.
 *
 * M0 status: the provenance/budget vocabulary is defined here so the UI and
 * API can agree on the shape. Compilation is intentionally not implemented
 * until M2. Generation must never call a model before this compiler exists and
 * the server has re-compiled from authoritative entity versions.
 */

export type PromptComponentKind =
  | "platform_policy"
  | "preset_system"
  | "character"
  | "persona"
  | "world_info"
  | "memory"
  | "examples"
  | "history"
  | "author_note"
  | "user_input"
  | "closing_constraints";

export interface PromptComponent {
  readonly kind: PromptComponentKind;
  readonly sourceId: string;
  readonly content: string;
  readonly estimatedTokens: number;
  readonly mandatory: boolean;
  readonly priority: number;
  readonly included: boolean;
  readonly reason?: string;
}

export interface PromptPlan {
  readonly digest: string;
  readonly components: readonly PromptComponent[];
  readonly estimatedInputTokens: number;
  readonly reservedOutputTokens: number;
  readonly warnings: readonly string[];
}

export class PromptEngineNotImplementedError extends Error {
  constructor() {
    super("Prompt compilation is planned for Gate M2; model calls are disabled in M0.");
    this.name = "PromptEngineNotImplementedError";
  }
}

export function compilePrompt(): never {
  throw new PromptEngineNotImplementedError();
}
