import { describe, expect, it } from "vitest";

import { type MemoryItem, memoryTerms, selectMemories } from "./memory.js";

function memory(overrides: Partial<MemoryItem> & Pick<MemoryItem, "id">): MemoryItem {
  return {
    kind: "manual_fact",
    content: `memory-${overrides.id}`,
    conversationId: null,
    scope: "conversation",
    locked: false,
    updatedAt: "2026-11-18T00:00:00.000Z",
    ...overrides,
  };
}

const limits = { maxItems: 5, maxBytes: 10_000, maxTokens: 2_000 };

describe("memoryTerms", () => {
  it("extracts ascii words and CJK bigrams deterministically", () => {
    expect(memoryTerms("Rainy Bookstore 雨夜书店")).toEqual([
      "rainy",
      "bookstore",
      "雨",
      "夜",
      "书",
      "店",
      "雨夜",
      "夜书",
      "书店",
    ]);
  });
});

describe("selectMemories", () => {
  it("ranks lexical matches above global filler and keeps provenance", () => {
    const result = selectMemories(
      [
        memory({ id: "global", content: "世界观：这是一个被月亮统治的大陆。", scope: "global" }),
        memory({ id: "match", content: "雨夜书店会亮起铜灯，店主叫阿岚。" }),
        memory({ id: "off", content: "完全无关的天气记录。" }),
      ],
      { query: "雨夜的书店", conversationId: null, limits },
    );
    expect(result.selected.map((item) => item.item.id)).toEqual(["match", "global"]);
    expect(result.selected[0]?.reason).toBe("keyword");
    expect(result.selected[0]?.matchedTerms).toEqual(expect.arrayContaining(["雨夜", "书店"]));
    expect(result.selected[1]?.reason).toBe("recent");
    expect(result.skipped).toContainEqual({ id: "off", reason: "no-match" });
  });

  it("always includes locked memories first", () => {
    const result = selectMemories(
      [
        memory({ id: "locked", content: "锁定事实：主角怕水。", locked: true }),
        memory({ id: "hit", content: "主角喜欢游泳。" }),
      ],
      { query: "游泳", conversationId: null, limits },
    );
    expect(result.selected.map((item) => item.item.id)).toEqual(["locked", "hit"]);
    expect(result.selected[0]?.reason).toBe("locked");
  });

  it("excludes memories from other conversations", () => {
    const result = selectMemories(
      [
        memory({ id: "here", content: "这场雨很大。", conversationId: "conversation-a" }),
        memory({ id: "elsewhere", content: "这场雨也很大。", conversationId: "conversation-b" }),
      ],
      { query: "雨", conversationId: "conversation-a", limits },
    );
    expect(result.selected.map((item) => item.item.id)).toEqual(["here"]);
    expect(result.skipped).toContainEqual({ id: "elsewhere", reason: "other-conversation" });
  });

  it("respects item, token and byte budgets", () => {
    const items = Array.from({ length: 6 }, (_value, index) =>
      memory({ id: `m${index}`, content: `雨夜第${index}条记忆`, locked: true }),
    );
    const result = selectMemories(items, {
      query: "雨夜",
      conversationId: null,
      limits: { maxItems: 2, maxBytes: 1_000, maxTokens: 1_000 },
    });
    expect(result.selected).toHaveLength(2);
    expect(result.skipped.filter((item) => item.reason === "budget")).toHaveLength(4);
  });

  it("is reproducible for the same inputs", () => {
    const items = [
      memory({ id: "a", content: "雨夜书店", updatedAt: "2026-11-18T01:00:00.000Z" }),
      memory({ id: "b", content: "雨夜书店", updatedAt: "2026-11-18T01:00:00.000Z" }),
    ];
    const first = selectMemories(items, { query: "雨夜", conversationId: null, limits });
    const second = selectMemories(items, { query: "雨夜", conversationId: null, limits });
    expect(second).toEqual(first);
  });
});
