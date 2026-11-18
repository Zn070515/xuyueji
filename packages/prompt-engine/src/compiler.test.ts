import { describe, expect, it } from "vitest";

import { compilePrompt, PromptBudgetExceededError, type PromptSources } from "./compiler.js";

const lengthTokens = (text: string): number => text.length;

function sources(overrides: Partial<PromptSources> = {}): PromptSources {
  return {
    platformPolicy: "P",
    character: { name: "A", description: "" },
    userInput: "U",
    closingConstraints: "C",
    ...overrides,
  };
}

describe("prompt compiler determinism", () => {
  it("produces the same plan for the same sources and seed", () => {
    const input = sources({
      presetSections: [{ id: "style", content: "STYLE" }],
      history: [
        { role: "user", content: "old" },
        { role: "assistant", content: "newer" },
      ],
    });
    const first = compilePrompt({
      sources: input,
      budget: { contextWindowTokens: 8000, maxOutputTokens: 1000 },
      seed: 7,
    });
    const second = compilePrompt({
      sources: input,
      budget: { contextWindowTokens: 8000, maxOutputTokens: 1000 },
      seed: 7,
    });

    expect(first.digest).toBe(second.digest);
    expect(first.systemPrompt).toBe(second.systemPrompt);
    expect(first.messages).toEqual(second.messages);
    expect(first.components).toEqual(second.components);
  });

  it("changes the digest when the user input changes", () => {
    const budget = { contextWindowTokens: 8000, maxOutputTokens: 1000 };
    const first = compilePrompt({ sources: sources({ userInput: "one" }), budget });
    const second = compilePrompt({ sources: sources({ userInput: "two" }), budget });
    expect(first.digest).not.toBe(second.digest);
  });
});

describe("prompt order and provenance", () => {
  it("orders components by the documented prompt layout", () => {
    const plan = compilePrompt({
      sources: {
        platformPolicy: "PLATFORM",
        presetSections: [{ id: "style", content: "PRESET", order: 10 }],
        character: { name: "A", description: "CHARACTER" },
        persona: { name: "P", description: "PERSONA" },
        worldInfo: [
          { id: "after", content: "WI_AFTER", position: "after_char", insertionOrder: 1 },
          { id: "before", content: "WI_BEFORE", position: "before_char", insertionOrder: 2 },
        ],
        examples: ["EXAMPLE"],
        history: [{ role: "assistant", content: "HISTORY" }],
        authorNote: "NOTE",
        userInput: "USER",
        closingConstraints: "CLOSING",
      },
      budget: { contextWindowTokens: 8000, maxOutputTokens: 1000 },
    });

    const system = plan.systemPrompt;
    const order = [
      "PLATFORM",
      "PRESET",
      "角色：A",
      "用户人格：P",
      "WI_BEFORE",
      "WI_AFTER",
      "EXAMPLE",
      "NOTE",
      "CLOSING",
    ];
    const indices = order.map((fragment) => system.indexOf(fragment));
    for (let index = 1; index < indices.length; index += 1) {
      expect(indices[index]).toBeGreaterThan(indices[index - 1] ?? -1);
    }
    expect(system).not.toContain("HISTORY");
    expect(system).not.toContain("USER");
    expect(plan.messages.at(-1)).toEqual({ role: "user", content: "USER" });
    expect(plan.messages[0]).toEqual({ role: "assistant", content: "HISTORY" });
  });
});

describe("prompt budget", () => {
  it("keeps the newest history and reports truncation", () => {
    const history = [
      { role: "user" as const, content: "aaaaaaaaaa" },
      { role: "assistant" as const, content: "bbbbbbbbbb" },
      { role: "user" as const, content: "cccccccccc" },
      { role: "assistant" as const, content: "dddddddddd" },
    ];
    const plan = compilePrompt({
      sources: sources({ history }),
      budget: { contextWindowTokens: 80, maxOutputTokens: 30, safetyReserveTokens: 10 },
      estimateTokens: lengthTokens,
    });

    const historyComponents = plan.components.filter((component) => component.kind === "history");
    expect(
      historyComponents.find((component) => component.sourceId === "history:0")?.included,
    ).toBe(false);
    expect(
      historyComponents.find((component) => component.sourceId === "history:3")?.included,
    ).toBe(true);
    expect(plan.messages.map((message) => message.content)).toEqual([
      "bbbbbbbbbb",
      "cccccccccc",
      "dddddddddd",
      "U",
    ]);
    expect(plan.warnings.join(" ")).toMatch(/History truncated: kept 3 of 4/);
  });

  it("rejects mandatory components that exceed the available budget", () => {
    expect(() =>
      compilePrompt({
        sources: sources({ character: { name: "A", description: "0123456789" } }),
        budget: { contextWindowTokens: 70, maxOutputTokens: 50, safetyReserveTokens: 10 },
        estimateTokens: lengthTokens,
      }),
    ).toThrow(PromptBudgetExceededError);
  });

  it("does not confuse identical sourceIds across different component kinds", () => {
    const plan = compilePrompt({
      sources: sources({
        history: [{ role: "user", content: "H" }],
        worldInfo: [{ id: "history:0", content: "WWWWWWWWWW" }],
      }),
      budget: { contextWindowTokens: 70, maxOutputTokens: 50, safetyReserveTokens: 10 },
      estimateTokens: lengthTokens,
    });

    const history = plan.components.find((component) => component.kind === "history");
    const world = plan.components.find((component) => component.kind === "world_info");
    expect(history?.included).toBe(true);
    expect(world?.included).toBe(false);
    expect(plan.messages.map((message) => message.content)).toEqual(["H", "U"]);
  });

  it("marks optional components excluded by the budget", () => {
    const plan = compilePrompt({
      sources: sources({ examples: ["a".repeat(50)] }),
      budget: { contextWindowTokens: 70, maxOutputTokens: 50, safetyReserveTokens: 10 },
      estimateTokens: lengthTokens,
    });
    const examples = plan.components.find((component) => component.kind === "examples");
    expect(examples?.included).toBe(false);
    expect(examples?.reason).toBe("budget");
    expect(plan.warnings.join(" ")).toMatch(/optional prompt component/);
  });
});
