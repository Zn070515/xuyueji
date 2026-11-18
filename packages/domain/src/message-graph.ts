import { InvariantViolationError, NotFoundError, VersionConflictError } from "./errors.js";
import type { BranchId, ConversationId, MessageId, ResponseGroupId, UserId } from "./ids.js";

export type MessageRole = "system" | "user" | "assistant";

export type ActorRef =
  | { readonly kind: "user"; readonly id: string }
  | { readonly kind: "persona"; readonly id: string }
  | { readonly kind: "character"; readonly id: string; readonly versionId: string }
  | { readonly kind: "system"; readonly id: "platform" };

/**
 * Immutable message node. Editing or regenerating creates a sibling node; it
 * never replaces the content of an existing node.
 */
export interface MessageNode {
  readonly id: MessageId;
  readonly conversationId: ConversationId;
  readonly parentId: MessageId | null;
  readonly responseGroupId: ResponseGroupId;
  readonly role: MessageRole;
  readonly actorRef: ActorRef;
  readonly content: string;
  readonly createdAt: string;
  readonly originRunId: string | null;
  readonly tombstoneAt: string | null;
}

export interface Branch {
  readonly id: BranchId;
  readonly conversationId: ConversationId;
  readonly headMessageId: MessageId | null;
  readonly revision: number;
  readonly label: string;
}

export interface ConversationGraph {
  readonly conversationId: ConversationId;
  readonly ownerId: UserId;
  readonly nodes: readonly MessageNode[];
  readonly branches: readonly Branch[];
}

export interface CreateConversationInput {
  readonly conversationId: ConversationId;
  readonly ownerId: UserId;
  readonly branchId: BranchId;
  readonly label?: string;
}

export function createConversation(input: CreateConversationInput): ConversationGraph {
  return {
    conversationId: input.conversationId,
    ownerId: input.ownerId,
    nodes: [],
    branches: [
      {
        id: input.branchId,
        conversationId: input.conversationId,
        headMessageId: null,
        revision: 0,
        label: input.label ?? "主线",
      },
    ],
  };
}

export function getBranch(graph: ConversationGraph, branchId: BranchId): Branch {
  const branch = graph.branches.find((candidate) => candidate.id === branchId);
  if (!branch) {
    throw new NotFoundError("Branch does not exist.", { branchId });
  }
  return branch;
}

export function getNode(graph: ConversationGraph, messageId: MessageId): MessageNode {
  const node = graph.nodes.find((candidate) => candidate.id === messageId);
  if (!node) {
    throw new NotFoundError("Message does not exist.", { messageId });
  }
  return node;
}

export function getResponseGroup(
  graph: ConversationGraph,
  responseGroupId: ResponseGroupId,
): readonly MessageNode[] {
  return graph.nodes.filter((node) => node.responseGroupId === responseGroupId);
}

function assertBranchRevision(branch: Branch, expectedBranchRevision: number): void {
  if (branch.revision !== expectedBranchRevision) {
    throw new VersionConflictError("Branch was advanced on another device.", {
      branchId: branch.id,
      expectedBranchRevision,
      actualBranchRevision: branch.revision,
    });
  }
}

function replaceBranch(
  graph: ConversationGraph,
  branchId: BranchId,
  update: (branch: Branch) => Branch,
): readonly Branch[] {
  return graph.branches.map((branch) => (branch.id === branchId ? update(branch) : branch));
}

export interface AppendMessageInput {
  readonly branchId: BranchId;
  readonly expectedBranchRevision: number;
  readonly messageId: MessageId;
  readonly responseGroupId: ResponseGroupId;
  readonly parentId: MessageId | null;
  readonly role: MessageRole;
  readonly actorRef: ActorRef;
  readonly content: string;
  readonly createdAt: string;
  readonly originRunId?: string | null;
}

/**
 * Append a normal (non-candidate) message and advance the branch head. User
 * messages and system notes use a fresh response group.
 */
export function appendMessage(
  graph: ConversationGraph,
  input: AppendMessageInput,
): { graph: ConversationGraph; node: MessageNode } {
  const branch = getBranch(graph, input.branchId);
  assertBranchRevision(branch, input.expectedBranchRevision);

  if (input.parentId !== branch.headMessageId) {
    throw new InvariantViolationError("Message must extend the branch head.", {
      branchId: branch.id,
      expectedParentId: branch.headMessageId,
      receivedParentId: input.parentId,
    });
  }

  const node: MessageNode = {
    id: input.messageId,
    conversationId: graph.conversationId,
    parentId: input.parentId,
    responseGroupId: input.responseGroupId,
    role: input.role,
    actorRef: input.actorRef,
    content: input.content,
    createdAt: input.createdAt,
    originRunId: input.originRunId ?? null,
    tombstoneAt: null,
  };

  return {
    node,
    graph: {
      ...graph,
      nodes: [...graph.nodes, node],
      branches: replaceBranch(graph, branch.id, (current) => ({
        ...current,
        headMessageId: node.id,
        revision: current.revision + 1,
      })),
    },
  };
}

export interface AppendAssistantCandidateInput {
  readonly branchId: BranchId;
  readonly expectedBranchRevision: number;
  readonly parentMessageId: MessageId;
  readonly messageId: MessageId;
  readonly responseGroupId: ResponseGroupId;
  readonly actorRef: ActorRef;
  readonly content: string;
  readonly createdAt: string;
  readonly originRunId?: string | null;
}

/**
 * Add a swipe candidate as a sibling under the same parent. Existing
 * candidates stay in the graph; the branch head moves to the new candidate.
 */
export function appendAssistantCandidate(
  graph: ConversationGraph,
  input: AppendAssistantCandidateInput,
): { graph: ConversationGraph; node: MessageNode } {
  const branch = getBranch(graph, input.branchId);
  assertBranchRevision(branch, input.expectedBranchRevision);

  const parent = getNode(graph, input.parentMessageId);
  if (parent.conversationId !== graph.conversationId) {
    throw new InvariantViolationError("Parent belongs to another conversation.", {
      parentMessageId: parent.id,
    });
  }

  const existingGroup = getResponseGroup(graph, input.responseGroupId);
  for (const candidate of existingGroup) {
    if (candidate.parentId !== parent.id) {
      throw new InvariantViolationError("Candidates in a group must share one parent.", {
        responseGroupId: input.responseGroupId,
        candidateId: candidate.id,
        expectedParentId: parent.id,
        actualParentId: candidate.parentId,
      });
    }
    if (candidate.role !== "assistant") {
      throw new InvariantViolationError("Only assistant messages can form a swipe group.", {
        responseGroupId: input.responseGroupId,
        candidateId: candidate.id,
      });
    }
  }

  const currentHead = branch.headMessageId ? getNode(graph, branch.headMessageId) : null;
  const headCanAdvance =
    currentHead === null ||
    currentHead.id === parent.id ||
    currentHead.responseGroupId === input.responseGroupId;

  if (!headCanAdvance) {
    throw new InvariantViolationError("Candidate is not reachable from the current branch head.", {
      branchId: branch.id,
      headMessageId: currentHead?.id ?? null,
      parentMessageId: parent.id,
      responseGroupId: input.responseGroupId,
    });
  }

  const node: MessageNode = {
    id: input.messageId,
    conversationId: graph.conversationId,
    parentId: parent.id,
    responseGroupId: input.responseGroupId,
    role: "assistant",
    actorRef: input.actorRef,
    content: input.content,
    createdAt: input.createdAt,
    originRunId: input.originRunId ?? null,
    tombstoneAt: null,
  };

  return {
    node,
    graph: {
      ...graph,
      nodes: [...graph.nodes, node],
      branches: replaceBranch(graph, branch.id, (current) => ({
        ...current,
        headMessageId: node.id,
        revision: current.revision + 1,
      })),
    },
  };
}

export interface SelectAssistantCandidateInput {
  readonly branchId: BranchId;
  readonly expectedBranchRevision: number;
  readonly messageId: MessageId;
}

/**
 * Switch the visible swipe without deleting any candidate.
 */
export function selectAssistantCandidate(
  graph: ConversationGraph,
  input: SelectAssistantCandidateInput,
): { graph: ConversationGraph; branch: Branch } {
  const branch = getBranch(graph, input.branchId);
  assertBranchRevision(branch, input.expectedBranchRevision);

  const candidate = getNode(graph, input.messageId);
  if (candidate.role !== "assistant") {
    throw new InvariantViolationError("Only assistant candidates can be selected.", {
      messageId: candidate.id,
      role: candidate.role,
    });
  }

  if (!branch.headMessageId) {
    throw new InvariantViolationError("Branch has no head message.", { branchId: branch.id });
  }

  const head = getNode(graph, branch.headMessageId);
  if (head.responseGroupId !== candidate.responseGroupId) {
    throw new InvariantViolationError("Candidate belongs to a different swipe group.", {
      responseGroupId: candidate.responseGroupId,
      headResponseGroupId: head.responseGroupId,
    });
  }

  const nextBranch: Branch = {
    ...branch,
    headMessageId: candidate.id,
    revision: branch.revision + 1,
  };

  return {
    branch: nextBranch,
    graph: {
      ...graph,
      branches: replaceBranch(graph, branch.id, () => nextBranch),
    },
  };
}

export interface EditMessageAsNewBranchInput {
  readonly sourceBranchId: BranchId;
  readonly expectedBranchRevision: number;
  readonly messageId: MessageId;
  readonly newMessageId: MessageId;
  readonly newBranchId: BranchId;
  readonly newResponseGroupId: ResponseGroupId;
  readonly content: string;
  readonly createdAt: string;
  readonly label?: string;
}

/**
 * Editing an older message creates a replacement node and a new branch. The
 * original node and the branch that referenced it remain replayable.
 */
export function editMessageAsNewBranch(
  graph: ConversationGraph,
  input: EditMessageAsNewBranchInput,
): { graph: ConversationGraph; node: MessageNode; branch: Branch } {
  const sourceBranch = getBranch(graph, input.sourceBranchId);
  assertBranchRevision(sourceBranch, input.expectedBranchRevision);

  const original = getNode(graph, input.messageId);
  if (original.tombstoneAt !== null) {
    throw new InvariantViolationError("Cannot edit a deleted message.", {
      messageId: original.id,
    });
  }

  if (graph.branches.some((branch) => branch.id === input.newBranchId)) {
    throw new InvariantViolationError("New branch id must be unique.", {
      branchId: input.newBranchId,
    });
  }

  const node: MessageNode = {
    ...original,
    id: input.newMessageId,
    responseGroupId: input.newResponseGroupId,
    content: input.content,
    createdAt: input.createdAt,
    originRunId: null,
    tombstoneAt: null,
  };

  const branch: Branch = {
    id: input.newBranchId,
    conversationId: graph.conversationId,
    headMessageId: node.id,
    revision: 1,
    label: input.label ?? `分支 · ${original.id}`,
  };

  return {
    node,
    branch,
    graph: {
      ...graph,
      nodes: [...graph.nodes, node],
      branches: [...graph.branches, branch],
    },
  };
}

export interface TombstoneMessageInput {
  readonly messageId: MessageId;
  readonly tombstoneAt: string;
}

/**
 * Deletion is a tombstone, never a physical removal. Sync consumers must see
 * the tombstone before they can resurrect a cached node.
 */
export function tombstoneMessage(
  graph: ConversationGraph,
  input: TombstoneMessageInput,
): { graph: ConversationGraph; node: MessageNode } {
  const original = getNode(graph, input.messageId);
  const node: MessageNode = {
    ...original,
    tombstoneAt: input.tombstoneAt,
  };

  return {
    node,
    graph: {
      ...graph,
      nodes: graph.nodes.map((candidate) => (candidate.id === node.id ? node : candidate)),
    },
  };
}
