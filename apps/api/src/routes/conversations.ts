import {
  type AppendMessageResponse,
  appendCandidateRequestSchema,
  appendMessageRequestSchema,
  type BranchDto,
  type ConversationDetail,
  type ConversationSummaryDto,
  createConversationRequestSchema,
  editMessageRequestSchema,
  type MessagePageDto,
  selectCandidateRequestSchema,
} from "@xuyueji/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { requireAuth, requireSession } from "../auth/guard.js";
import type { AuthService } from "../auth/service.js";
import type { Database } from "../db/client.js";
import type { BranchRow } from "../repositories/conversations.js";
import {
  appendAssistantCandidate,
  appendMessage,
  createConversation,
  editMessageAsNewBranch,
  getConversation,
  listConversations,
  listMessagePath,
  selectAssistantCandidate,
  tombstoneMessage,
} from "../repositories/conversations.js";
import { toIso } from "../time.js";

const conversationParamsSchema = z.object({
  conversationId: z.string().min(1).max(100),
});

const messageParamsSchema = z.object({
  conversationId: z.string().min(1).max(100),
  messageId: z.string().min(1).max(100),
});

const messageQuerySchema = z.object({
  branchId: z.string().min(1).max(100),
  before: z.string().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function branchDto(branch: BranchRow): BranchDto {
  return {
    id: branch.id,
    conversationId: branch.conversationId,
    headMessageId: branch.headMessageId,
    revision: branch.revision,
    label: branch.label,
    createdAt: toIso(branch.createdAt),
  };
}

export function conversationRoutes(options: {
  readonly db: Database;
  readonly auth: AuthService;
}): FastifyPluginAsync {
  const { db, auth } = options;
  const guard = { preHandler: requireAuth(auth) };

  return async (app) => {
    app.get("/", guard, async (request) => {
      const session = requireSession(request);
      return { conversations: await listConversations(db, session.userId) };
    });

    app.post("/", guard, async (request, reply) => {
      const session = requireSession(request);
      const body = createConversationRequestSchema.parse(request.body);
      const conversation = await createConversation(db, {
        ownerUserId: session.userId,
        title: body.title ?? "未命名会话",
        mode: body.mode ?? "solo",
        now: new Date().toISOString(),
      });
      reply.code(201);
      return conversation;
    });

    app.get("/:conversationId", guard, async (request) => {
      const session = requireSession(request);
      const { conversationId } = conversationParamsSchema.parse(request.params);
      const result = await getConversation(db, session.userId, conversationId);
      const summary: ConversationSummaryDto = {
        id: result.conversation.id,
        title: result.conversation.title,
        mode: result.conversation.mode === "group" ? "group" : "solo",
        activeBranchId: result.conversation.activeBranchId,
        branchRevision: result.activeBranch?.revision ?? 0,
        headMessageId: result.activeBranch?.headMessageId ?? null,
        updatedAt: result.conversation.updatedAt,
        createdAt: result.conversation.createdAt,
      };
      const response: ConversationDetail = {
        conversation: summary,
        branches: result.branches.map(branchDto),
      };
      return response;
    });

    app.get("/:conversationId/messages", guard, async (request) => {
      const session = requireSession(request);
      const { conversationId } = conversationParamsSchema.parse(request.params);
      const query = messageQuerySchema.parse(request.query);
      const page: MessagePageDto = await listMessagePath(db, {
        ownerUserId: session.userId,
        conversationId,
        branchId: query.branchId,
        before: query.before ?? null,
        limit: query.limit,
      });
      return page;
    });

    app.post("/:conversationId/messages", guard, async (request, reply) => {
      const session = requireSession(request);
      const { conversationId } = conversationParamsSchema.parse(request.params);
      const body = appendMessageRequestSchema.parse(request.body);
      const actorRef =
        body.role === "system"
          ? ({ kind: "system", id: "platform" } as const)
          : ({ kind: "user", id: session.userId } as const);

      const result = await appendMessage(db, {
        ownerUserId: session.userId,
        conversationId,
        branchId: body.branchId,
        expectedBranchRevision: body.expectedBranchRevision,
        parentId: body.parentId,
        role: body.role,
        actorRef,
        content: body.content,
        responseGroupId: body.responseGroupId,
        clientRequestId: body.requestId,
        now: new Date().toISOString(),
      });
      reply.code(201);
      const response: AppendMessageResponse = {
        message: result.message,
        branch: branchDto(result.branch),
      };
      return response;
    });

    app.post("/:conversationId/candidates", guard, async (request, reply) => {
      const session = requireSession(request);
      const { conversationId } = conversationParamsSchema.parse(request.params);
      const body = appendCandidateRequestSchema.parse(request.body);
      const result = await appendAssistantCandidate(db, {
        ownerUserId: session.userId,
        conversationId,
        branchId: body.branchId,
        expectedBranchRevision: body.expectedBranchRevision,
        parentMessageId: body.parentMessageId,
        responseGroupId: body.responseGroupId,
        actorRef: body.actorRef,
        content: body.content,
        clientRequestId: body.requestId,
        now: new Date().toISOString(),
      });
      reply.code(201);
      const response: AppendMessageResponse = {
        message: result.message,
        branch: branchDto(result.branch),
      };
      return response;
    });

    app.post("/:conversationId/candidates/select", guard, async (request) => {
      const session = requireSession(request);
      const { conversationId } = conversationParamsSchema.parse(request.params);
      const body = selectCandidateRequestSchema.parse(request.body);
      const branch = await selectAssistantCandidate(db, {
        ownerUserId: session.userId,
        conversationId,
        branchId: body.branchId,
        expectedBranchRevision: body.expectedBranchRevision,
        messageId: body.messageId,
      });
      return { branch: branchDto(branch) };
    });

    app.post("/:conversationId/messages/:messageId/edit", guard, async (request, reply) => {
      const session = requireSession(request);
      const { conversationId, messageId } = messageParamsSchema.parse(request.params);
      const body = editMessageRequestSchema.parse(request.body);
      const result = await editMessageAsNewBranch(db, {
        ownerUserId: session.userId,
        conversationId,
        sourceBranchId: body.branchId,
        expectedBranchRevision: body.expectedBranchRevision,
        messageId,
        content: body.content,
        label: body.label,
        now: new Date().toISOString(),
      });
      reply.code(201);
      const response: AppendMessageResponse = {
        message: result.message,
        branch: branchDto(result.branch),
      };
      return response;
    });

    app.delete("/:conversationId/messages/:messageId", guard, async (request, reply) => {
      const session = requireSession(request);
      const { conversationId, messageId } = messageParamsSchema.parse(request.params);
      await tombstoneMessage(db, {
        ownerUserId: session.userId,
        conversationId,
        messageId,
        now: new Date().toISOString(),
      });
      return reply.code(204).send();
    });
  };
}
