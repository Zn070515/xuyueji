import type { PromptPreviewRequest, PromptPreviewResponse } from "@xuyueji/contracts";

import { requestJson } from "./http.js";

export function previewPrompt(input: PromptPreviewRequest): Promise<PromptPreviewResponse> {
  return requestJson<PromptPreviewResponse>("/api/prompt/preview", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
