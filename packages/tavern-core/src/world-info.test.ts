import { describe, expect, it } from "vitest";

import type { WorldInfoEntry } from "./index.js";
import { matchWorldInfo, type WorldInfoLimits } from "./world-info.js";

const limits: WorldInfoLimits = {
  maxDepth: 4,
  maxEntries: 20,
  maxBytes: 100_000,
  maxTokens: 20_000,
};

function entry(overrides: Partial<WorldInfoEntry> & Pick<WorldInfoEntry, "id">): WorldInfoEntry {
  return {
    bookId: "book",
    content: `content-${overrides.id}`,
    enabled: true,
    constant: false,
    keys: [],
    secondaryKeys: [],
    caseSensitive: false,
    probability: 1,
    insertionOrder: 0,
    position: "before_char",
    depth: 0,
    scanDepth: 4,
    recursive: false,
    ...overrides,
  };
}

function run(
  entries: WorldInfoEntry[],
  context: { scanTexts?: string[]; userInput?: string; seed?: number } = {},
  customLimits: Partial<WorldInfoLimits> = {},
) {
  return matchWorldInfo(
    entries,
    {
      scanTexts: context.scanTexts ?? [],
      userInput: context.userInput ?? "",
      seed: context.seed ?? 1,
    },
    { ...limits, ...customLimits },
  );
}

describe("world info keywords", () => {
  it("matches primary and secondary keys case-insensitively", () => {
    const result = run(
      [
        entry({
          id: "rain-bookstore",
          keys: ["Rain", "store"],
          secondaryKeys: ["night"],
          content: "雨夜书店",
        }),
      ],
      { userInput: "The RAIN fell near the store at night." },
    );
    expect(result.activated.map((item) => item.entry.id)).toEqual(["rain-bookstore"]);
    expect(result.activated[0]?.matchedKeys).toEqual(
      expect.arrayContaining(["Rain", "store", "night"]),
    );
  });

  it("respects word boundaries for ASCII keys", () => {
    const entries = [entry({ id: "cat", keys: ["cat"] })];
    expect(run(entries, { userInput: "concatenate" }).activated).toHaveLength(0);
    expect(run(entries, { userInput: "a cat sat" }).activated).toHaveLength(1);
  });

  it("honors per-entry scan depth", () => {
    const oldOnly = entry({ id: "old", keys: ["雨"], scanDepth: 1 });
    const context = { scanTexts: ["很久以前下着雨", "今天晴"], userInput: "你好" };
    expect(run([oldOnly], context).activated).toHaveLength(0);
    expect(run([{ ...oldOnly, scanDepth: 2 }], context).activated).toHaveLength(1);
  });

  it("activates constant entries and skips disabled ones", () => {
    const result = run(
      [
        entry({ id: "always", constant: true, content: "常驻" }),
        entry({ id: "off", enabled: false, keys: ["雨"] }),
      ],
      { userInput: "雨" },
    );
    expect(result.activated.map((item) => item.entry.id)).toEqual(["always"]);
    expect(
      result.skipped.some((item) => item.entryId === "off" && item.reason === "disabled"),
    ).toBe(true);
  });
});

describe("world info recursion and budgets", () => {
  it("terminates A ↔ B recursion and records the already-activated skip", () => {
    const result = run(
      [
        entry({ id: "a", keys: ["雨"], content: "铜铃", recursive: true }),
        entry({ id: "b", keys: ["铜铃"], content: "雨", recursive: true }),
      ],
      { userInput: "下雨了", seed: 7 },
      { maxDepth: 6 },
    );

    expect(result.activated.map((item) => item.entry.id)).toEqual(["a", "b"]);
    expect(result.activated.map((item) => item.depth)).toEqual([0, 1]);
    expect(
      result.skipped.some((item) => item.entryId === "a" && item.reason === "already-activated"),
    ).toBe(true);
  });

  it("stops at max depth and warns instead of looping forever", () => {
    const result = run(
      [
        entry({ id: "a", constant: true, content: "b-trigger", recursive: true }),
        entry({ id: "b", keys: ["b-trigger"], content: "c-trigger", recursive: true }),
        entry({ id: "c", keys: ["c-trigger"], content: "c-trigger", recursive: true }),
      ],
      { userInput: "start" },
      { maxDepth: 1 },
    );
    expect(result.activated.map((item) => item.entry.id)).toContain("b");
    expect(result.warnings.join(" ")).toMatch(/max depth/);
  });

  it("enforces max entries and token budgets", () => {
    const result = run(
      [
        entry({ id: "one", keys: ["雨"], content: "one" }),
        entry({ id: "two", keys: ["雨"], content: "two" }),
      ],
      { userInput: "雨" },
      { maxEntries: 1 },
    );
    expect(result.activated).toHaveLength(1);
    expect(result.skipped.some((item) => item.reason === "budget")).toBe(true);

    const tooBig = entry({ id: "big", keys: ["雨"], content: "x".repeat(1000) });
    const tokenLimited = run([tooBig], { userInput: "雨" }, { maxTokens: 1 });
    expect(tokenLimited.activated).toHaveLength(0);
    expect(tokenLimited.skipped.some((item) => item.reason === "budget")).toBe(true);
  });
});

describe("world info determinism", () => {
  it("makes probability rolls reproducible for the same seed", () => {
    const entries = Array.from({ length: 8 }, (_, index) =>
      entry({
        id: `p-${index}`,
        keys: ["雨"],
        probability: 0.5,
        insertionOrder: index,
      }),
    );

    const first = run(entries, { userInput: "雨", seed: 42 });
    const second = run(entries, { userInput: "雨", seed: 42 });
    expect(first.activated.map((item) => item.entry.id)).toEqual(
      second.activated.map((item) => item.entry.id),
    );
    expect(first.trace).toEqual(second.trace);
  });

  it("activates regex-triggered entries through the safe engine", () => {
    const result = run(
      [
        entry({
          id: "regex",
          matchMode: "regex",
          regexPattern: "雨夜|铜灯",
          regexFlags: "",
          content: "雨夜书店",
        }),
        entry({
          id: "regex-miss",
          matchMode: "regex",
          regexPattern: "雪天",
          content: "雪天书单",
        }),
      ],
      { userInput: "今晚是雨夜。" },
    );
    expect(result.activated.map((item) => item.entry.id)).toEqual(["regex"]);
    expect(result.activated[0]?.matchedKeys).toEqual(["雨夜|铜灯"]);
    expect(result.skipped).toContainEqual({ entryId: "regex-miss", reason: "no-keyword" });
  });

  it("still requires secondary keys for regex entries", () => {
    const result = run(
      [
        entry({
          id: "gated",
          matchMode: "regex",
          regexPattern: "雨夜",
          secondaryKeys: ["书店"],
          content: "雨夜书店",
        }),
      ],
      { userInput: "雨夜的风很冷。" },
    );
    expect(result.activated).toHaveLength(0);
  });

  it("skips regex entries with an invalid pattern and reports a warning", () => {
    const result = run(
      [
        entry({
          id: "broken",
          matchMode: "regex",
          regexPattern: "(a+)+$",
          content: "不该出现",
        }),
      ],
      { userInput: "aaaa" },
    );
    expect(result.activated).toHaveLength(0);
    expect(result.skipped).toContainEqual({ entryId: "broken", reason: "invalid-regex" });
    expect(result.warnings.join(" ")).toMatch(/invalid regex/);
  });

  it("orders activated entries by position then insertion order", () => {
    const result = run(
      [
        entry({ id: "later", keys: ["雨"], position: "after_char", insertionOrder: 1 }),
        entry({ id: "early", keys: ["雨"], position: "before_char", insertionOrder: 5 }),
        entry({ id: "same-position", keys: ["雨"], position: "before_char", insertionOrder: 2 }),
      ],
      { userInput: "雨" },
    );
    expect(result.activated.map((item) => item.entry.id)).toEqual([
      "same-position",
      "early",
      "later",
    ]);
  });
});
