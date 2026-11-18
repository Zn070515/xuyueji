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

export interface PromptHistoryMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface PromptSection {
  readonly id: string;
  readonly content: string;
  readonly mandatory?: boolean;
  readonly priority?: number;
  readonly order?: number;
}

export interface PromptCharacterInput {
  readonly name: string;
  readonly description: string;
  readonly personality?: string;
  readonly scenario?: string;
  readonly firstMessage?: string;
}

export interface PromptPersonaInput {
  readonly name: string;
  readonly description: string;
}

export interface PromptWorldInfoInput {
  readonly id: string;
  readonly content: string;
  readonly position?:
    | "before_char"
    | "after_char"
    | "before_examples"
    | "after_examples"
    | "at_depth";
  readonly insertionOrder?: number;
}

export interface PromptSources {
  readonly platformPolicy: string;
  readonly presetSections?: readonly PromptSection[];
  readonly character?: PromptCharacterInput;
  readonly persona?: PromptPersonaInput;
  readonly worldInfo?: readonly PromptWorldInfoInput[];
  readonly examples?: readonly string[];
  readonly history?: readonly PromptHistoryMessage[];
  readonly userInput: string;
  readonly authorNote?: string;
  readonly closingConstraints?: string;
}

export interface PromptBudget {
  readonly contextWindowTokens: number;
  readonly maxOutputTokens: number;
  readonly safetyReserveTokens?: number;
}

export interface PromptCompileOptions {
  readonly sources: PromptSources;
  readonly budget: PromptBudget;
  readonly seed?: number;
  readonly estimateTokens?: (text: string) => number;
}

export interface PromptPlan {
  readonly digest: string;
  readonly components: readonly PromptComponent[];
  readonly estimatedInputTokens: number;
  readonly reservedOutputTokens: number;
  readonly warnings: readonly string[];
  readonly systemPrompt: string;
  readonly messages: readonly PromptHistoryMessage[];
}

export class PromptBudgetExceededError extends Error {
  readonly requiredTokens: number;
  readonly availableTokens: number;

  constructor(requiredTokens: number, availableTokens: number) {
    super(
      `Mandatory prompt components need ${requiredTokens} tokens but only ${availableTokens} are available.`,
    );
    this.name = "PromptBudgetExceededError";
    this.requiredTokens = requiredTokens;
    this.availableTokens = availableTokens;
  }
}

export function heuristicTokenEstimate(text: string): number {
  return Math.ceil(text.length / 3);
}

function componentKey(candidate: { kind: PromptComponentKind; sourceId: string }): string {
  return `${candidate.kind}:${candidate.sourceId}`;
}

function historyKey(index: number): string {
  return componentKey({ kind: "history", sourceId: `history:${index}` });
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

interface Candidate {
  readonly kind: PromptComponentKind;
  readonly sourceId: string;
  readonly content: string;
  readonly mandatory: boolean;
  readonly priority: number;
  readonly order: number;
}

function buildCharacterContent(character: PromptCharacterInput): string {
  const lines = [`角色：${character.name}`, character.description];
  if (character.personality) {
    lines.push(`性格：${character.personality}`);
  }
  if (character.scenario) {
    lines.push(`场景：${character.scenario}`);
  }
  return lines.filter((line) => line.length > 0).join("\n");
}

function buildPersonaContent(persona: PromptPersonaInput): string {
  return [`用户人格：${persona.name}`, persona.description]
    .filter((line) => line.length > 0)
    .join("\n");
}

const WORLD_POSITION_ORDER: Record<string, number> = {
  before_char: 0,
  after_char: 1,
  before_examples: 2,
  after_examples: 3,
  at_depth: 4,
};

function buildCandidates(sources: PromptSources): Candidate[] {
  const candidates: Candidate[] = [];

  candidates.push({
    kind: "platform_policy",
    sourceId: "platform",
    content: sources.platformPolicy,
    mandatory: true,
    priority: 1000,
    order: 0,
  });

  for (const [index, section] of (sources.presetSections ?? []).entries()) {
    if (section.content.trim().length === 0) {
      continue;
    }
    candidates.push({
      kind: "preset_system",
      sourceId: section.id,
      content: section.content,
      mandatory: section.mandatory ?? false,
      priority: section.priority ?? 650,
      order: section.order ?? 10 + index,
    });
  }

  if (sources.character) {
    candidates.push({
      kind: "character",
      sourceId: "character",
      content: buildCharacterContent(sources.character),
      mandatory: true,
      priority: 900,
      order: 20,
    });
  }

  if (sources.persona) {
    candidates.push({
      kind: "persona",
      sourceId: "persona",
      content: buildPersonaContent(sources.persona),
      mandatory: false,
      priority: 600,
      order: 30,
    });
  }

  const worldInfo = [...(sources.worldInfo ?? [])].sort(
    (left, right) =>
      (WORLD_POSITION_ORDER[left.position ?? "after_char"] ?? 99) -
        (WORLD_POSITION_ORDER[right.position ?? "after_char"] ?? 99) ||
      (left.insertionOrder ?? 0) - (right.insertionOrder ?? 0) ||
      left.id.localeCompare(right.id),
  );
  for (const [index, entry] of worldInfo.entries()) {
    if (entry.content.trim().length === 0) {
      continue;
    }
    candidates.push({
      kind: "world_info",
      sourceId: entry.id,
      content: entry.content,
      mandatory: false,
      priority: 500 + (entry.insertionOrder ?? index),
      order: 40 + index / 1000,
    });
  }

  if ((sources.examples ?? []).some((example) => example.trim().length > 0)) {
    candidates.push({
      kind: "examples",
      sourceId: "examples",
      content: (sources.examples ?? []).filter((example) => example.trim().length > 0).join("\n\n"),
      mandatory: false,
      priority: 300,
      order: 50,
    });
  }

  const history = sources.history ?? [];
  // Newer messages get higher priority, so a tight budget keeps recency.
  history.forEach((message, index) => {
    if (message.content.trim().length === 0) {
      return;
    }
    candidates.push({
      kind: "history",
      sourceId: `history:${index}`,
      content: message.content,
      mandatory: false,
      priority: 800 + index,
      order: 60 + index,
    });
  });

  if (sources.authorNote && sources.authorNote.trim().length > 0) {
    candidates.push({
      kind: "author_note",
      sourceId: "author_note",
      content: sources.authorNote,
      mandatory: false,
      priority: 400,
      order: 70,
    });
  }

  candidates.push({
    kind: "user_input",
    sourceId: "user_input",
    content: sources.userInput,
    mandatory: true,
    priority: 950,
    order: 80,
  });

  if (sources.closingConstraints && sources.closingConstraints.trim().length > 0) {
    candidates.push({
      kind: "closing_constraints",
      sourceId: "closing_constraints",
      content: sources.closingConstraints,
      mandatory: true,
      priority: 700,
      order: 90,
    });
  }

  return candidates;
}

export function compilePrompt(options: PromptCompileOptions): PromptPlan {
  const estimate = options.estimateTokens ?? heuristicTokenEstimate;
  const safety = options.budget.safetyReserveTokens ?? 128;
  const available = options.budget.contextWindowTokens - options.budget.maxOutputTokens - safety;
  if (available <= 0) {
    throw new PromptBudgetExceededError(1, Math.max(0, available));
  }

  const candidates = buildCandidates(options.sources).map((candidate) => ({
    ...candidate,
    estimate: estimate(candidate.content),
  }));

  const mandatory = candidates.filter((candidate) => candidate.mandatory);
  const mandatoryTokens = mandatory.reduce((sum, candidate) => sum + candidate.estimate, 0);
  if (mandatoryTokens > available) {
    throw new PromptBudgetExceededError(mandatoryTokens, available);
  }

  const included = new Set<string>();
  for (const candidate of mandatory) {
    included.add(componentKey(candidate));
  }
  let used = mandatoryTokens;
  const warnings: string[] = [];
  let excludedOptional = 0;

  const optional = candidates
    .filter((candidate) => !candidate.mandatory)
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        left.order - right.order ||
        left.sourceId.localeCompare(right.sourceId),
    );

  for (const candidate of optional) {
    if (used + candidate.estimate <= available) {
      included.add(componentKey(candidate));
      used += candidate.estimate;
    } else {
      excludedOptional += 1;
    }
  }

  if (excludedOptional > 0) {
    warnings.push(
      `${excludedOptional} optional prompt component(s) omitted due to the token budget.`,
    );
  }
  const historyCandidates = candidates.filter((candidate) => candidate.kind === "history");
  const includedHistory = historyCandidates.filter((candidate) =>
    included.has(componentKey(candidate)),
  );
  if (includedHistory.length < historyCandidates.length) {
    warnings.push(
      `History truncated: kept ${includedHistory.length} of ${historyCandidates.length} messages.`,
    );
  }

  const ordered = [...candidates].sort(
    (left, right) => left.order - right.order || left.sourceId.localeCompare(right.sourceId),
  );
  const components: PromptComponent[] = ordered.map((candidate) => {
    const isIncluded = included.has(componentKey(candidate));
    return {
      kind: candidate.kind,
      sourceId: candidate.sourceId,
      content: candidate.content,
      estimatedTokens: candidate.estimate,
      mandatory: candidate.mandatory,
      priority: candidate.priority,
      included: isIncluded,
      reason: isIncluded ? (candidate.mandatory ? "mandatory" : "budget") : "budget",
    };
  });

  const systemPrompt = components
    .filter(
      (component) =>
        component.included && component.kind !== "history" && component.kind !== "user_input",
    )
    .map((component) => component.content)
    .join("\n\n");

  const messages: PromptHistoryMessage[] = [
    ...(options.sources.history ?? []).filter((_message, index) => included.has(historyKey(index))),
    { role: "user", content: options.sources.userInput },
  ];

  const estimatedInputTokens = components
    .filter((component) => component.included)
    .reduce((sum, component) => sum + component.estimatedTokens, 0);

  const digest = fnv1a(
    JSON.stringify({
      seed: options.seed ?? 0,
      budget: options.budget,
      components: components
        .filter((component) => component.included)
        .map((component) => [component.kind, component.sourceId, component.content]),
      messages,
    }),
  );

  return {
    digest,
    components,
    estimatedInputTokens,
    reservedOutputTokens: options.budget.maxOutputTokens,
    warnings,
    systemPrompt,
    messages,
  };
}
