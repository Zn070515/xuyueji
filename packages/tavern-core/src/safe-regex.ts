/**
 * Bounded regular-expression engine for the tavern pipeline.
 *
 * User-supplied patterns are untrusted input. JavaScript `RegExp` cannot be
 * interrupted once a catastrophic pattern starts backtracking, so the product
 * spec requires a provably bounded executor. This engine:
 *
 * - accepts an explicit subset of the usual syntax and rejects the rest;
 * - rejects classic nested-quantifier shapes at parse time;
 * - compiles to a small instruction set and runs with a hard step budget, so
 *   every application terminates deterministically (same steps, same result);
 * - caps pattern length, compiled program size, input length and match count.
 *
 * Supported: literals, `.`, `[...]` classes with ranges and `^` negation,
 * `\d \w \s \D \W \S`, escaped punctuation, `\n \t \r`, anchors `^ $`,
 * quantifiers `* + ? {n} {n,} {n,m}` with lazy `?`, groups `(...)` and
 * `(?:...)`, alternation `|`, flags `i`, `m`, `s`.
 *
 * Rejected with `unsupported-syntax`: lookaround, named groups, backreferences,
 * unicode property escapes and inline flag groups.
 */

export type SafeRegexErrorCode =
  | "pattern-too-large"
  | "input-too-large"
  | "program-too-large"
  | "unsupported-syntax"
  | "invalid-pattern"
  | "unsafe-pattern"
  | "step-limit"
  | "match-limit";

export class SafeRegexError extends Error {
  readonly code: SafeRegexErrorCode;

  constructor(code: SafeRegexErrorCode, message: string) {
    super(message);
    this.name = "SafeRegexError";
    this.code = code;
  }
}

export interface SafeRegexLimits {
  readonly maxPatternLength: number;
  readonly maxInputLength: number;
  readonly maxSteps: number;
  readonly maxMatches: number;
  readonly maxProgramSize: number;
}

export const DEFAULT_SAFE_REGEX_LIMITS: SafeRegexLimits = {
  maxPatternLength: 2_000,
  maxInputLength: 100_000,
  maxSteps: 250_000,
  maxMatches: 5_000,
  maxProgramSize: 20_000,
};

export interface SafeRegexRuleSource {
  readonly pattern: string;
  readonly flags: string;
  readonly replacement: string;
}

export interface SafeRegexResult {
  readonly output: string;
  readonly matchCount: number;
  readonly steps: number;
}

export interface SafeRegexTestResult {
  readonly matched: boolean;
  readonly matchCount: number;
  readonly steps: number;
}

export interface SafeRegexFlags {
  readonly caseInsensitive: boolean;
  readonly multiline: boolean;
  readonly dotAll: boolean;
}

type Node =
  | { readonly type: "empty" }
  | { readonly type: "char"; readonly code: number }
  | { readonly type: "any" }
  | {
      readonly type: "class";
      readonly negated: boolean;
      readonly ranges: readonly (readonly [number, number])[];
    }
  | { readonly type: "anchor"; readonly kind: "start" | "end" }
  | { readonly type: "sequence"; readonly items: readonly Node[] }
  | { readonly type: "alternation"; readonly alternatives: readonly Node[] }
  | { readonly type: "group"; readonly index: number | null; readonly node: Node }
  | {
      readonly type: "repeat";
      readonly node: Node;
      readonly min: number;
      readonly max: number;
      readonly greedy: boolean;
    };

type Instruction =
  | { readonly op: "char"; readonly code: number }
  | { readonly op: "any" }
  | {
      readonly op: "class";
      readonly negated: boolean;
      readonly ranges: readonly (readonly [number, number])[];
    }
  | { readonly op: "assert"; readonly kind: "start" | "end" }
  | { readonly op: "split"; readonly prefer: "x" | "y"; x: number; y: number }
  | { readonly op: "jump"; x: number }
  | { readonly op: "save"; readonly slot: number }
  | { readonly op: "match" };

export interface CompiledSafeRegex {
  readonly flags: SafeRegexFlags;
  readonly program: readonly Instruction[];
  readonly slotCount: number;
  readonly groupCount: number;
}

const MAX_REPEAT = 1_000;

const CLASS_SHORTCUTS: Record<string, readonly (readonly [number, number])[]> = {
  d: [[48, 57]],
  w: [
    [48, 57],
    [65, 90],
    [95, 95],
    [97, 122],
  ],
  s: [
    [9, 13],
    [32, 32],
  ],
};

function describePosition(index: number): string {
  return `at position ${index}`;
}

class Parser {
  private index = 0;
  private groupCount = 0;

  constructor(private readonly source: string) {}

  parse(): Node {
    const node = this.parseAlternation();
    if (this.index < this.source.length) {
      throw new SafeRegexError(
        "invalid-pattern",
        `Unexpected "${this.source[this.index]}" ${describePosition(this.index)}.`,
      );
    }
    return node;
  }

  private peek(): string | undefined {
    return this.source[this.index];
  }

  private take(): string {
    const value = this.source[this.index];
    if (value === undefined) {
      throw new SafeRegexError("invalid-pattern", "Unexpected end of pattern.");
    }
    this.index += 1;
    return value;
  }

  private parseAlternation(): Node {
    const alternatives: Node[] = [this.parseSequence()];
    while (this.peek() === "|") {
      this.index += 1;
      alternatives.push(this.parseSequence());
    }
    if (alternatives.length === 1) {
      return alternatives[0] ?? { type: "empty" };
    }
    return { type: "alternation", alternatives };
  }

  private parseSequence(): Node {
    const items: Node[] = [];
    while (this.index < this.source.length) {
      const current = this.peek();
      if (current === "|" || current === ")") {
        break;
      }
      items.push(this.parseQuantifier(this.parseAtom()));
    }
    if (items.length === 0) {
      return { type: "empty" };
    }
    if (items.length === 1) {
      return items[0] ?? { type: "empty" };
    }
    return { type: "sequence", items };
  }

  private parseAtom(): Node {
    const current = this.take();
    switch (current) {
      case "^":
        return { type: "anchor", kind: "start" };
      case "$":
        return { type: "anchor", kind: "end" };
      case ".":
        return { type: "any" };
      case "(": {
        let capturing = true;
        if (this.peek() === "?") {
          if (this.source[this.index + 1] === ":") {
            this.index += 2;
            capturing = false;
          } else {
            throw new SafeRegexError(
              "unsupported-syntax",
              "Lookaround, named groups and inline flags are not supported.",
            );
          }
        }
        let index: number | null = null;
        if (capturing) {
          this.groupCount += 1;
          index = this.groupCount;
        }
        const node = this.parseAlternation();
        if (this.peek() !== ")") {
          throw new SafeRegexError("invalid-pattern", "Unterminated group.");
        }
        this.index += 1;
        return { type: "group", index, node };
      }
      case ")":
        throw new SafeRegexError("invalid-pattern", "Unexpected closing parenthesis.");
      case "[":
        return this.parseClass();
      case "*":
      case "+":
      case "?":
        throw new SafeRegexError(
          "invalid-pattern",
          `Quantifier "${current}" has nothing to repeat.`,
        );
      case "{":
        throw new SafeRegexError("invalid-pattern", "Brace has nothing to repeat.");
      case "\\":
        return this.parseEscape();
      default:
        return { type: "char", code: current.charCodeAt(0) };
    }
  }

  private parseEscape(): Node {
    const escaped = this.take();
    const lower = escaped.toLowerCase();
    const shortcut = CLASS_SHORTCUTS[lower];
    if (shortcut) {
      return { type: "class", negated: escaped !== lower, ranges: shortcut };
    }
    switch (escaped) {
      case "n":
        return { type: "char", code: 10 };
      case "t":
        return { type: "char", code: 9 };
      case "r":
        return { type: "char", code: 13 };
      case "0":
        return { type: "char", code: 0 };
      case "u": {
        const hex = this.source.slice(this.index, this.index + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          throw new SafeRegexError("invalid-pattern", "\\u escape needs four hex digits.");
        }
        this.index += 4;
        return { type: "char", code: Number.parseInt(hex, 16) };
      }
      default:
        if (/[1-9]/.test(escaped)) {
          throw new SafeRegexError("unsupported-syntax", "Backreferences are not supported.");
        }
        if (/[A-Za-z]/.test(escaped)) {
          throw new SafeRegexError("unsupported-syntax", `Unknown escape "\\${escaped}".`);
        }
        return { type: "char", code: escaped.charCodeAt(0) };
    }
  }

  private parseClass(): Node {
    let negated = false;
    if (this.peek() === "^") {
      negated = true;
      this.index += 1;
    }
    const ranges: (readonly [number, number])[] = [];
    let first = true;
    while (this.index < this.source.length) {
      if (this.peek() === "]" && !first) {
        this.index += 1;
        if (ranges.length === 0) {
          throw new SafeRegexError("invalid-pattern", "Empty character class.");
        }
        return { type: "class", negated, ranges };
      }
      first = false;
      const start = this.parseClassAtom();
      if (typeof start !== "number") {
        ranges.push(...start.ranges);
        continue;
      }
      if (this.peek() === "-" && this.source[this.index + 1] !== "]") {
        this.index += 1;
        const end = this.parseClassAtom();
        if (typeof end !== "number") {
          throw new SafeRegexError(
            "invalid-pattern",
            "Character class range endpoint must be a single character.",
          );
        }
        if (end < start) {
          throw new SafeRegexError("invalid-pattern", "Character class range is reversed.");
        }
        ranges.push([start, end]);
      } else {
        ranges.push([start, start]);
      }
    }
    throw new SafeRegexError("invalid-pattern", "Unterminated character class.");
  }

  private parseClassAtom(): number | { ranges: readonly (readonly [number, number])[] } {
    const current = this.take();
    if (current !== "\\") {
      return current.charCodeAt(0);
    }
    const escaped = this.take();
    const lower = escaped.toLowerCase();
    const shortcut = CLASS_SHORTCUTS[lower];
    if (shortcut) {
      return { ranges: shortcut };
    }
    switch (escaped) {
      case "n":
        return 10;
      case "t":
        return 9;
      case "r":
        return 13;
      case "0":
        return 0;
      case "u": {
        const hex = this.source.slice(this.index, this.index + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          throw new SafeRegexError("invalid-pattern", "\\u escape needs four hex digits.");
        }
        this.index += 4;
        return Number.parseInt(hex, 16);
      }
      default:
        if (/[A-Za-z0-9]/.test(escaped)) {
          throw new SafeRegexError("unsupported-syntax", `Unknown escape "\\${escaped}".`);
        }
        return escaped.charCodeAt(0);
    }
  }

  private parseQuantifier(atom: Node): Node {
    const current = this.peek();
    if (current === undefined) {
      return atom;
    }
    let min: number;
    let max: number;
    if (current === "*") {
      this.index += 1;
      min = 0;
      max = Number.POSITIVE_INFINITY;
    } else if (current === "+") {
      this.index += 1;
      min = 1;
      max = Number.POSITIVE_INFINITY;
    } else if (current === "?") {
      this.index += 1;
      min = 0;
      max = 1;
    } else if (current === "{") {
      const match = /^\{(\d+)(?:,(?:(\d+))?)?\}/.exec(this.source.slice(this.index));
      if (!match) {
        throw new SafeRegexError("invalid-pattern", "Malformed repetition brace.");
      }
      this.index += match[0].length;
      min = Number.parseInt(match[1] ?? "0", 10);
      if (match[2] !== undefined) {
        max = Number.parseInt(match[2], 10);
      } else if (match[0].includes(",")) {
        max = Number.POSITIVE_INFINITY;
      } else {
        max = min;
      }
      if (min > MAX_REPEAT || (max !== Number.POSITIVE_INFINITY && max > MAX_REPEAT)) {
        throw new SafeRegexError(
          "invalid-pattern",
          `Repetition counts must be at most ${MAX_REPEAT}.`,
        );
      }
      if (max < min) {
        throw new SafeRegexError("invalid-pattern", "Repetition maximum is below minimum.");
      }
    } else {
      return atom;
    }

    if (atom.type === "anchor" || atom.type === "empty") {
      throw new SafeRegexError("invalid-pattern", "Cannot quantify an anchor or empty group.");
    }

    let greedy = true;
    if (this.peek() === "?") {
      this.index += 1;
      greedy = false;
    }
    const next = this.peek();
    if (next === "*" || next === "+" || next === "{") {
      throw new SafeRegexError("invalid-pattern", "A quantifier cannot follow another quantifier.");
    }
    return { type: "repeat", node: atom, min, max, greedy };
  }
}

function canMatchEmpty(node: Node): boolean {
  switch (node.type) {
    case "empty":
    case "anchor":
      return true;
    case "char":
    case "any":
    case "class":
      return false;
    case "sequence":
      return node.items.every(canMatchEmpty);
    case "alternation":
      return node.alternatives.some(canMatchEmpty);
    case "group":
      return canMatchEmpty(node.node);
    case "repeat":
      return node.min === 0 || canMatchEmpty(node.node);
  }
}

function hasNestedUnboundedRepeat(node: Node, insideUnbounded: boolean): boolean {
  switch (node.type) {
    case "sequence":
      return node.items.some((item) => hasNestedUnboundedRepeat(item, insideUnbounded));
    case "alternation":
      return node.alternatives.some((item) => hasNestedUnboundedRepeat(item, insideUnbounded));
    case "group":
      return hasNestedUnboundedRepeat(node.node, insideUnbounded);
    case "repeat": {
      const unbounded = node.max === Number.POSITIVE_INFINITY;
      if (unbounded && (insideUnbounded || canMatchEmpty(node.node))) {
        return true;
      }
      return hasNestedUnboundedRepeat(node.node, insideUnbounded || unbounded);
    }
    default:
      return false;
  }
}

function countGroups(node: Node): number {
  switch (node.type) {
    case "group":
      return (node.index ?? 0) + countGroups(node.node);
    case "sequence":
      return node.items.reduce((sum, item) => sum + countGroups(item), 0);
    case "alternation":
      return node.alternatives.reduce((sum, item) => sum + countGroups(item), 0);
    case "repeat":
      return countGroups(node.node);
    default:
      return 0;
  }
}

function compileNode(
  node: Node,
  code: Instruction[],
  limits: SafeRegexLimits,
  caseInsensitive: boolean,
): void {
  if (code.length > limits.maxProgramSize) {
    throw new SafeRegexError("program-too-large", "Pattern compiles to too many instructions.");
  }
  switch (node.type) {
    case "empty":
      return;
    case "char":
      code.push({
        op: "char",
        code: caseInsensitive
          ? String.fromCharCode(node.code).toLowerCase().charCodeAt(0)
          : node.code,
      });
      return;
    case "any":
      code.push({ op: "any" });
      return;
    case "class":
      code.push({ op: "class", negated: node.negated, ranges: node.ranges });
      return;
    case "anchor":
      code.push({ op: "assert", kind: node.kind });
      return;
    case "sequence":
      for (const item of node.items) {
        compileNode(item, code, limits, caseInsensitive);
      }
      return;
    case "alternation": {
      const jumps: number[] = [];
      for (const [position, alternative] of node.alternatives.entries()) {
        if (position === node.alternatives.length - 1) {
          compileNode(alternative, code, limits, caseInsensitive);
          continue;
        }
        const splitIndex = code.length;
        code.push({ op: "split", prefer: "x", x: splitIndex + 1, y: 0 });
        compileNode(alternative, code, limits, caseInsensitive);
        jumps.push(code.length);
        code.push({ op: "jump", x: 0 });
        const split = code[splitIndex];
        if (split && split.op === "split") {
          split.y = code.length;
        }
      }
      for (const jumpIndex of jumps) {
        const jump = code[jumpIndex];
        if (jump && jump.op === "jump") {
          jump.x = code.length;
        }
      }
      return;
    }
    case "group": {
      if (node.index !== null) {
        code.push({ op: "save", slot: node.index * 2 });
      }
      compileNode(node.node, code, limits, caseInsensitive);
      if (node.index !== null) {
        code.push({ op: "save", slot: node.index * 2 + 1 });
      }
      return;
    }
    case "repeat": {
      for (let count = 0; count < node.min; count += 1) {
        compileNode(node.node, code, limits, caseInsensitive);
      }
      if (node.max === Number.POSITIVE_INFINITY) {
        const start = code.length;
        code.push({ op: "split", prefer: node.greedy ? "x" : "y", x: start + 1, y: 0 });
        compileNode(node.node, code, limits, caseInsensitive);
        code.push({ op: "jump", x: start });
        const split = code[start];
        if (split && split.op === "split") {
          split.y = code.length;
        }
        return;
      }
      const splits: number[] = [];
      for (let count = 0; count < node.max - node.min; count += 1) {
        const splitIndex = code.length;
        code.push({ op: "split", prefer: node.greedy ? "x" : "y", x: splitIndex + 1, y: 0 });
        splits.push(splitIndex);
        compileNode(node.node, code, limits, caseInsensitive);
      }
      for (const splitIndex of splits) {
        const split = code[splitIndex];
        if (split && split.op === "split") {
          split.y = code.length;
        }
      }
      return;
    }
  }
}

function parseFlags(flags: string): SafeRegexFlags {
  let caseInsensitive = false;
  let multiline = false;
  let dotAll = false;
  for (const flag of flags) {
    switch (flag) {
      case "i":
        caseInsensitive = true;
        break;
      case "m":
        multiline = true;
        break;
      case "s":
        dotAll = true;
        break;
      default:
        throw new SafeRegexError(
          "unsupported-syntax",
          `Flag "${flag}" is not supported (allowed: i, m, s).`,
        );
    }
  }
  return { caseInsensitive, multiline, dotAll };
}

export function compileSafeRegex(
  pattern: string,
  flags: string,
  limits: SafeRegexLimits = DEFAULT_SAFE_REGEX_LIMITS,
): CompiledSafeRegex {
  if (pattern.length === 0) {
    throw new SafeRegexError("invalid-pattern", "Pattern is empty.");
  }
  if (pattern.length > limits.maxPatternLength) {
    throw new SafeRegexError(
      "pattern-too-large",
      `Pattern exceeds ${limits.maxPatternLength} characters.`,
    );
  }
  const parsedFlags = parseFlags(flags);
  let ast: Node;
  try {
    ast = new Parser(pattern).parse();
  } catch (cause) {
    if (cause instanceof SafeRegexError) {
      throw cause;
    }
    throw new SafeRegexError("invalid-pattern", "Pattern could not be parsed.");
  }
  if (hasNestedUnboundedRepeat(ast, false)) {
    throw new SafeRegexError(
      "unsafe-pattern",
      "Nested unbounded repetition is rejected because it can backtrack catastrophically.",
    );
  }

  const program: Instruction[] = [];
  compileNode(ast, program, limits, parsedFlags.caseInsensitive);
  if (program.length > limits.maxProgramSize) {
    throw new SafeRegexError("program-too-large", "Pattern compiles to too many instructions.");
  }
  program.push({ op: "match" });

  const groupCount = countGroups(ast);
  return {
    flags: parsedFlags,
    program,
    slotCount: (groupCount + 1) * 2,
    groupCount,
  };
}

interface MatchState {
  readonly start: number;
  readonly end: number;
  readonly slots: readonly number[];
}

interface BacktrackFrame {
  readonly pc: number;
  readonly pos: number;
  readonly trailLength: number;
}

function classMatches(
  code: number,
  ranges: readonly (readonly [number, number])[],
  caseInsensitive: boolean,
): boolean {
  const candidates = caseInsensitive
    ? [code, String.fromCharCode(code).toLowerCase().charCodeAt(0)]
    : [code];
  for (const candidate of candidates) {
    for (const [from, to] of ranges) {
      if (candidate >= from && candidate <= to) {
        return true;
      }
    }
  }
  return false;
}

class Runner {
  private steps = 0;

  constructor(
    private readonly compiled: CompiledSafeRegex,
    private readonly input: string,
    private readonly limits: SafeRegexLimits,
  ) {}

  get stepCount(): number {
    return this.steps;
  }

  matchAt(start: number): MatchState | null {
    const { program, slotCount, flags } = this.compiled;
    const slots: number[] = new Array(slotCount).fill(-1) as number[];
    const trail: { slot: number; previous: number }[] = [];
    const stack: BacktrackFrame[] = [];
    let pc = 0;
    let pos = start;

    for (;;) {
      this.steps += 1;
      if (this.steps > this.limits.maxSteps) {
        throw new SafeRegexError(
          "step-limit",
          `Regex exceeded ${this.limits.maxSteps} execution steps.`,
        );
      }
      const instruction = program[pc];
      if (!instruction) {
        throw new SafeRegexError("invalid-pattern", "Pattern program is malformed.");
      }

      let advanced = false;
      switch (instruction.op) {
        case "char": {
          if (pos < this.input.length) {
            const code = this.input.charCodeAt(pos);
            const candidate = flags.caseInsensitive
              ? String.fromCharCode(code).toLowerCase().charCodeAt(0)
              : code;
            if (candidate === instruction.code) {
              pc += 1;
              pos += 1;
              advanced = true;
            }
          }
          break;
        }
        case "any":
          if (pos < this.input.length && (flags.dotAll || this.input[pos] !== "\n")) {
            pc += 1;
            pos += 1;
            advanced = true;
          }
          break;
        case "class":
          if (
            pos < this.input.length &&
            classMatches(this.input.charCodeAt(pos), instruction.ranges, flags.caseInsensitive) !==
              instruction.negated
          ) {
            pc += 1;
            pos += 1;
            advanced = true;
          }
          break;
        case "assert": {
          const matched =
            instruction.kind === "start"
              ? pos === 0 || (flags.multiline && this.input[pos - 1] === "\n")
              : pos === this.input.length || (flags.multiline && this.input[pos] === "\n");
          if (matched) {
            pc += 1;
            advanced = true;
          }
          break;
        }
        case "split":
          stack.push({
            pc: instruction.prefer === "x" ? instruction.y : instruction.x,
            pos,
            trailLength: trail.length,
          });
          pc = instruction.prefer === "x" ? instruction.x : instruction.y;
          advanced = true;
          break;
        case "jump":
          pc = instruction.x;
          advanced = true;
          break;
        case "save":
          trail.push({ slot: instruction.slot, previous: slots[instruction.slot] ?? -1 });
          slots[instruction.slot] = pos;
          pc += 1;
          advanced = true;
          break;
        case "match":
          slots[0] = start;
          slots[1] = pos;
          return { start, end: pos, slots: [...slots] };
      }

      if (advanced) {
        continue;
      }

      const frame = stack.pop();
      if (!frame) {
        return null;
      }
      while (trail.length > frame.trailLength) {
        const entry = trail.pop();
        if (entry) {
          slots[entry.slot] = entry.previous;
        }
      }
      pc = frame.pc;
      pos = frame.pos;
    }
  }

  findFrom(from: number): MatchState | null {
    for (let start = from; start <= this.input.length; start += 1) {
      const match = this.matchAt(start);
      if (match) {
        return match;
      }
    }
    return null;
  }
}

function expandReplacement(
  replacement: string,
  input: string,
  match: MatchState,
  groupCount: number,
): string {
  let output = "";
  for (let index = 0; index < replacement.length; index += 1) {
    const current = replacement[index];
    if (current !== "$") {
      output += current;
      continue;
    }
    const next = replacement[index + 1];
    if (next === "$") {
      output += "$";
      index += 1;
      continue;
    }
    if (next === "&" || next === "0") {
      output += input.slice(match.start, match.end);
      index += 1;
      continue;
    }
    if (next !== undefined && /[1-9]/.test(next)) {
      const group = Number.parseInt(next, 10);
      index += 1;
      if (group > groupCount) {
        continue;
      }
      const from = match.slots[group * 2] ?? -1;
      const to = match.slots[group * 2 + 1] ?? -1;
      if (from >= 0 && to >= from) {
        output += input.slice(from, to);
      }
      continue;
    }
    output += "$";
  }
  return output;
}

function prepare(
  input: string,
  pattern: string,
  flags: string,
  limits: SafeRegexLimits,
): { compiled: CompiledSafeRegex; runner: Runner } {
  if (input.length > limits.maxInputLength) {
    throw new SafeRegexError(
      "input-too-large",
      `Input exceeds ${limits.maxInputLength} characters.`,
    );
  }
  const compiled = compileSafeRegex(pattern, flags, limits);
  return { compiled, runner: new Runner(compiled, input, limits) };
}

/** Applies one rule to a single string, replacing every match. */
export function applySafeRegex(
  input: string,
  rule: SafeRegexRuleSource,
  limits: SafeRegexLimits = DEFAULT_SAFE_REGEX_LIMITS,
): SafeRegexResult {
  const { compiled, runner } = prepare(input, rule.pattern, rule.flags, limits);
  let output = "";
  let lastIndex = 0;
  let searchFrom = 0;
  let matchCount = 0;

  while (searchFrom <= input.length) {
    const match = runner.findFrom(searchFrom);
    if (!match) {
      break;
    }
    matchCount += 1;
    if (matchCount > limits.maxMatches) {
      throw new SafeRegexError(
        "match-limit",
        `Regex produced more than ${limits.maxMatches} matches.`,
      );
    }
    output += input.slice(lastIndex, match.start);
    output += expandReplacement(rule.replacement, input, match, compiled.groupCount);
    lastIndex = match.end;

    if (match.end === match.start) {
      if (match.start < input.length) {
        output += input[match.start];
        lastIndex = match.start + 1;
        searchFrom = match.start + 1;
      } else {
        break;
      }
    } else {
      searchFrom = match.end;
    }
  }

  output += input.slice(lastIndex);
  return { output, matchCount, steps: runner.stepCount };
}

/** Tests whether a pattern matches anywhere in the input, without replacing. */
export function testSafeRegex(
  input: string,
  pattern: string,
  flags: string,
  limits: SafeRegexLimits = DEFAULT_SAFE_REGEX_LIMITS,
): SafeRegexTestResult {
  const { runner } = prepare(input, pattern, flags, limits);
  const match = runner.findFrom(0);
  return { matched: match !== null, matchCount: match ? 1 : 0, steps: runner.stepCount };
}
