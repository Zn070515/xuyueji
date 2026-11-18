import type { CreateMemoryRequest, MemoryItemDto, UpdateMemoryRequest } from "@xuyueji/contracts";

import { request, requestJson } from "./http.js";

export function listMemories(conversationId?: string): Promise<{ memories: MemoryItemDto[] }> {
  const query = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : "";
  return requestJson<{ memories: MemoryItemDto[] }>(`/api/memories${query}`);
}

export function createMemory(input: CreateMemoryRequest): Promise<MemoryItemDto> {
  return requestJson<MemoryItemDto>("/api/memories", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateMemory(memoryId: string, input: UpdateMemoryRequest): Promise<MemoryItemDto> {
  return requestJson<MemoryItemDto>(`/api/memories/${encodeURIComponent(memoryId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteMemory(memoryId: string): Promise<void> {
  await request(`/api/memories/${encodeURIComponent(memoryId)}`, { method: "DELETE" });
}
