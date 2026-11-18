import { ulid } from "ulid";

import { brandValue } from "./brand.js";

export type UserId = ReturnType<typeof asUserId>;
export type CharacterId = ReturnType<typeof asCharacterId>;
export type CharacterVersionId = ReturnType<typeof asCharacterVersionId>;
export type ConversationId = ReturnType<typeof asConversationId>;
export type MessageId = ReturnType<typeof asMessageId>;
export type ResponseGroupId = ReturnType<typeof asResponseGroupId>;
export type BranchId = ReturnType<typeof asBranchId>;
export type GenerationRunId = ReturnType<typeof asGenerationRunId>;
export type WalletId = ReturnType<typeof asWalletId>;
export type LedgerEntryId = ReturnType<typeof asLedgerEntryId>;
export type PaymentOrderId = ReturnType<typeof asPaymentOrderId>;
export type RefundId = ReturnType<typeof asRefundId>;

export const asUserId = (value: string) => brandValue(value, "UserId");
export const asCharacterId = (value: string) => brandValue(value, "CharacterId");
export const asCharacterVersionId = (value: string) => brandValue(value, "CharacterVersionId");
export const asConversationId = (value: string) => brandValue(value, "ConversationId");
export const asMessageId = (value: string) => brandValue(value, "MessageId");
export const asResponseGroupId = (value: string) => brandValue(value, "ResponseGroupId");
export const asBranchId = (value: string) => brandValue(value, "BranchId");
export const asGenerationRunId = (value: string) => brandValue(value, "GenerationRunId");
export const asWalletId = (value: string) => brandValue(value, "WalletId");
export const asLedgerEntryId = (value: string) => brandValue(value, "LedgerEntryId");
export const asPaymentOrderId = (value: string) => brandValue(value, "PaymentOrderId");
export const asRefundId = (value: string) => brandValue(value, "RefundId");

export type EntityKind =
  | "user"
  | "character"
  | "character_version"
  | "conversation"
  | "message"
  | "response_group"
  | "branch"
  | "run"
  | "wallet"
  | "ledger"
  | "order"
  | "refund";

export interface IdGenerator {
  next(kind: EntityKind): string;
}

/**
 * ULIDs are lexicographically sortable by creation time. The kind prefix is
 * for human debugging only; it is not a security boundary.
 */
export function createUlidIdGenerator(): IdGenerator {
  return {
    next(kind) {
      return `${kind}_${ulid()}`;
    },
  };
}

/** Deterministic generator for tests. Never use in production. */
export function createSequentialIdGenerator(prefix = "test"): IdGenerator {
  let counter = 0;
  return {
    next(kind) {
      counter += 1;
      return `${kind}_${prefix}_${String(counter).padStart(6, "0")}`;
    },
  };
}
