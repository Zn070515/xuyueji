import {
  createMockPaymentProvider,
  createPaymentOrder,
  createWallet,
  type LedgerEntry,
  type MockPaymentProvider,
  type PaymentOrder,
  type Wallet,
} from "@xuyueji/billing";
import type { CharacterPayloadDto, DemoCharacterVersionResponse } from "@xuyueji/contracts";
import {
  addCharacterVersion,
  asCharacterId,
  asCharacterVersionId,
  asLedgerEntryId,
  asPaymentOrderId,
  asUserId,
  type Character,
  createCharacter,
  createSequentialIdGenerator,
  createUlidIdGenerator,
  type IdGenerator,
  NotFoundError,
} from "@xuyueji/domain";

const demoOwnerId = asUserId("user_demo_owner");
const demoCharacterId = asCharacterId("character_demo");
const demoVersionId = asCharacterVersionId("character_version_demo_1");
const demoCreatedAt = "2026-11-18T00:00:00.000Z";

export interface DemoCharacterVersionState {
  readonly character: Character;
  readonly processedRequests: ReadonlyMap<string, DemoCharacterVersionResponse>;
}

export interface DemoPaymentState {
  readonly order: PaymentOrder;
  readonly wallet: Wallet;
  readonly ledger: readonly LedgerEntry[];
  readonly provider: MockPaymentProvider;
}

export interface DemoStore {
  readonly ids: IdGenerator;
  character: DemoCharacterVersionState;
  payment: DemoPaymentState;
}

function createDemoCharacter(): Character {
  return createCharacter({
    id: demoCharacterId,
    ownerId: demoOwnerId,
    versionId: demoVersionId,
    payload: {
      name: "星月书店店主",
      description:
        "原创演示角色。她守着一间只在月夜开门的旧书店，记得每一位客人的故事。此角色仅用于展示界面，不包含任何真实用户数据。",
      personality: "安静、好奇，偶尔用书页里的句子回答问题。",
      scenario: "雨夜，书店的铜铃响了一声。",
      firstMessage: "你来得正好。今晚的书架，好像又多了几本没见过的书。",
      tags: ["演示", "原创", "书店"],
    },
    createdAt: demoCreatedAt,
  }).character;
}

function createDemoPayment(secret: string): DemoPaymentState {
  const provider = createMockPaymentProvider(secret);
  return {
    provider,
    order: createPaymentOrder({
      id: asPaymentOrderId("order_demo_1"),
      merchantTradeNo: "XYJ20261118000001",
      ownerId: demoOwnerId,
      amountFen: 600,
      points: 60,
      createdAt: demoCreatedAt,
    }),
    wallet: createWallet(demoOwnerId),
    ledger: [],
  };
}

export function createDemoStore(mockPaymentSecret: string): DemoStore {
  return {
    ids: process.env.NODE_ENV === "test" ? createSequentialIdGenerator() : createUlidIdGenerator(),
    character: {
      character: createDemoCharacter(),
      processedRequests: new Map(),
    },
    payment: createDemoPayment(mockPaymentSecret),
  };
}

export function applyDemoCharacterVersion(
  store: DemoStore,
  input: {
    readonly characterId: string;
    readonly requestId: string;
    readonly expectedActiveVersionId: string;
    readonly payload: CharacterPayloadDto;
  },
): DemoCharacterVersionResponse {
  const processed = store.character.processedRequests.get(input.requestId);
  if (processed) {
    return processed;
  }

  if (input.characterId !== store.character.character.id) {
    throw new NotFoundError("Demo character not found.", {
      characterId: input.characterId,
    });
  }

  const result = addCharacterVersion(store.character.character, {
    expectedActiveVersionId: asCharacterVersionId(input.expectedActiveVersionId),
    versionId: asCharacterVersionId(store.ids.next("character_version")),
    payload: input.payload,
    createdAt: new Date().toISOString(),
  });

  store.character = {
    character: result.character,
    processedRequests: new Map(store.character.processedRequests).set(input.requestId, {
      demo: true,
      characterId: result.character.id,
      activeVersionId: result.character.activeVersionId,
      versionRevision: result.version.revision,
      versionCount: result.character.versions.length,
    }),
  };

  const response = store.character.processedRequests.get(input.requestId);
  if (!response) {
    throw new Error("Failed to record demo character response.");
  }
  return response;
}

export function nextDemoLedgerId(store: DemoStore): LedgerEntry["id"] {
  return asLedgerEntryId(store.ids.next("ledger"));
}
