import { DomainError } from "./errors.js";

/**
 * Lifecycle from BILLING_GENERATION.md. M0 only defines the vocabulary and
 * transition guard; the API and provider adapter arrive in M3.
 */
export const GENERATION_STATES = [
  "created",
  "reserved",
  "queued",
  "streaming",
  "finalizing",
  "completed",
  "rejected",
  "cancelled",
  "failed",
  "unknown_usage",
  "aborted",
] as const;

export type GenerationState = (typeof GENERATION_STATES)[number];

export const TERMINAL_GENERATION_STATES: ReadonlySet<GenerationState> = new Set([
  "completed",
  "rejected",
  "cancelled",
  "failed",
  "unknown_usage",
  "aborted",
]);

const TRANSITIONS: Readonly<Record<GenerationState, readonly GenerationState[]>> = {
  created: ["reserved", "aborted"],
  reserved: ["queued", "aborted"],
  queued: ["streaming", "aborted", "failed"],
  streaming: ["finalizing", "cancelled", "failed", "unknown_usage"],
  finalizing: ["completed", "rejected", "failed", "unknown_usage"],
  completed: [],
  rejected: [],
  cancelled: [],
  failed: [],
  unknown_usage: [],
  aborted: [],
};

export function canTransitionGeneration(from: GenerationState, to: GenerationState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertGenerationTransition(from: GenerationState, to: GenerationState): void {
  if (!canTransitionGeneration(from, to)) {
    throw new DomainError(
      "INVALID_STATE_TRANSITION",
      `Generation run cannot transition from ${from} to ${to}.`,
      { from, to },
    );
  }
}
