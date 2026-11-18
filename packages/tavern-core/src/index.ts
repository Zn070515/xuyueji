/**
 * Shared pure tavern kernel (world info, presets, macros, branches).
 *
 * M0 status: interfaces only. The deterministic world-info matcher, macro
 * interpreter and prompt budget planner land in M2. Nothing here executes
 * third-party JavaScript.
 */

export type WorldInfoPosition =
  | "before_char"
  | "after_char"
  | "before_examples"
  | "after_examples"
  | "at_depth";

export interface WorldInfoEntry {
  readonly id: string;
  readonly bookId: string;
  readonly content: string;
  readonly enabled: boolean;
  readonly constant: boolean;
  /** Keyword matching (default) or a bounded regex from the safe subset. */
  readonly matchMode?: "keyword" | "regex";
  readonly regexPattern?: string;
  readonly regexFlags?: string;
  readonly keys: readonly string[];
  readonly secondaryKeys: readonly string[];
  readonly caseSensitive: boolean;
  readonly probability: number;
  readonly insertionOrder: number;
  readonly position: WorldInfoPosition;
  readonly depth: number;
  readonly scanDepth: number;
  readonly recursive: boolean;
}

export interface WorldInfoScope {
  readonly globalBookIds: readonly string[];
  readonly characterBookIds: readonly string[];
  readonly conversationBookIds: readonly string[];
}

export * from "./memory.js";
export * from "./safe-regex.js";
export * from "./world-info.js";

export const TAVERN_CORE_STATUS = {
  gate: "M2",
  implemented: [
    "domain-types",
    "world-info-triggering",
    "bounded-regex-engine",
    "memory-retrieval",
  ],
  planned: [
    "recursive-activation-limits",
    "preset-ordering",
    "macro-whitelist-interpreter",
    "quick-reply-registry",
  ],
} as const;
