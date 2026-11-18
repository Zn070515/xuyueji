import type {
  CreateRegexRuleRequest,
  RegexRuleDto,
  RegexTestRequest,
  RegexTestResponse,
  UpdateRegexRuleRequest,
} from "@xuyueji/contracts";

import { request, requestJson } from "./http.js";

export function listRegexRules(): Promise<{ rules: RegexRuleDto[] }> {
  return requestJson<{ rules: RegexRuleDto[] }>("/api/regex-rules");
}

export function createRegexRule(input: CreateRegexRuleRequest): Promise<RegexRuleDto> {
  return requestJson<RegexRuleDto>("/api/regex-rules", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateRegexRule(
  ruleId: string,
  input: UpdateRegexRuleRequest,
): Promise<RegexRuleDto> {
  return requestJson<RegexRuleDto>(`/api/regex-rules/${encodeURIComponent(ruleId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function testRegexRule(input: RegexTestRequest): Promise<RegexTestResponse> {
  return requestJson<RegexTestResponse>("/api/regex-rules/test", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteRegexRule(ruleId: string): Promise<void> {
  await request(`/api/regex-rules/${encodeURIComponent(ruleId)}`, { method: "DELETE" });
}
