import type {
  CreateLorebookRequest,
  LorebookDetailDto,
  LorebookEntryDto,
  LorebookEntryInput,
  LorebookSummaryDto,
  UpdateLorebookRequest,
} from "@xuyueji/contracts";

import { request, requestJson } from "./http.js";

export function listLorebooks(): Promise<{ lorebooks: LorebookSummaryDto[] }> {
  return requestJson<{ lorebooks: LorebookSummaryDto[] }>("/api/lorebooks");
}

export function createLorebook(input: CreateLorebookRequest): Promise<LorebookSummaryDto> {
  return requestJson<LorebookSummaryDto>("/api/lorebooks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getLorebook(lorebookId: string): Promise<LorebookDetailDto> {
  return requestJson<LorebookDetailDto>(`/api/lorebooks/${encodeURIComponent(lorebookId)}`);
}

export function updateLorebook(
  lorebookId: string,
  input: UpdateLorebookRequest,
): Promise<LorebookSummaryDto> {
  return requestJson<LorebookSummaryDto>(`/api/lorebooks/${encodeURIComponent(lorebookId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteLorebook(lorebookId: string): Promise<void> {
  const response = await request(`/api/lorebooks/${encodeURIComponent(lorebookId)}`, {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(`Delete failed (${response.status}).`);
  }
}

export function createLoreEntry(
  lorebookId: string,
  entry: LorebookEntryInput,
): Promise<LorebookEntryDto> {
  return requestJson<LorebookEntryDto>(`/api/lorebooks/${encodeURIComponent(lorebookId)}/entries`, {
    method: "POST",
    body: JSON.stringify(entry),
  });
}

export function updateLoreEntry(
  lorebookId: string,
  entryId: string,
  entry: LorebookEntryInput & { expectedRevision: number },
): Promise<LorebookEntryDto> {
  return requestJson<LorebookEntryDto>(
    `/api/lorebooks/${encodeURIComponent(lorebookId)}/entries/${encodeURIComponent(entryId)}`,
    { method: "PATCH", body: JSON.stringify(entry) },
  );
}

export async function deleteLoreEntry(lorebookId: string, entryId: string): Promise<void> {
  await request(
    `/api/lorebooks/${encodeURIComponent(lorebookId)}/entries/${encodeURIComponent(entryId)}`,
    { method: "DELETE" },
  );
}
