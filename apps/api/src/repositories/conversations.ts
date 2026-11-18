import { randomUUID } from "node:crypto";

import {
  type ActorRef,
  InvariantViolationError,
  type MessageRole,
  NotFoundError,
  VersionConflictError,
} from "@xuyueji/domain";
import { and, eq, isNull, sql } from "drizzle-orm";

import type { Database } from "../db/client.js";
import { branches, conversations, messageNodes } from "../db/schema.js";
import { toIso, toIsoOrNull } from "../time.js";
import { enqueueSyncChange } from "./sync-log.js";

export type ConversationRow = typeof conversations.$inferSelect;
export type BranchRow = typeof branches.$inferSelect;
export type MessageRow = typeof messageNodes.$inferSelect;

export interface ConversationSummary {
  readonly id: string;
  readonly title: string;
  readonly mode: string;
  readonly activeBranchId: string | null;
  readonly branchRevision: number;
  readonly headMessageId: string | null;
  readonly updatedAt: string;
  readonly createdAt: string;
}

export interface MessageDto {
  readonly id: string;
  readonly parentId: string | null;
  readonly responseGroupId: string;
  readonly role: MessageRole;
  readonly actorRef: ActorRef;
  readonly content: string;
  readonly originRunId: string | null;
  readonly tombstoneAt: string | null;
  readonly createdAt: string;
}

function toSummary(
  conversation: ConversationRow,
  branch: BranchRow | undefined,
): ConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    mode: conversation.mode,
    activeBranchId: conversation.activeBranchId,
    branchRevision: branch?.revision ?? 0,
    headMessageId: branch?.headMessageId ?? null,
    updatedAt: toIso(conversation.updatedAt),
    createdAt: toIso(conversation.createdAt),
  };
}

function toMessageDto(row: MessageRow): MessageDto {
  return {
    id: row.id,
    parentId: row.parentId,
    responseGroupId: row.responseGroupId,
    role: row.role as MessageRole,
    actorRef: row.actorRef as unknown as ActorRef,
    content: row.content,
    originRunId: row.originRunId,
    tombstoneAt: toIsoOrNull(row.tombstoneAt),
    createdAt: toIso(row.createdAt),
  };
}

async function findMessageByRequest(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  ownerUserId: string,
  clientRequestId: string,
): Promise<MessageRow | undefined> {
  const [row] = await tx
    .select()
    .from(messageNodes)
    .where(
      and(
        eq(messageNodes.ownerUserId, ownerUserId),
        eq(messageNodes.clientRequestId, clientRequestId),
      ),
    )
    .limit(1);
  return row;
}

async function requireConversation(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  ownerUserId: string,
  conversationId: string,
): Promise<ConversationRow> {
  const [conversation] = await tx
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.ownerUserId, ownerUserId),
        isNull(conversations.deletedAt),
      ),
    )
    .limit(1);
  if (!conversation) {
    throw new NotFoundError("Conversation not found.", { conversationId });
  }
  return conversation;
}

async function requireBranch(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  conversationId: string,
  branchId: string,
  lock = false,
): Promise<BranchRow> {
  const query = tx
    .select()
    .from(branches)
    .where(
      and(
        eq(branches.id, branchId),
        eq(branches.conversationId, conversationId),
        isNull(branches.deletedAt),
      ),
    )
    .limit(1);
  const [branch] = lock ? await query.for("update") : await query;
  if (!branch) {
    throw new NotFoundError("Branch not found.", { branchId });
  }
  return branch;
}

function assertBranchRevision(branch: BranchRow, expected: number): void {
  if (branch.revision !== expected) {
    throw new VersionConflictError("Branch was advanced on another device.", {
      branchId: branch.id,
      expectedBranchRevision: expected,
      actualBranchRevision: branch.revision,
    });
  }
}

export async function createConversation(
  db: Database,
  input: {
    readonly ownerUserId: string;
    readonly title: string;
    readonly mode: "solo" | "group";
    readonly now: string;
  },
): Promise<ConversationSummary> {
  const conversationId = randomUUID();
  const branchId = randomUUID();

  return db.transaction(async (tx) => {
    const [conversation] = await tx
      .insert(conversations)
      .values({
        id: conversationId,
        ownerUserId: input.ownerUserId,
        title: input.title,
        mode: input.mode,
        activeBranchId: branchId,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();
    if (!conversation) {
      throw new Error("Conversation insert returned no row.");
    }

    const [branch] = await tx
      .insert(branches)
      .values({
        id: branchId,
        conversationId,
        headMessageId: null,
        revision: 0,
        label: "主线",
        createdAt: input.now,
      })
      .returning();
    if (!branch) {
      throw new Error("Branch insert returned no row.");
    }

    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "conversation",
      entityId: conversationId,
      revision: 1,
      op: "upsert",
    });
    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "branch",
      entityId: branchId,
      revision: 0,
      op: "upsert",
    });

    return toSummary(conversation, branch);
  });
}

export async function listConversations(
  db: Database,
  ownerUserId: string,
): Promise<ConversationSummary[]> {
  const rows = await db
    .select({ conversation: conversations, branch: branches })
    .from(conversations)
    .leftJoin(branches, eq(branches.id, conversations.activeBranchId))
    .where(and(eq(conversations.ownerUserId, ownerUserId), isNull(conversations.deletedAt)))
    .orderBy(sql`${conversations.updatedAt} desc`);

  return rows.map((row) => toSummary(row.conversation, row.branch ?? undefined));
}

export async function getConversation(
  db: Database,
  ownerUserId: string,
  conversationId: string,
): Promise<{
  conversation: ConversationRow;
  branches: BranchRow[];
  activeBranch: BranchRow | null;
}> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.ownerUserId, ownerUserId),
        isNull(conversations.deletedAt),
      ),
    )
    .limit(1);
  if (!conversation) {
    throw new NotFoundError("Conversation not found.", { conversationId });
  }

  const branchRows = await db
    .select()
    .from(branches)
    .where(and(eq(branches.conversationId, conversationId), isNull(branches.deletedAt)))
    .orderBy(branches.createdAt);

  return {
    conversation,
    branches: branchRows,
    activeBranch: branchRows.find((branch) => branch.id === conversation.activeBranchId) ?? null,
  };
}

export interface AppendMessageInput {
  readonly ownerUserId: string;
  readonly conversationId: string;
  readonly branchId: string;
  readonly expectedBranchRevision: number;
  readonly parentId: string | null;
  readonly role: MessageRole;
  readonly actorRef: ActorRef;
  readonly content: string;
  readonly responseGroupId?: string;
  readonly clientRequestId: string;
  readonly now: string;
}

export async function appendMessage(
  db: Database,
  input: AppendMessageInput,
): Promise<{ message: MessageDto; branch: BranchRow }> {
  return db.transaction(async (tx) => {
    const existing = await findMessageByRequest(tx, input.ownerUserId, input.clientRequestId);
    if (existing) {
      if (existing.conversationId !== input.conversationId) {
        throw new InvariantViolationError("Request id was used for another conversation.", {
          clientRequestId: input.clientRequestId,
        });
      }
      const branch = await requireBranch(tx, input.conversationId, input.branchId);
      return { message: toMessageDto(existing), branch };
    }

    const conversation = await requireConversation(tx, input.ownerUserId, input.conversationId);
    const branch = await requireBranch(tx, conversation.id, input.branchId, true);
    assertBranchRevision(branch, input.expectedBranchRevision);

    if (input.parentId !== branch.headMessageId) {
      throw new InvariantViolationError("Message must extend the branch head.", {
        branchId: branch.id,
        expectedParentId: branch.headMessageId,
        receivedParentId: input.parentId,
      });
    }

    const [message] = await tx
      .insert(messageNodes)
      .values({
        id: randomUUID(),
        ownerUserId: input.ownerUserId,
        conversationId: conversation.id,
        parentId: input.parentId,
        responseGroupId: input.responseGroupId ?? randomUUID(),
        role: input.role,
        actorRef: input.actorRef as unknown as Record<string, unknown>,
        content: input.content,
        clientRequestId: input.clientRequestId,
        createdAt: input.now,
      })
      .returning();
    if (!message) {
      throw new Error("Message insert returned no row.");
    }

    const [updatedBranch] = await tx
      .update(branches)
      .set({ headMessageId: message.id, revision: branch.revision + 1 })
      .where(eq(branches.id, branch.id))
      .returning();
    if (!updatedBranch) {
      throw new Error("Branch update returned no row.");
    }

    await tx
      .update(conversations)
      .set({ updatedAt: input.now })
      .where(eq(conversations.id, conversation.id));

    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "message",
      entityId: message.id,
      revision: 1,
      op: "upsert",
    });
    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "branch",
      entityId: updatedBranch.id,
      revision: updatedBranch.revision,
      op: "upsert",
    });

    return { message: toMessageDto(message), branch: updatedBranch };
  });
}

export interface AppendCandidateInput {
  readonly ownerUserId: string;
  readonly conversationId: string;
  readonly branchId: string;
  readonly expectedBranchRevision: number;
  readonly parentMessageId: string;
  readonly responseGroupId?: string;
  readonly actorRef: ActorRef;
  readonly content: string;
  readonly clientRequestId: string;
  readonly now: string;
}

export async function appendAssistantCandidate(
  db: Database,
  input: AppendCandidateInput,
): Promise<{ message: MessageDto; branch: BranchRow }> {
  return db.transaction(async (tx) => {
    const existing = await findMessageByRequest(tx, input.ownerUserId, input.clientRequestId);
    if (existing) {
      if (existing.conversationId !== input.conversationId) {
        throw new InvariantViolationError("Request id was used for another conversation.", {
          clientRequestId: input.clientRequestId,
        });
      }
      const branch = await requireBranch(tx, input.conversationId, input.branchId);
      return { message: toMessageDto(existing), branch };
    }

    const conversation = await requireConversation(tx, input.ownerUserId, input.conversationId);
    const branch = await requireBranch(tx, conversation.id, input.branchId, true);
    assertBranchRevision(branch, input.expectedBranchRevision);

    const [parent] = await tx
      .select()
      .from(messageNodes)
      .where(
        and(
          eq(messageNodes.id, input.parentMessageId),
          eq(messageNodes.conversationId, conversation.id),
          eq(messageNodes.ownerUserId, input.ownerUserId),
        ),
      )
      .limit(1);
    if (!parent) {
      throw new NotFoundError("Parent message not found.", {
        messageId: input.parentMessageId,
      });
    }

    const responseGroupId = input.responseGroupId ?? randomUUID();
    const group = await tx
      .select()
      .from(messageNodes)
      .where(
        and(
          eq(messageNodes.conversationId, conversation.id),
          eq(messageNodes.responseGroupId, responseGroupId),
        ),
      );

    for (const candidate of group) {
      if (candidate.parentId !== parent.id) {
        throw new InvariantViolationError("Candidates in a group must share one parent.", {
          responseGroupId,
          candidateId: candidate.id,
        });
      }
      if (candidate.role !== "assistant") {
        throw new InvariantViolationError("Only assistant messages can form a swipe group.", {
          responseGroupId,
          candidateId: candidate.id,
        });
      }
    }

    let head: MessageRow | null = null;
    if (branch.headMessageId) {
      const [headRow] = await tx
        .select()
        .from(messageNodes)
        .where(eq(messageNodes.id, branch.headMessageId))
        .limit(1);
      if (!headRow) {
        throw new InvariantViolationError("Branch head message is missing.", {
          branchId: branch.id,
          headMessageId: branch.headMessageId,
        });
      }
      head = headRow;
    }

    const headCanAdvance =
      head === null || head.id === parent.id || head.responseGroupId === responseGroupId;
    if (!headCanAdvance) {
      throw new InvariantViolationError(
        "Candidate is not reachable from the current branch head.",
        {
          branchId: branch.id,
          headMessageId: branch.headMessageId,
          parentMessageId: parent.id,
          responseGroupId,
        },
      );
    }

    const [message] = await tx
      .insert(messageNodes)
      .values({
        id: randomUUID(),
        ownerUserId: input.ownerUserId,
        conversationId: conversation.id,
        parentId: parent.id,
        responseGroupId,
        role: "assistant",
        actorRef: input.actorRef as unknown as Record<string, unknown>,
        content: input.content,
        clientRequestId: input.clientRequestId,
        createdAt: input.now,
      })
      .returning();
    if (!message) {
      throw new Error("Candidate insert returned no row.");
    }

    const [updatedBranch] = await tx
      .update(branches)
      .set({ headMessageId: message.id, revision: branch.revision + 1 })
      .where(eq(branches.id, branch.id))
      .returning();
    if (!updatedBranch) {
      throw new Error("Branch update returned no row.");
    }

    await tx
      .update(conversations)
      .set({ updatedAt: input.now })
      .where(eq(conversations.id, conversation.id));

    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "message",
      entityId: message.id,
      revision: 1,
      op: "upsert",
    });
    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "branch",
      entityId: updatedBranch.id,
      revision: updatedBranch.revision,
      op: "upsert",
    });

    return { message: toMessageDto(message), branch: updatedBranch };
  });
}

export async function selectAssistantCandidate(
  db: Database,
  input: {
    readonly ownerUserId: string;
    readonly conversationId: string;
    readonly branchId: string;
    readonly expectedBranchRevision: number;
    readonly messageId: string;
  },
): Promise<BranchRow> {
  return db.transaction(async (tx) => {
    const conversation = await requireConversation(tx, input.ownerUserId, input.conversationId);
    const branch = await requireBranch(tx, conversation.id, input.branchId, true);
    assertBranchRevision(branch, input.expectedBranchRevision);

    const [candidate] = await tx
      .select()
      .from(messageNodes)
      .where(
        and(
          eq(messageNodes.id, input.messageId),
          eq(messageNodes.conversationId, conversation.id),
          eq(messageNodes.ownerUserId, input.ownerUserId),
        ),
      )
      .limit(1);
    if (!candidate) {
      throw new NotFoundError("Candidate not found.", { messageId: input.messageId });
    }
    if (candidate.role !== "assistant") {
      throw new InvariantViolationError("Only assistant candidates can be selected.", {
        messageId: candidate.id,
      });
    }
    if (!branch.headMessageId) {
      throw new InvariantViolationError("Branch has no head message.", { branchId: branch.id });
    }

    const [head] = await tx
      .select()
      .from(messageNodes)
      .where(eq(messageNodes.id, branch.headMessageId))
      .limit(1);
    if (!head || head.responseGroupId !== candidate.responseGroupId) {
      throw new InvariantViolationError("Candidate belongs to a different swipe group.", {
        messageId: candidate.id,
        headMessageId: branch.headMessageId,
      });
    }

    const [updatedBranch] = await tx
      .update(branches)
      .set({ headMessageId: candidate.id, revision: branch.revision + 1 })
      .where(eq(branches.id, branch.id))
      .returning();
    if (!updatedBranch) {
      throw new Error("Branch update returned no row.");
    }

    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "branch",
      entityId: updatedBranch.id,
      revision: updatedBranch.revision,
      op: "upsert",
    });

    return updatedBranch;
  });
}

export async function editMessageAsNewBranch(
  db: Database,
  input: {
    readonly ownerUserId: string;
    readonly conversationId: string;
    readonly sourceBranchId: string;
    readonly expectedBranchRevision: number;
    readonly messageId: string;
    readonly content: string;
    readonly now: string;
    readonly label?: string;
  },
): Promise<{ message: MessageDto; branch: BranchRow }> {
  return db.transaction(async (tx) => {
    const conversation = await requireConversation(tx, input.ownerUserId, input.conversationId);
    const sourceBranch = await requireBranch(tx, conversation.id, input.sourceBranchId);
    assertBranchRevision(sourceBranch, input.expectedBranchRevision);

    const [original] = await tx
      .select()
      .from(messageNodes)
      .where(
        and(
          eq(messageNodes.id, input.messageId),
          eq(messageNodes.conversationId, conversation.id),
          eq(messageNodes.ownerUserId, input.ownerUserId),
        ),
      )
      .limit(1);
    if (!original) {
      throw new NotFoundError("Message not found.", { messageId: input.messageId });
    }
    if (original.tombstoneAt !== null) {
      throw new InvariantViolationError("Cannot edit a deleted message.", {
        messageId: original.id,
      });
    }

    const messageId = randomUUID();
    const branchId = randomUUID();

    const [replacement] = await tx
      .insert(messageNodes)
      .values({
        id: messageId,
        ownerUserId: input.ownerUserId,
        conversationId: conversation.id,
        parentId: original.parentId,
        responseGroupId: randomUUID(),
        role: original.role,
        actorRef: original.actorRef,
        content: input.content,
        createdAt: input.now,
      })
      .returning();
    if (!replacement) {
      throw new Error("Replacement insert returned no row.");
    }

    const [branch] = await tx
      .insert(branches)
      .values({
        id: branchId,
        conversationId: conversation.id,
        headMessageId: messageId,
        revision: 1,
        label: input.label ?? `分支 · ${original.id.slice(0, 8)}`,
        createdAt: input.now,
      })
      .returning();
    if (!branch) {
      throw new Error("Branch insert returned no row.");
    }

    await tx
      .update(conversations)
      .set({ updatedAt: input.now, activeBranchId: branchId })
      .where(eq(conversations.id, conversation.id));

    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "message",
      entityId: messageId,
      revision: 1,
      op: "upsert",
    });
    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "branch",
      entityId: branchId,
      revision: 1,
      op: "upsert",
    });

    return { message: toMessageDto(replacement), branch };
  });
}

export async function tombstoneMessage(
  db: Database,
  input: {
    readonly ownerUserId: string;
    readonly conversationId: string;
    readonly messageId: string;
    readonly now: string;
  },
): Promise<MessageDto> {
  return db.transaction(async (tx) => {
    const conversation = await requireConversation(tx, input.ownerUserId, input.conversationId);
    const [message] = await tx
      .select()
      .from(messageNodes)
      .where(
        and(
          eq(messageNodes.id, input.messageId),
          eq(messageNodes.conversationId, conversation.id),
          eq(messageNodes.ownerUserId, input.ownerUserId),
        ),
      )
      .for("update")
      .limit(1);
    if (!message) {
      throw new NotFoundError("Message not found.", { messageId: input.messageId });
    }
    if (message.tombstoneAt !== null) {
      return toMessageDto(message);
    }

    const [updated] = await tx
      .update(messageNodes)
      .set({ tombstoneAt: input.now })
      .where(eq(messageNodes.id, message.id))
      .returning();
    if (!updated) {
      throw new Error("Message tombstone update returned no row.");
    }

    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "message",
      entityId: message.id,
      revision: 1,
      op: "delete",
    });

    return toMessageDto(updated);
  });
}

export interface MessagePage {
  readonly messages: MessageDto[];
  readonly hasMore: boolean;
  readonly nextBefore: string | null;
}

interface PathRow {
  id: string;
  parent_id: string | null;
  response_group_id: string;
  role: string;
  actor_ref: Record<string, unknown>;
  content: string;
  origin_run_id: string | null;
  tombstone_at: string | null;
  created_at: string;
  depth: number;
}

export async function listMessagePath(
  db: Database,
  input: {
    readonly ownerUserId: string;
    readonly conversationId: string;
    readonly branchId: string;
    readonly before: string | null;
    readonly limit: number;
  },
): Promise<MessagePage> {
  const conversation = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, input.conversationId),
        eq(conversations.ownerUserId, input.ownerUserId),
        isNull(conversations.deletedAt),
      ),
    )
    .limit(1);
  if (conversation.length === 0) {
    throw new NotFoundError("Conversation not found.", {
      conversationId: input.conversationId,
    });
  }

  const [branch] = await db
    .select()
    .from(branches)
    .where(
      and(
        eq(branches.id, input.branchId),
        eq(branches.conversationId, input.conversationId),
        isNull(branches.deletedAt),
      ),
    )
    .limit(1);
  if (!branch) {
    throw new NotFoundError("Branch not found.", { branchId: input.branchId });
  }
  if (!branch.headMessageId) {
    return { messages: [], hasMore: false, nextBefore: null };
  }

  const limit = Math.min(Math.max(input.limit, 1), 200);

  if (input.before) {
    const check = await db.execute(sql`
      WITH RECURSIVE path AS (
        SELECT m.id, m.parent_id
        FROM message_nodes m
        WHERE m.id = ${branch.headMessageId}::uuid
          AND m.conversation_id = ${input.conversationId}::uuid
          AND m.owner_user_id = ${input.ownerUserId}::uuid
        UNION ALL
        SELECT m.id, m.parent_id
        FROM message_nodes m
        JOIN path p ON m.id = p.parent_id
        WHERE m.conversation_id = ${input.conversationId}::uuid
          AND m.owner_user_id = ${input.ownerUserId}::uuid
      )
      SELECT EXISTS(
        SELECT 1 FROM path WHERE id = ${input.before}::uuid
      ) AS on_path
    `);
    const checkRows = check.rows as Array<{ on_path: unknown }>;
    const onPath = checkRows[0]?.on_path;
    if (onPath !== true && onPath !== "t" && onPath !== 1) {
      throw new NotFoundError("Cursor message is not on this branch.", {
        before: input.before,
        branchId: branch.id,
      });
    }
  }

  const result = await db.execute(sql`
    WITH RECURSIVE path AS (
      SELECT
        m.id, m.parent_id, m.response_group_id, m.role, m.actor_ref,
        m.content, m.origin_run_id, m.tombstone_at, m.created_at,
        0 AS depth
      FROM message_nodes m
      WHERE m.id = ${branch.headMessageId}::uuid
        AND m.conversation_id = ${input.conversationId}::uuid
        AND m.owner_user_id = ${input.ownerUserId}::uuid
      UNION ALL
      SELECT
        m.id, m.parent_id, m.response_group_id, m.role, m.actor_ref,
        m.content, m.origin_run_id, m.tombstone_at, m.created_at,
        p.depth + 1
      FROM message_nodes m
      JOIN path p ON m.id = p.parent_id
      WHERE m.conversation_id = ${input.conversationId}::uuid
        AND m.owner_user_id = ${input.ownerUserId}::uuid
    ),
    cursor AS (
      SELECT depth FROM path WHERE id = ${input.before}::uuid
    )
    SELECT * FROM path
    WHERE ${input.before}::uuid IS NULL
       OR depth > (SELECT depth FROM cursor)
    ORDER BY depth ASC
    LIMIT ${limit + 1}
  `);

  const rows = result.rows as unknown as PathRow[];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const messages = pageRows
    .slice()
    .reverse()
    .map((row) => ({
      id: row.id,
      parentId: row.parent_id,
      responseGroupId: row.response_group_id,
      role: row.role as MessageRole,
      actorRef: row.actor_ref as unknown as ActorRef,
      content: row.content,
      originRunId: row.origin_run_id,
      tombstoneAt: toIsoOrNull(row.tombstone_at),
      createdAt: toIso(row.created_at),
    }));

  return {
    messages,
    hasMore,
    nextBefore: hasMore ? (messages[0]?.id ?? null) : null,
  };
}
