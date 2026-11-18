import type {
  AppendMessageResponse,
  ConversationDetail,
  ConversationSummaryDto,
  MessagePageDto,
} from "@xuyueji/contracts";

import { requestJson } from "./http.js";

export function listConversations(): Promise<{ conversations: ConversationSummaryDto[] }> {
  return requestJson<{ conversations: ConversationSummaryDto[] }>("/api/conversations");
}

export function createConversation(title: string): Promise<ConversationSummaryDto> {
  return requestJson<ConversationSummaryDto>("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export function getConversation(conversationId: string): Promise<ConversationDetail> {
  return requestJson<ConversationDetail>(
    `/api/conversations/${encodeURIComponent(conversationId)}`,
  );
}

export function listMessages(input: {
  readonly conversationId: string;
  readonly branchId: string;
  readonly before?: string | null;
  readonly limit?: number;
}): Promise<MessagePageDto> {
  const params = new URLSearchParams({
    branchId: input.branchId,
    limit: String(input.limit ?? 50),
  });
  if (input.before) {
    params.set("before", input.before);
  }
  return requestJson<MessagePageDto>(
    `/api/conversations/${encodeURIComponent(input.conversationId)}/messages?${params.toString()}`,
  );
}

export function appendUserMessage(input: {
  readonly conversationId: string;
  readonly branchId: string;
  readonly expectedBranchRevision: number;
  readonly parentId: string | null;
  readonly content: string;
  readonly requestId: string;
}): Promise<AppendMessageResponse> {
  return requestJson<AppendMessageResponse>(
    `/api/conversations/${encodeURIComponent(input.conversationId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        branchId: input.branchId,
        expectedBranchRevision: input.expectedBranchRevision,
        parentId: input.parentId,
        role: "user",
        content: input.content,
        requestId: input.requestId,
      }),
    },
  );
}
