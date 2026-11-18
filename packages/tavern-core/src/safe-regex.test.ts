import { describe, expect, it } from "vitest";

import {
  applySafeRegex,
  compileSafeRegex,
  DEFAULT_SAFE_REGEX_LIMITS,
  SafeRegexError,
  testSafeRegex,
} from "./safe-regex.js";

function replace(input: string, pattern: string, replacement: string, flags = ""): string {
  return applySafeRegex(input, { pattern, replacement, flags }).output;
}

describe("applySafeRegex", () => {
  it("replaces literals case-insensitively when i is set", () => {
    expect(replace("Hello World", "world", "续月记", "i")).toBe("Hello 续月记");
    expect(replace("Hello World", "world", "续月记")).toBe("Hello World");
  });

  it("supports classes, ranges and negation", () => {
    expect(replace("a1 b2 c3", "[a-c]", "x")).toBe("x1 x2 x3");
    expect(replace("a1 b2 c3", "[^0-9 ]", "_")).toBe("_1 _2 _3");
  });

  it("supports shortcuts and their negations", () => {
    expect(replace("a1b22c", "\\d+", "#")).toBe("a#b#c");
    expect(replace("a1b22c", "\\D", "")).toBe("122");
    expect(replace("a b\tc", "\\s", "_")).toBe("a_b_c");
  });

  it("supports anchors, including multiline", () => {
    expect(replace("one\ntwo\nthree", "^", "> ", "m")).toBe("> one\n> two\n> three");
    expect(replace("one\ntwo", "^", "> ")).toBe("> one\ntwo");
  });

  it("expands capture groups into the replacement", () => {
    expect(replace("alice@example", "(\\w+)@(\\w+)", "$2<$1>")).toBe("example<alice>");
    expect(replace("abc", "(a)(b)(c)", "$3$2$1")).toBe("cba");
    expect(replace("abc", "abc", "$0 and $$")).toBe("abc and $");
  });

  it("follows leftmost-first alternation order", () => {
    expect(replace("ab", "a|ab", "X")).toBe("Xb");
    expect(replace("ab", "ab|a", "X")).toBe("X");
  });

  it("distinguishes greedy and lazy quantifiers", () => {
    const input = '"a" "b"';
    expect(replace(input, '".*"', "Q")).toBe("Q");
    expect(replace(input, '".*?"', "Q")).toBe("Q Q");
  });

  it("supports bounded repetition", () => {
    expect(replace("aaaa", "a{2}", "x")).toBe("xx");
    expect(replace("aaaa", "a{2,3}", "x")).toBe("xa");
    expect(replace("aaaa", "a{2,}", "x")).toBe("x");
  });

  it("supports non-capturing groups", () => {
    expect(replace("abab", "(?:ab)+", "X")).toBe("X");
  });

  it("keeps empty matches deterministic and terminating", () => {
    expect(replace("ab", "x*", "-")).toBe("-a-b-");
    expect(replace("", "x*", "-")).toBe("-");
  });

  it("treats dot per the dotAll flag", () => {
    expect(replace("a\nb", "a.b", "X")).toBe("a\nb");
    expect(replace("a\nb", "a.b", "X", "s")).toBe("X");
  });

  it("is reproducible across runs", () => {
    const first = applySafeRegex("aaaa bbbb", {
      pattern: "(a+)|(b+)",
      replacement: "[$1$2]",
      flags: "",
    });
    const second = applySafeRegex("aaaa bbbb", {
      pattern: "(a+)|(b+)",
      replacement: "[$1$2]",
      flags: "",
    });
    expect(second).toEqual(first);
  });
});

describe("compileSafeRegex rejects unsafe input", () => {
  function expectCode(pattern: string, flags: string, code: SafeRegexError["code"]): void {
    try {
      compileSafeRegex(pattern, flags);
      throw new Error(`Expected ${pattern} to fail with ${code}.`);
    } catch (cause) {
      expect(cause).toBeInstanceOf(SafeRegexError);
      expect((cause as SafeRegexError).code).toBe(code);
    }
  }

  it("rejects nested unbounded quantifiers", () => {
    expectCode("(a+)+$", "", "unsafe-pattern");
    expectCode("(a*)*", "", "unsafe-pattern");
    expectCode("(a|)*", "", "unsafe-pattern");
  });

  it("rejects lookaround, named groups and backreferences", () => {
    expectCode("(?=abc)", "", "unsupported-syntax");
    expectCode("(?<name>a)", "", "unsupported-syntax");
    expectCode("(a)\\1", "", "unsupported-syntax");
  });

  it("rejects malformed patterns", () => {
    expectCode("[abc", "", "invalid-pattern");
    expectCode("*a", "", "invalid-pattern");
    expectCode("a**", "", "invalid-pattern");
    expectCode("a{3,2}", "", "invalid-pattern");
    expectCode("a{9999}", "", "invalid-pattern");
    expectCode("", "", "invalid-pattern");
  });

  it("rejects unknown flags", () => {
    expectCode("abc", "g", "unsupported-syntax");
    expectCode("abc", "u", "unsupported-syntax");
  });
});

describe("limits", () => {
  it("stops catastrophic backtracking with a step limit", () => {
    expect(() =>
      applySafeRegex(
        `${"a".repeat(30)}!`,
        { pattern: "(a|aa)+$", replacement: "", flags: "" },
        { ...DEFAULT_SAFE_REGEX_LIMITS, maxSteps: 5_000 },
      ),
    ).toThrow(SafeRegexError);
  });

  it("rejects oversized input instead of scanning it", () => {
    expect(() =>
      applySafeRegex(
        "abcdef",
        { pattern: "a", replacement: "", flags: "" },
        { ...DEFAULT_SAFE_REGEX_LIMITS, maxInputLength: 3 },
      ),
    ).toThrow(/exceeds 3 characters/);
  });

  it("rejects oversized patterns", () => {
    expect(() =>
      compileSafeRegex("a".repeat(50), "", { ...DEFAULT_SAFE_REGEX_LIMITS, maxPatternLength: 10 }),
    ).toThrow(/exceeds 10 characters/);
  });

  it("caps the number of matches", () => {
    expect(() =>
      applySafeRegex(
        "a".repeat(20),
        { pattern: "a", replacement: "b", flags: "" },
        { ...DEFAULT_SAFE_REGEX_LIMITS, maxMatches: 5 },
      ),
    ).toThrow(/more than 5 matches/);
  });
});

describe("testSafeRegex", () => {
  it("reports matches without modifying the input", () => {
    expect(testSafeRegex("hello", "ell", "")).toMatchObject({ matched: true, matchCount: 1 });
    expect(testSafeRegex("hello", "xyz", "")).toMatchObject({ matched: false, matchCount: 0 });
  });
});
