import { describe, expect, it } from "vitest";

import { DEFAULT_MACRO_LIMITS, type MacroContext, MacroError, renderMacros } from "./macros.js";

const context: MacroContext = {
  charName: "阿岚",
  userName: "旅人",
  personaName: "夜行者",
  seed: 7,
};

function render(template: string, overrides: Partial<MacroContext> = {}) {
  return renderMacros(template, { ...context, ...overrides });
}

describe("renderMacros", () => {
  it("substitutes char, user and persona names", () => {
    expect(render("{{char}} 看向 {{user}}。").output).toBe("阿岚 看向 旅人。");
    expect(render("{{persona}}说").output).toBe("夜行者说");
    expect(render("{{user}}", { personaName: undefined }).output).toBe("旅人");
  });

  it("is case-insensitive for macro names", () => {
    expect(render("{{CHAR}}").output).toBe("阿岚");
  });

  it("picks random options deterministically per seed", () => {
    const first = render("{{random::红::蓝::绿}}");
    const second = render("{{random::红::蓝::绿}}");
    expect(first.output).toBe(second.output);
    expect(["红", "蓝", "绿"]).toContain(first.output);
    const differentSeed = render("{{random::红::蓝::绿}}", { seed: 99 });
    expect(["红", "蓝", "绿"]).toContain(differentSeed.output);
  });

  it("supports pick with the same deterministic behaviour", () => {
    expect(render("{{pick::东::西}}").output).toBe(render("{{pick::东::西}}").output);
  });

  it("does not scan substituted values recursively", () => {
    const result = render("{{char}}", { charName: "{{user}}" });
    expect(result.output).toBe("{{user}}");
  });

  it("leaves unknown macros untouched and warns", () => {
    const result = render("{{unknown}} {{char}}");
    expect(result.output).toBe("{{unknown}} 阿岚");
    expect(result.warnings.join(" ")).toMatch(/Unknown macro/);
    expect(result.used).toEqual(["char"]);
  });

  it("escapes literal braces with a backslash", () => {
    expect(render("\\{{char}}").output).toBe("{{char}}");
  });

  it("leaves an unterminated macro alone", () => {
    expect(render("{{char").output).toBe("{{char");
  });

  it("enforces template, macro-count and option limits", () => {
    expect(() =>
      renderMacros("x".repeat(20), context, { ...DEFAULT_MACRO_LIMITS, maxTemplateLength: 10 }),
    ).toThrow(MacroError);
    expect(() =>
      renderMacros("{{char}}{{char}}", context, { ...DEFAULT_MACRO_LIMITS, maxMacros: 1 }),
    ).toThrow(/more than 1 macros/);
    expect(() =>
      renderMacros("{{random::a::b::c}}", context, {
        ...DEFAULT_MACRO_LIMITS,
        maxOptionsPerMacro: 1,
      }),
    ).toThrow(/more than 1 options/);
  });
});
