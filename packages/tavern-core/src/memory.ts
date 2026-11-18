/**
 * Deterministic long-term memory selection.
 *
 * Memories are user-owned facts, events and summaries. Retrieval here is a
 * pure lexical scorer, not an embedding model: the same query and inputs must
 * always produce the same selection so prompt previews stay reproducible and
 * the user can see exactly why a memory was injected.
 */

export type MemoryKind = "manual_fact" | "event" | "summary" | "relationship" | "retrieval_hit";

export interface MemoryItem {
  readonly id: string;
  readonly kind: MemoryKind;
  readonly content: string;
  readonly conversationId: string | null;
  readonly scope: string;
  readonly locked: boolean;
  /** ISO timestamp; used only as a deterministic tiebreak. */
  readonly updatedAt: string;
}

export interface MemorySelectionLimits {
  readonly maxItems: number;
  readonly maxBytes: number;
  readonly maxTokens: number;
}

export interface MemorySelectionOptions {
  readonly query: string;
  readonly conversationId: string | null;
  readonly limits: MemorySelectionLimits;
  readonly estimateTokens?: (text: string) => number;
}

export interface SelectedMemory {
  readonly item: MemoryItem;
  readonly score: number;
  readonly matchedTerms: readonly string[];
  readonly reason: "locked" | "keyword" | "recent";
  readonly estimatedTokens: number;
}

export interface SkippedMemory {
  readonly id: string;
  readonly reason: "empty" | "budget" | "no-match" | "other-conversation";
}

export interface MemorySelectionResult {
  readonly selected: readonly SelectedMemory[];
  readonly skipped: readonly SkippedMemory[];
  readonly totalEstimatedTokens: number;
  readonly totalBytes: number;
}

const KIND_PRIORITY: Record<MemoryKind, number> = {
  manual_fact: 4,
  relationship: 3,
  summary: 2,
  event: 1,
  retrieval_hit: 0,
};

const STOP_TERMS = new Set(["the", "and", "for", "with", "that", "this", "are", "was", "you"]);

// CJK function characters would otherwise match almost every sentence when a
// query falls back to single-character terms.
const CJK_STOP_CHARS = new Set([
  "的",
  "了",
  "是",
  "在",
  "和",
  "也",
  "就",
  "都",
  "而",
  "及",
  "与",
  "着",
  "过",
  "把",
  "被",
  "让",
  "给",
  "对",
  "从",
  "向",
  "于",
  "有",
  "这",
  "那",
  "个",
  "我",
  "你",
  "他",
  "她",
  "它",
  "们",
]);

/** ASCII words plus CJK character bigrams; deterministic and language-agnostic. */
export function memoryTerms(text: string): string[] {
  const lower = text.toLowerCase();
  const terms: string[] = [];
  for (const match of lower.matchAll(/[a-z0-9_]{2,}/g)) {
    const word = match[0];
    if (!STOP_TERMS.has(word)) {
      terms.push(word);
    }
  }
  const cjk = lower.match(/[㐀-鿿]+/g) ?? [];
  for (const run of cjk) {
    // Single characters keep short queries ("雨") useful; bigrams add phrase
    // precision. Both are deterministic.
    for (const character of run) {
      if (!CJK_STOP_CHARS.has(character)) {
        terms.push(character);
      }
    }
    for (let index = 0; index < run.length - 1; index += 1) {
      terms.push(run.slice(index, index + 2));
    }
  }
  return [...new Set(terms)];
}

function estimateBytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

function defaultEstimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

export function selectMemories(
  items: readonly MemoryItem[],
  options: MemorySelectionOptions,
): MemorySelectionResult {
  const estimate = options.estimateTokens ?? defaultEstimateTokens;
  const queryTerms = new Set(memoryTerms(options.query));
  const skipped: SkippedMemory[] = [];
  const candidates: {
    item: MemoryItem;
    score: number;
    matchedTerms: string[];
    reason: SelectedMemory["reason"];
    estimatedTokens: number;
  }[] = [];

  for (const item of items) {
    if (item.content.trim().length === 0) {
      skipped.push({ id: item.id, reason: "empty" });
      continue;
    }
    if (
      item.conversationId !== null &&
      options.conversationId !== null &&
      item.conversationId !== options.conversationId
    ) {
      skipped.push({ id: item.id, reason: "other-conversation" });
      continue;
    }
    const matchedTerms = memoryTerms(item.content).filter((term) => queryTerms.has(term));
    if (item.locked) {
      candidates.push({
        item,
        score: matchedTerms.length + 1_000,
        matchedTerms,
        reason: "locked",
        estimatedTokens: estimate(item.content),
      });
      continue;
    }
    if (matchedTerms.length === 0) {
      // Global facts still work as backstory even without a lexical hit, but
      // they rank last so a match always wins.
      if (item.scope === "global") {
        candidates.push({
          item,
          score: 0,
          matchedTerms,
          reason: "recent",
          estimatedTokens: estimate(item.content),
        });
      } else {
        skipped.push({ id: item.id, reason: "no-match" });
      }
      continue;
    }
    candidates.push({
      item,
      score: matchedTerms.length,
      matchedTerms,
      reason: "keyword",
      estimatedTokens: estimate(item.content),
    });
  }

  candidates.sort(
    (left, right) =>
      right.score - left.score ||
      KIND_PRIORITY[right.item.kind] - KIND_PRIORITY[left.item.kind] ||
      right.item.updatedAt.localeCompare(left.item.updatedAt) ||
      left.item.id.localeCompare(right.item.id),
  );

  const selected: SelectedMemory[] = [];
  let totalBytes = 0;
  let totalEstimatedTokens = 0;
  for (const candidate of candidates) {
    if (selected.length >= options.limits.maxItems) {
      skipped.push({ id: candidate.item.id, reason: "budget" });
      continue;
    }
    const bytes = estimateBytes(candidate.item.content);
    if (
      totalBytes + bytes > options.limits.maxBytes ||
      totalEstimatedTokens + candidate.estimatedTokens > options.limits.maxTokens
    ) {
      skipped.push({ id: candidate.item.id, reason: "budget" });
      continue;
    }
    totalBytes += bytes;
    totalEstimatedTokens += candidate.estimatedTokens;
    selected.push({
      item: candidate.item,
      score: candidate.score,
      matchedTerms: candidate.matchedTerms,
      reason: candidate.reason,
      estimatedTokens: candidate.estimatedTokens,
    });
  }

  return { selected, skipped, totalEstimatedTokens, totalBytes };
}
