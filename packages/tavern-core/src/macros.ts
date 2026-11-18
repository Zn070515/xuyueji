/**
 * Whitelisted macro interpreter for prompt templates.
 *
 * The product spec forbids arbitrary code in user templates: no `eval`, no
 * function calls, no access to `process`, DOM, network, files or wallet state.
 * This interpreter only substitutes named placeholders and picks from a list
 * with an injected seed, so identical inputs always render identically.
 *
 * Supported placeholders:
 * - `{{char}}` / `{{user}}` / `{{persona}}`
 * - `{{random::a::b::c}}` and `{{pick::a::b::c}}` (seeded, deterministic)
 * - `\{{` escapes a literal `{{`
 *
 * Unknown placeholders are left untouched and reported as warnings. There is
 * no recursion: a substituted value is never re-scanned for macros.
 */

export interface MacroContext {
  readonly charName: string;
  readonly userName: string;
  readonly personaName?: string;
  readonly seed: number;
}

export interface MacroLimits {
  readonly maxTemplateLength: number;
  readonly maxMacros: number;
  readonly maxOptionsPerMacro: number;
}

export const DEFAULT_MACRO_LIMITS: MacroLimits = {
  maxTemplateLength: 100_000,
  maxMacros: 1_000,
  maxOptionsPerMacro: 50,
};

export interface MacroRenderResult {
  readonly output: string;
  readonly used: readonly string[];
  readonly warnings: readonly string[];
}

export class MacroError extends Error {
  readonly code: "template-too-large" | "too-many-macros" | "too-many-options";

  constructor(code: MacroError["code"], message: string) {
    super(message);
    this.name = "MacroError";
    this.code = code;
  }
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function pickOption(options: readonly string[], context: MacroContext, macroIndex: number): string {
  const roll = fnv1a(`${context.seed}:${macroIndex}:${options.length}`) % options.length;
  return options[roll] ?? "";
}

export function renderMacros(
  template: string,
  context: MacroContext,
  limits: MacroLimits = DEFAULT_MACRO_LIMITS,
): MacroRenderResult {
  if (template.length > limits.maxTemplateLength) {
    throw new MacroError(
      "template-too-large",
      `Template exceeds ${limits.maxTemplateLength} characters.`,
    );
  }

  let output = "";
  const used = new Set<string>();
  const warnings = new Set<string>();
  let macroCount = 0;
  let index = 0;
  let blockIndex = 0;

  while (index < template.length) {
    const open = template.indexOf("{{", index);
    if (open < 0) {
      output += template.slice(index);
      break;
    }
    if (open > 0 && template[open - 1] === "\\") {
      output += `${template.slice(index, open - 1)}{{`;
      index = open + 2;
      continue;
    }
    const close = template.indexOf("}}", open + 2);
    if (close < 0) {
      output += template.slice(index);
      break;
    }
    output += template.slice(index, open);
    const body = template.slice(open + 2, close).trim();
    const parts = body.split("::").map((part) => part.trim());
    const name = (parts[0] ?? "").toLowerCase();
    const original = template.slice(open, close + 2);

    macroCount += 1;
    if (macroCount > limits.maxMacros) {
      throw new MacroError(
        "too-many-macros",
        `Template contains more than ${limits.maxMacros} macros.`,
      );
    }

    switch (name) {
      case "char":
      case "user":
      case "persona": {
        used.add(name);
        output +=
          name === "char"
            ? context.charName
            : name === "user"
              ? context.userName
              : (context.personaName ?? context.userName);
        break;
      }
      case "random":
      case "pick": {
        const options = parts.slice(1).filter((part) => part.length > 0);
        if (options.length === 0) {
          warnings.add(`${original} has no options and was left as-is.`);
          output += original;
          break;
        }
        if (options.length > limits.maxOptionsPerMacro) {
          throw new MacroError(
            "too-many-options",
            `${name} has more than ${limits.maxOptionsPerMacro} options.`,
          );
        }
        used.add(name);
        output += pickOption(options, context, blockIndex);
        break;
      }
      default:
        warnings.add(`Unknown macro ${original} was left as-is.`);
        output += original;
    }
    blockIndex += 1;
    index = close + 2;
  }

  return { output, used: [...used], warnings: [...warnings] };
}
