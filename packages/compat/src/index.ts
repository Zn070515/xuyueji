/**
 * Character Card V2/V3, world book, preset, chat JSONL and DeepSeek ZIP
 * compatibility adapters.
 *
 * M0 status: planning types only. Import must eventually treat every file as
 * untrusted input (size limits, zip-slip defence, no script execution) and keep
 * unknown extension fields for round-trip export.
 */

export type CompatSourceFormat =
  | "character-card-v2-json"
  | "character-card-v3-json"
  | "character-card-v3-png"
  | "worldbook-json"
  | "chat-jsonl"
  | "deepseek-zip"
  | "xuyueji-export-zip";

export interface ImportReport {
  readonly sourceFormat: CompatSourceFormat;
  readonly sourceDigest: string;
  readonly normalizedEntityCount: number;
  readonly unknownFieldCount: number;
  readonly warnings: readonly string[];
  readonly rejected: boolean;
}

export const COMPAT_STATUS = {
  gate: "M2",
  implemented: [] as const,
  planned: [
    "v2-v3-json",
    "v3-png-text-chunks",
    "embedded-lorebook",
    "unknown-extension-round-trip",
    "jsonl-chat-import",
    "deepseek-zip-probe",
    "zip-slip-and-bomb-limits",
  ],
} as const;
