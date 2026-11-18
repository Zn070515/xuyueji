import type { CharacterPayload } from "@xuyueji/domain";

const RESERVED_UNKNOWN_KEY = "__xuyueji_card_unknown";
const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

export type CharacterCardFormat = "v2" | "v3";

export interface CardUnknownFields {
  readonly topLevel: Record<string, unknown>;
  readonly data: Record<string, unknown>;
}

export interface ParsedCharacterCard {
  readonly payload: CharacterPayload;
  readonly format: CharacterCardFormat;
  readonly specVersion: string;
  readonly warnings: readonly string[];
  readonly rawUnknown: CardUnknownFields;
}

export class CharacterCardParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CharacterCardParseError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string");
}

// Fields we normalize into CharacterPayload. Everything else (including
// creator, character_version, character_book and V3-only fields such as
// nickname/assets) is preserved in rawUnknown for round-trip.
const MAPPED_DATA_FIELDS = new Set([
  "name",
  "description",
  "personality",
  "scenario",
  "first_mes",
  "mes_example",
  "creator_notes",
  "system_prompt",
  "post_history_instructions",
  "alternate_greetings",
  "tags",
  "extensions",
]);

const TOP_LEVEL_LEGACY_FIELDS = new Set([
  "name",
  "description",
  "personality",
  "scenario",
  "first_mes",
  "mes_example",
  "creator_notes",
  "system_prompt",
  "post_history_instructions",
  "alternate_greetings",
  "tags",
]);

function splitUnknown(
  values: Record<string, unknown>,
  known: ReadonlySet<string>,
): Record<string, unknown> {
  const unknown: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!known.has(key)) {
      unknown[key] = value;
    }
  }
  return unknown;
}

function buildPayload(
  data: Record<string, unknown>,
  unknown: CardUnknownFields,
  warnings: string[],
): CharacterPayload {
  const name = text(data.name)?.trim();
  if (!name) {
    throw new CharacterCardParseError("Character card is missing a non-empty name.");
  }

  const extensions = isRecord(data.extensions) ? { ...data.extensions } : {};
  extensions[RESERVED_UNKNOWN_KEY] = unknown;

  if (data.character_book !== undefined) {
    warnings.push("character_book is preserved as an unknown field; lorebook activation is M2+.");
  }

  const example = text(data.mes_example);
  return {
    name,
    description: text(data.description) ?? "",
    ...(text(data.personality) !== undefined ? { personality: text(data.personality) } : {}),
    ...(text(data.scenario) !== undefined ? { scenario: text(data.scenario) } : {}),
    ...(text(data.first_mes) !== undefined ? { firstMessage: text(data.first_mes) } : {}),
    ...(example !== undefined && example.length > 0 ? { exampleMessages: [example] } : {}),
    ...(text(data.system_prompt) !== undefined ? { systemPrompt: text(data.system_prompt) } : {}),
    ...(text(data.post_history_instructions) !== undefined
      ? { postHistoryInstructions: text(data.post_history_instructions) }
      : {}),
    ...(stringArray(data.alternate_greetings) !== undefined
      ? { alternateGreetings: stringArray(data.alternate_greetings) }
      : {}),
    ...(stringArray(data.tags) !== undefined ? { tags: stringArray(data.tags) } : {}),
    ...(text(data.creator_notes) !== undefined ? { creatorNotes: text(data.creator_notes) } : {}),
    extensions,
  };
}

export function parseCharacterCard(input: unknown): ParsedCharacterCard {
  if (!isRecord(input)) {
    throw new CharacterCardParseError("Character card must be a JSON object.");
  }

  const spec = text(input.spec);
  const warnings: string[] = [];
  let format: CharacterCardFormat;
  let specVersion: string;
  let data: Record<string, unknown>;

  if (spec === "chara_card_v2" || spec === "chara_card_v3") {
    format = spec === "chara_card_v3" ? "v3" : "v2";
    specVersion = text(input.spec_version) ?? (format === "v3" ? "3.0" : "2.0");
    if (!isRecord(input.data)) {
      throw new CharacterCardParseError("Character card data must be an object.");
    }
    data = input.data;
  } else if (text(input.name)) {
    // Legacy V1 flat cards are accepted as V2 input with an explicit warning.
    warnings.push("Legacy flat character card parsed as V2; re-export will use the V2 envelope.");
    format = "v2";
    specVersion = "2.0";
    data = input;
  } else {
    throw new CharacterCardParseError("Unsupported character card spec.");
  }

  const knownData = MAPPED_DATA_FIELDS;
  const rawUnknown: CardUnknownFields = {
    topLevel: splitUnknown(
      input,
      new Set(["spec", "spec_version", "data", ...TOP_LEVEL_LEGACY_FIELDS]),
    ),
    data: splitUnknown(data, knownData),
  };

  if (Object.keys(rawUnknown.data).length > 0) {
    warnings.push(
      `Preserved ${Object.keys(rawUnknown.data).length} unrecognized data field(s) for round-trip.`,
    );
  }
  if (Object.keys(rawUnknown.topLevel).length > 0) {
    warnings.push(
      `Preserved ${Object.keys(rawUnknown.topLevel).length} unrecognized top-level field(s) for round-trip.`,
    );
  }

  return {
    payload: buildPayload(data, rawUnknown, warnings),
    format,
    specVersion,
    warnings,
    rawUnknown,
  };
}

export function embeddedUnknownFields(payload: CharacterPayload): CardUnknownFields | null {
  const value = payload.extensions?.[RESERVED_UNKNOWN_KEY];
  if (!isRecord(value)) {
    return null;
  }
  return {
    topLevel: isRecord(value.topLevel) ? value.topLevel : {},
    data: isRecord(value.data) ? value.data : {},
  };
}

function payloadExtensions(payload: CharacterPayload): Record<string, unknown> {
  const extensions = { ...(payload.extensions ?? {}) };
  delete extensions[RESERVED_UNKNOWN_KEY];
  return extensions;
}

export interface SerializeCharacterCardOptions {
  readonly format: CharacterCardFormat;
  readonly rawUnknown?: CardUnknownFields;
}

export function serializeCharacterCard(
  payload: CharacterPayload,
  options: SerializeCharacterCardOptions,
): Record<string, unknown> {
  const rawUnknown = options.rawUnknown ??
    embeddedUnknownFields(payload) ?? { topLevel: {}, data: {} };

  const previousExtensions = isRecord(rawUnknown.data.extensions) ? rawUnknown.data.extensions : {};
  const knownData: Record<string, unknown> = {
    name: payload.name,
    description: payload.description,
    personality: payload.personality ?? "",
    scenario: payload.scenario ?? "",
    first_mes: payload.firstMessage ?? "",
    mes_example: payload.exampleMessages?.join("\n") ?? "",
    creator_notes: payload.creatorNotes ?? "",
    system_prompt: payload.systemPrompt ?? "",
    post_history_instructions: payload.postHistoryInstructions ?? "",
    alternate_greetings: [...(payload.alternateGreetings ?? [])],
    tags: [...(payload.tags ?? [])],
    creator: text(rawUnknown.data.creator) ?? "",
    character_version: text(rawUnknown.data.character_version) ?? "",
    extensions: { ...previousExtensions, ...payloadExtensions(payload) },
  };

  // Preserve V3-only known fields (nickname, assets, dates, etc.) without
  // letting unknown data overwrite the normalized payload fields above.
  const data: Record<string, unknown> = { ...rawUnknown.data, ...knownData };

  const card: Record<string, unknown> = {
    ...rawUnknown.topLevel,
    spec: options.format === "v3" ? "chara_card_v3" : "chara_card_v2",
    spec_version: options.format === "v3" ? "3.0" : "2.0",
    data,
  };

  // Common readers still look at the legacy top-level fields.
  for (const key of [
    "name",
    "description",
    "personality",
    "scenario",
    "first_mes",
    "mes_example",
    "tags",
  ] as const) {
    card[key] = data[key];
  }

  return card;
}

/* ------------------------------------------------------------------ */
/* PNG text-chunk support                                              */
/* ------------------------------------------------------------------ */

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function ascii(value: string): Uint8Array {
  return Uint8Array.from(value, (character) => character.charCodeAt(0) & 0xff);
}

function fromAscii(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

interface PngChunk {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly data: Uint8Array;
}

function readChunks(bytes: Uint8Array): PngChunk[] {
  if (bytes.length < PNG_SIGNATURE.length) {
    throw new CharacterCardParseError("File is too short to be a PNG.");
  }
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) {
      throw new CharacterCardParseError("File is not a PNG.");
    }
  }

  const chunks: PngChunk[] = [];
  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    if (offset + 12 + length > bytes.length) {
      throw new CharacterCardParseError("PNG chunk length exceeds file size.");
    }
    const type = fromAscii(bytes.subarray(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const data = bytes.subarray(dataStart, dataStart + length);
    chunks.push({ type, start: offset, end: dataStart + length + 4, data });
    offset = dataStart + length + 4;
    if (type === "IEND") {
      break;
    }
  }
  return chunks;
}

function decodeTextChunk(
  type: string,
  data: Uint8Array,
): {
  keyword: string;
  text: string;
} | null {
  if (type === "tEXt") {
    const nul = data.indexOf(0);
    if (nul <= 0) {
      return null;
    }
    return {
      keyword: fromAscii(data.subarray(0, nul)),
      text: fromAscii(data.subarray(nul + 1)),
    };
  }

  if (type === "iTXt") {
    const keywordEnd = data.indexOf(0);
    if (keywordEnd <= 0) {
      return null;
    }
    let offset = keywordEnd + 1;
    const compressionFlag = data[offset] ?? 0;
    offset += 1;
    const compressionMethod = data[offset] ?? 0;
    offset += 1;
    if (compressionFlag !== 0 || compressionMethod !== 0) {
      // Compressed iTXt needs an async inflater. tEXt is the common V2 path.
      return null;
    }
    const languageEnd = data.indexOf(0, offset);
    if (languageEnd < 0) {
      return null;
    }
    offset = languageEnd + 1;
    const translatedEnd = data.indexOf(0, offset);
    if (translatedEnd < 0) {
      return null;
    }
    offset = translatedEnd + 1;
    return {
      keyword: fromAscii(data.subarray(0, keywordEnd)),
      text: new TextDecoder("utf-8").decode(data.subarray(offset)),
    };
  }

  return null;
}

function parseTextPayload(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // V2 cards normally store base64-encoded JSON in tEXt chunks.
    try {
      const decoded = new TextDecoder("utf-8").decode(base64ToBytes(text));
      return JSON.parse(decoded);
    } catch {
      throw new CharacterCardParseError(
        "Character card PNG text chunk is neither JSON nor base64 JSON.",
      );
    }
  }
}

export function parseCharacterCardPng(bytes: Uint8Array): ParsedCharacterCard {
  const chunks = readChunks(bytes);
  const candidates = new Map<string, string>();

  for (const chunk of chunks) {
    const decoded = decodeTextChunk(chunk.type, chunk.data);
    if (!decoded) {
      continue;
    }
    if (decoded.keyword === "chara" || decoded.keyword === "ccv3") {
      candidates.set(decoded.keyword, decoded.text);
    }
  }

  const textPayload = candidates.get("ccv3") ?? candidates.get("chara");
  if (!textPayload) {
    throw new CharacterCardParseError(
      "PNG does not contain a chara/ccv3 character card text chunk.",
    );
  }

  return parseCharacterCard(parseTextPayload(textPayload));
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  writeUint32(chunk, 0, data.length);
  chunk.set(ascii(type), 4);
  chunk.set(data, 8);
  const crcInput = new Uint8Array(4 + data.length);
  crcInput.set(ascii(type), 0);
  crcInput.set(data, 4);
  writeUint32(chunk, 8 + data.length, crc32(crcInput));
  return chunk;
}

export function serializeCharacterCardPng(
  pngBytes: Uint8Array,
  payload: CharacterPayload,
  format: CharacterCardFormat,
): Uint8Array {
  const chunks = readChunks(pngBytes);
  if (chunks.length === 0 || chunks.at(-1)?.type !== "IEND") {
    throw new CharacterCardParseError("PNG is missing IEND.");
  }

  const card = serializeCharacterCard(payload, { format });
  const json = JSON.stringify(card);
  const keyword = format === "v3" ? "ccv3" : "chara";
  const text = bytesToBase64(new TextEncoder().encode(json));
  const data = new Uint8Array(keyword.length + 1 + text.length);
  data.set(ascii(keyword), 0);
  data[keyword.length] = 0;
  data.set(ascii(text), keyword.length + 1);
  const cardChunk = makeChunk("tEXt", data);

  const pieces: Uint8Array[] = [PNG_SIGNATURE];
  for (const chunk of chunks) {
    const original = pngBytes.subarray(chunk.start, chunk.end);
    const decoded =
      chunk.type === "tEXt" || chunk.type === "iTXt"
        ? decodeTextChunk(chunk.type, chunk.data)
        : null;
    if (decoded && (decoded.keyword === "chara" || decoded.keyword === "ccv3")) {
      continue;
    }
    if (chunk.type === "IEND") {
      pieces.push(cardChunk, original);
    } else {
      pieces.push(original);
    }
  }

  const total = pieces.reduce((sum, piece) => sum + piece.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const piece of pieces) {
    output.set(piece, offset);
    offset += piece.length;
  }
  return output;
}
