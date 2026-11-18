import { describe, expect, it } from "vitest";

import {
  CharacterCardParseError,
  embeddedUnknownFields,
  parseCharacterCard,
  parseCharacterCardPng,
  serializeCharacterCard,
  serializeCharacterCardPng,
} from "./character-card.js";

const ONE_PIXEL_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  ),
  (character) => character.charCodeAt(0),
);

const v2Card = {
  spec: "chara_card_v2",
  spec_version: "2.0",
  name: "Legacy name",
  description: "Legacy description",
  x_custom_top: { keep: true },
  data: {
    name: "星月书店店主",
    description: "只在月夜开门的书店。",
    personality: "安静",
    scenario: "雨夜",
    first_mes: "你来得正好。",
    mes_example: "{{user}}: 在吗？\n{{char}}: 在。",
    creator_notes: "原创测试角色",
    system_prompt: "保持角色",
    post_history_instructions: "不要出戏",
    alternate_greetings: ["第二句开场白", "第三句开场白"],
    tags: ["书店", "雨夜"],
    creator: "xuyueji",
    character_version: "1.2",
    character_book: { entries: [{ keys: ["雨"] }] },
    extensions: { foo: "bar" },
    x_data_unknown: [1, 2, 3],
  },
};

describe("Character Card V2", () => {
  it("normalizes mapped fields and preserves unknown + embedded lorebook fields", () => {
    const parsed = parseCharacterCard(v2Card);

    expect(parsed.format).toBe("v2");
    expect(parsed.payload.name).toBe("星月书店店主");
    expect(parsed.payload.description).toBe("只在月夜开门的书店。");
    expect(parsed.payload.firstMessage).toBe("你来得正好。");
    expect(parsed.payload.alternateGreetings).toEqual(["第二句开场白", "第三句开场白"]);
    expect(parsed.payload.exampleMessages).toEqual(["{{user}}: 在吗？\n{{char}}: 在。"]);
    expect(parsed.payload.extensions?.foo).toBe("bar");
    expect(parsed.warnings.join(" ")).toMatch(/character_book/);

    const unknown = embeddedUnknownFields(parsed.payload);
    expect(unknown?.data.creator).toBe("xuyueji");
    expect(unknown?.data.character_version).toBe("1.2");
    expect(unknown?.data.character_book).toEqual({ entries: [{ keys: ["雨"] }] });
    expect(unknown?.data.x_data_unknown).toEqual([1, 2, 3]);
    expect(unknown?.topLevel.x_custom_top).toEqual({ keep: true });
  });

  it("round-trips unknown fields and re-normalizes edited payload fields", () => {
    const parsed = parseCharacterCard(v2Card);
    const exported = serializeCharacterCard(
      { ...parsed.payload, description: "编辑后的设定" },
      { format: "v2" },
    );

    expect(exported.spec).toBe("chara_card_v2");
    const data = exported.data as Record<string, unknown>;
    expect(data.description).toBe("编辑后的设定");
    expect(data.creator).toBe("xuyueji");
    expect(data.character_version).toBe("1.2");
    expect(data.character_book).toEqual({ entries: [{ keys: ["雨"] }] });
    expect(data.x_data_unknown).toEqual([1, 2, 3]);
    expect((data.extensions as Record<string, unknown>).foo).toBe("bar");
    expect(exported.x_custom_top).toEqual({ keep: true });

    const reparsed = parseCharacterCard(exported);
    expect(reparsed.payload.description).toBe("编辑后的设定");
    expect(reparsed.payload.alternateGreetings).toEqual(parsed.payload.alternateGreetings);
  });

  it("accepts legacy flat cards with a warning", () => {
    const parsed = parseCharacterCard({
      name: "旧卡",
      description: "旧格式",
      first_mes: "你好",
    });
    expect(parsed.format).toBe("v2");
    expect(parsed.payload.name).toBe("旧卡");
    expect(parsed.warnings.join(" ")).toMatch(/Legacy flat/);
  });

  it("rejects cards without a name", () => {
    expect(() => parseCharacterCard({ spec: "chara_card_v2", data: {} })).toThrow(
      CharacterCardParseError,
    );
  });
});

describe("Character Card V3", () => {
  it("preserves V3-only fields for round-trip", () => {
    const v3 = {
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: {
        name: "V3 角色",
        description: "第三版",
        nickname: "小月",
        source: ["https://example.com"],
        group_only_greetings: ["群聊开场"],
        assets: [{ type: "icon", uri: "ccdefault:", name: "main" }],
        creation_date: 1763510400,
        modification_date: 1763510400,
      },
    };

    const parsed = parseCharacterCard(v3);
    expect(parsed.format).toBe("v3");
    const unknown = embeddedUnknownFields(parsed.payload);
    expect(unknown?.data.nickname).toBe("小月");
    expect(unknown?.data.assets).toEqual(v3.data.assets);
    expect(unknown?.data.group_only_greetings).toEqual(["群聊开场"]);

    const exported = serializeCharacterCard(parsed.payload, { format: "v3" });
    expect(exported.spec).toBe("chara_card_v3");
    const data = exported.data as Record<string, unknown>;
    expect(data.nickname).toBe("小月");
    expect(data.source).toEqual(["https://example.com"]);
    expect(data.creation_date).toBe(1763510400);
  });
});

describe("Character Card PNG", () => {
  it("injects and reads a V2 card chunk", () => {
    const parsed = parseCharacterCard(v2Card);
    const png = serializeCharacterCardPng(ONE_PIXEL_PNG, parsed.payload, "v2");
    expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

    const readBack = parseCharacterCardPng(png);
    expect(readBack.payload.name).toBe("星月书店店主");
    expect(embeddedUnknownFields(readBack.payload)?.data.creator).toBe("xuyueji");
  });

  it("replaces an existing card chunk and supports V3", () => {
    const parsed = parseCharacterCard(v2Card);
    const pngV2 = serializeCharacterCardPng(ONE_PIXEL_PNG, parsed.payload, "v2");
    const pngV3 = serializeCharacterCardPng(pngV2, { ...parsed.payload, name: "V3 替换" }, "v3");
    const readBack = parseCharacterCardPng(pngV3);
    expect(readBack.format).toBe("v3");
    expect(readBack.payload.name).toBe("V3 替换");
  });

  it("rejects non-PNG input", () => {
    expect(() => parseCharacterCardPng(Uint8Array.from([1, 2, 3, 4]))).toThrow(/PNG/);
  });
});
