import type {
  PersonaDetailDto,
  PersonaPayloadDto,
  PersonaSummaryDto,
  PersonaVersionResponse,
} from "@xuyueji/contracts";

import { request, requestJson } from "./http.js";

export function listPersonas(): Promise<{ personas: PersonaSummaryDto[] }> {
  return requestJson<{ personas: PersonaSummaryDto[] }>("/api/personas");
}

export function getPersona(personaId: string): Promise<PersonaDetailDto> {
  return requestJson<PersonaDetailDto>(`/api/personas/${encodeURIComponent(personaId)}`);
}

export function createPersona(payload: PersonaPayloadDto): Promise<PersonaDetailDto> {
  return requestJson<PersonaDetailDto>("/api/personas", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function addPersonaVersion(
  personaId: string,
  input: { expectedActiveVersionId: string; payload: PersonaPayloadDto },
): Promise<PersonaVersionResponse> {
  return requestJson<PersonaVersionResponse>(
    `/api/personas/${encodeURIComponent(personaId)}/versions`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function deletePersona(personaId: string): Promise<void> {
  await request(`/api/personas/${encodeURIComponent(personaId)}`, { method: "DELETE" });
}
