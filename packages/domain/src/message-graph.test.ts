import { describe, expect, it } from "vitest";
import { asBranchId, asConversationId, asMessageId, asResponseGroupId, asUserId } from "./ids.js";
import {
  appendAssistantCandidate,
  appendMessage,
  createConversation,
  editMessageAsNewBranch,
  getBranch,
  getNode,
  selectAssistantCandidate,
  tombstoneMessage,
  VersionConflictError,
} from "./index.js";

const branchId = asBranchId("branch_main");
const userMessageId = asMessageId("message_user_1");
const candidateOneId = asMessageId("message_assistant_1");
const candidateTwoId = asMessageId("message_assistant_2");
const groupOne = asResponseGroupId("group_assistant_1");
const userGroup = asResponseGroupId("group_user_1");
const userActor = { kind: "user", id: "user_owner" } as const;
const characterActor = {
  kind: "character",
  id: "character_demo",
  versionId: "version_1",
} as const;

function baseConversation() {
  return createConversation({
    conversationId: asConversationId("conversation_demo"),
    ownerId: asUserId("user_owner"),
    branchId,
  });
}

function conversationWithUserMessage() {
  const created = baseConversation();
  return appendMessage(created, {
    branchId,
    expectedBranchRevision: 0,
    messageId: userMessageId,
    responseGroupId: userGroup,
    parentId: null,
    role: "user",
    actorRef: userActor,
    content: "今晚书店还开着吗？",
    createdAt: "2026-11-18T08:00:00.000Z",
  }).graph;
}

describe("message graph swipe invariant", () => {
  it("keeps every swipe candidate when a new one is generated", () => {
    const withUser = conversationWithUserMessage();
    const first = appendAssistantCandidate(withUser, {
      branchId,
      expectedBranchRevision: 1,
      parentMessageId: userMessageId,
      messageId: candidateOneId,
      responseGroupId: groupOne,
      actorRef: characterActor,
      content: "第一版回复。",
      createdAt: "2026-11-18T08:00:01.000Z",
    });

    const second = appendAssistantCandidate(first.graph, {
      branchId,
      expectedBranchRevision: 2,
      parentMessageId: userMessageId,
      messageId: candidateTwoId,
      responseGroupId: groupOne,
      actorRef: characterActor,
      content: "第二版回复。",
      createdAt: "2026-11-18T08:00:02.000Z",
    });

    const firstNode = getNode(second.graph, candidateOneId);
    const secondNode = getNode(second.graph, candidateTwoId);
    const branch = getBranch(second.graph, branchId);

    expect(firstNode.content).toBe("第一版回复。");
    expect(firstNode.parentId).toBe(userMessageId);
    expect(secondNode.parentId).toBe(userMessageId);
    expect(firstNode.responseGroupId).toBe(secondNode.responseGroupId);
    expect(branch.headMessageId).toBe(candidateTwoId);
    expect(branch.revision).toBe(3);
    expect(second.graph.nodes).toHaveLength(3);
  });

  it("switches the visible candidate without deleting the other one", () => {
    const withUser = conversationWithUserMessage();
    const first = appendAssistantCandidate(withUser, {
      branchId,
      expectedBranchRevision: 1,
      parentMessageId: userMessageId,
      messageId: candidateOneId,
      responseGroupId: groupOne,
      actorRef: characterActor,
      content: "第一版回复。",
      createdAt: "2026-11-18T08:00:01.000Z",
    });
    const second = appendAssistantCandidate(first.graph, {
      branchId,
      expectedBranchRevision: 2,
      parentMessageId: userMessageId,
      messageId: candidateTwoId,
      responseGroupId: groupOne,
      actorRef: characterActor,
      content: "第二版回复。",
      createdAt: "2026-11-18T08:00:02.000Z",
    });

    const selected = selectAssistantCandidate(second.graph, {
      branchId,
      expectedBranchRevision: 3,
      messageId: candidateOneId,
    });

    expect(getBranch(selected.graph, branchId).headMessageId).toBe(candidateOneId);
    expect(getNode(selected.graph, candidateTwoId).content).toBe("第二版回复。");
    expect(selected.graph.nodes).toHaveLength(3);
  });

  it("rejects a write from a stale branch revision", () => {
    const withUser = conversationWithUserMessage();
    expect(() =>
      appendAssistantCandidate(withUser, {
        branchId,
        expectedBranchRevision: 99,
        parentMessageId: userMessageId,
        messageId: candidateOneId,
        responseGroupId: groupOne,
        actorRef: characterActor,
        content: "过期写入。",
        createdAt: "2026-11-18T08:00:01.000Z",
      }),
    ).toThrow(VersionConflictError);
  });
});

describe("editing and deletion", () => {
  it("creates a replacement node and branch without overwriting history", () => {
    const withUser = conversationWithUserMessage();
    const edited = editMessageAsNewBranch(withUser, {
      sourceBranchId: branchId,
      expectedBranchRevision: 1,
      messageId: userMessageId,
      newMessageId: asMessageId("message_user_1_edited"),
      newBranchId: asBranchId("branch_edit_1"),
      newResponseGroupId: asResponseGroupId("group_user_1_edited"),
      content: "今晚书店还开着吗？（改）",
      createdAt: "2026-11-18T08:10:00.000Z",
    });

    expect(getNode(edited.graph, userMessageId).content).toBe("今晚书店还开着吗？");
    expect(getBranch(edited.graph, branchId).headMessageId).toBe(userMessageId);
    expect(edited.branch.headMessageId).toBe(asMessageId("message_user_1_edited"));
    expect(getBranch(edited.graph, edited.branch.id).revision).toBe(1);
    expect(edited.graph.nodes).toHaveLength(2);
  });

  it("tombstones a message without removing it from the graph", () => {
    const withUser = conversationWithUserMessage();
    const deleted = tombstoneMessage(withUser, {
      messageId: userMessageId,
      tombstoneAt: "2026-11-18T08:20:00.000Z",
    });

    expect(deleted.graph.nodes).toHaveLength(1);
    expect(getNode(deleted.graph, userMessageId).tombstoneAt).toBe("2026-11-18T08:20:00.000Z");
  });
});
