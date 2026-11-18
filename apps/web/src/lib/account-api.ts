import { request, requestJson } from "./http.js";

export async function exportAccountData(): Promise<Blob> {
  const response = await request("/api/export");
  return response.blob();
}

export interface ImportResult {
  readonly imported: {
    readonly characters: number;
    readonly conversations: number;
    readonly messages: number;
    readonly skipped: number;
  };
  readonly note: string;
}

export function importAccountData(bundle: unknown): Promise<ImportResult> {
  return requestJson<ImportResult>("/api/import", {
    method: "POST",
    body: JSON.stringify(bundle),
  });
}
