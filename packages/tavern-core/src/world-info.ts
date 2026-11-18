import type { WorldInfoEntry } from "./index.js";

export interface WorldInfoContext {
  /** Oldest → newest message text. */
  readonly scanTexts: readonly string[];
  readonly userInput: string;
  /** Fixed seed makes probability rolls reproducible. */
  readonly seed: number;
}

export interface WorldInfoLimits {
  readonly maxDepth: number;
  readonly maxEntries: number;
  readonly maxBytes: number;
  readonly maxTokens: number;
}

export interface WorldInfoDependencies {
  readonly estimateTokens: (text: string) => number;
}

export interface ActivatedWorldInfo {
  readonly entry: WorldInfoEntry;
  readonly depth: number;
  readonly reason: "constant" | "keyword" | "recursive";
  readonly matchedKeys: readonly string[];
  readonly estimatedTokens: number;
}

export interface SkippedWorldInfo {
  readonly entryId: string;
  readonly reason:
    | "disabled"
    | "no-keyword"
    | "probability"
    | "already-activated"
    | "budget"
    | "depth-limit";
}

export interface WorldInfoTraceStep {
  readonly entryId: string;
  readonly depth: number;
  readonly outcome: "activated" | "skipped";
  readonly reason: string;
}

export interface WorldInfoMatchResult {
  readonly activated: readonly ActivatedWorldInfo[];
  readonly skipped: readonly SkippedWorldInfo[];
  readonly warnings: readonly string[];
  readonly trace: readonly WorldInfoTraceStep[];
  readonly totalBytes: number;
  readonly totalEstimatedTokens: number;
}

export function heuristicTokenEstimate(text: string): number {
  // Mixed CJK/Latin heuristic; callers must inject the real tokenizer at the
  // model boundary. This is only for budget previews and ranking.
  return Math.ceil(text.length / 3);
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function normalize(value: string, caseSensitive: boolean): string {
  return caseSensitive ? value : value.toLowerCase();
}

function isAsciiWord(character: string): boolean {
  return /[A-Za-z0-9_]/.test(character);
}

function textContainsKey(text: string, key: string, caseSensitive: boolean): boolean {
  const needle = normalize(key, caseSensitive);
  if (needle.length === 0) {
    return false;
  }
  const haystack = normalize(text, caseSensitive);

  let from = 0;
  while (from <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, from);
    if (index < 0) {
      return false;
    }
    const before = index === 0 ? "" : (haystack[index - 1] ?? "");
    const after = haystack[index + needle.length] ?? "";
    const startsWord = isAsciiWord(needle[0] ?? "");
    const endsWord = isAsciiWord(needle[needle.length - 1] ?? "");
    const leftBoundary = !startsWord || before === "" || !isAsciiWord(before);
    const rightBoundary = !endsWord || after === "" || !isAsciiWord(after);
    if (leftBoundary && rightBoundary) {
      return true;
    }
    from = index + 1;
  }
  return false;
}

function matchEntry(entry: WorldInfoEntry, texts: readonly string[]): string[] {
  const matched: string[] = [];
  const primaryMatches = entry.keys.filter((key) =>
    texts.some((text) => textContainsKey(text, key, entry.caseSensitive)),
  );
  if (primaryMatches.length === 0) {
    return [];
  }
  matched.push(...primaryMatches);

  if (entry.secondaryKeys.length > 0) {
    const secondaryMatches = entry.secondaryKeys.filter((key) =>
      texts.some((text) => textContainsKey(text, key, entry.caseSensitive)),
    );
    if (secondaryMatches.length === 0) {
      return [];
    }
    matched.push(...secondaryMatches);
  }

  return matched;
}

function scanTextsFor(entry: WorldInfoEntry, context: WorldInfoContext): string[] {
  const depth = entry.scanDepth;
  const window =
    depth > 0
      ? context.scanTexts.slice(Math.max(0, context.scanTexts.length - depth))
      : context.scanTexts;
  return [...window, context.userInput];
}

export function matchWorldInfo(
  entries: readonly WorldInfoEntry[],
  context: WorldInfoContext,
  limits: WorldInfoLimits,
  dependencies: WorldInfoDependencies = { estimateTokens: heuristicTokenEstimate },
): WorldInfoMatchResult {
  const ordered = [...entries].sort(
    (left, right) => left.insertionOrder - right.insertionOrder || left.id.localeCompare(right.id),
  );
  const activated: ActivatedWorldInfo[] = [];
  const skipped: SkippedWorldInfo[] = [];
  const trace: WorldInfoTraceStep[] = [];
  const warnings: string[] = [];
  const visited = new Set<string>();
  const reportedAlreadyActivated = new Set<string>();
  let totalBytes = 0;
  let totalEstimatedTokens = 0;

  const recordSkip = (entry: WorldInfoEntry, depth: number, reason: SkippedWorldInfo["reason"]) => {
    skipped.push({ entryId: entry.id, reason });
    trace.push({ entryId: entry.id, depth, outcome: "skipped", reason });
  };

  const hasBudget = (entry: WorldInfoEntry): boolean => {
    if (activated.length >= limits.maxEntries) {
      return false;
    }
    const bytes = new TextEncoder().encode(entry.content).length;
    if (totalBytes + bytes > limits.maxBytes) {
      return false;
    }
    const tokens = dependencies.estimateTokens(entry.content);
    if (totalEstimatedTokens + tokens > limits.maxTokens) {
      return false;
    }
    return true;
  };

  const tryActivate = (
    entry: WorldInfoEntry,
    depth: number,
    matchedKeys: readonly string[],
    reason: ActivatedWorldInfo["reason"],
  ): boolean => {
    if (visited.has(entry.id)) {
      recordSkip(entry, depth, "already-activated");
      return false;
    }
    if (!hasBudget(entry)) {
      recordSkip(entry, depth, "budget");
      warnings.push(`World info budget reached while considering ${entry.id}.`);
      return false;
    }

    const bytes = new TextEncoder().encode(entry.content).length;
    const tokens = dependencies.estimateTokens(entry.content);
    visited.add(entry.id);
    totalBytes += bytes;
    totalEstimatedTokens += tokens;
    activated.push({ entry, depth, reason, matchedKeys, estimatedTokens: tokens });
    trace.push({ entryId: entry.id, depth, outcome: "activated", reason });
    return true;
  };

  // Constant entries are always active at depth 0.
  for (const entry of ordered) {
    if (!entry.enabled) {
      recordSkip(entry, 0, "disabled");
      continue;
    }
    if (!entry.constant) {
      continue;
    }
    tryActivate(entry, 0, [], "constant");
  }

  let depth = 0;
  let currentTexts: string[] = [];
  // Depth 0 scans the conversation; deeper rounds scan only the content that
  // was newly activated in the previous round.
  for (const entry of ordered) {
    if (!entry.enabled || entry.constant || visited.has(entry.id)) {
      continue;
    }
    const matches = matchEntry(entry, scanTextsFor(entry, context));
    if (matches.length === 0) {
      recordSkip(entry, 0, "no-keyword");
      continue;
    }
    if (entry.probability < 1) {
      const roll = mulberry32(fnv1a(`${context.seed}:${entry.id}`))();
      if (roll >= entry.probability) {
        recordSkip(entry, 0, "probability");
        continue;
      }
    }
    tryActivate(entry, 0, matches, "keyword");
  }

  currentTexts = activated.filter((item) => item.entry.recursive).map((item) => item.entry.content);

  for (depth = 1; depth <= limits.maxDepth && currentTexts.length > 0; depth += 1) {
    const newlyActivated: ActivatedWorldInfo[] = [];
    for (const entry of ordered) {
      if (!entry.enabled || entry.constant) {
        continue;
      }
      const matches = matchEntry(entry, currentTexts);
      if (matches.length === 0) {
        continue;
      }
      if (visited.has(entry.id)) {
        if (!reportedAlreadyActivated.has(entry.id)) {
          reportedAlreadyActivated.add(entry.id);
          recordSkip(entry, depth, "already-activated");
        }
        continue;
      }
      if (entry.probability < 1) {
        const roll = mulberry32(fnv1a(`${context.seed}:${entry.id}`))();
        if (roll >= entry.probability) {
          recordSkip(entry, depth, "probability");
          continue;
        }
      }
      if (tryActivate(entry, depth, matches, "recursive")) {
        const activatedEntry = activated.at(-1);
        if (activatedEntry) {
          newlyActivated.push(activatedEntry);
        }
      }
    }

    currentTexts = newlyActivated
      .filter((item) => item.entry.recursive)
      .map((item) => item.entry.content);

    if (depth === limits.maxDepth && currentTexts.length > 0) {
      warnings.push(`World info recursion reached max depth ${limits.maxDepth}.`);
      for (const entry of ordered) {
        if (entry.enabled && !visited.has(entry.id)) {
          trace.push({
            entryId: entry.id,
            depth: depth + 1,
            outcome: "skipped",
            reason: "depth-limit",
          });
        }
      }
    }
  }

  // Return prompt-facing order: position first, then insertion order.
  const positionOrder: Record<string, number> = {
    before_char: 0,
    after_char: 1,
    before_examples: 2,
    after_examples: 3,
    at_depth: 4,
  };
  activated.sort(
    (left, right) =>
      (positionOrder[left.entry.position] ?? 99) - (positionOrder[right.entry.position] ?? 99) ||
      left.entry.insertionOrder - right.entry.insertionOrder ||
      left.entry.id.localeCompare(right.entry.id),
  );

  return {
    activated,
    skipped,
    warnings,
    trace,
    totalBytes,
    totalEstimatedTokens,
  };
}
