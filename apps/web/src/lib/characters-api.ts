import type {
  CharacterDetail,
  CharacterPayloadDto,
  CharacterSummaryDto,
  CharacterVersionResponse,
} from "@xuyueji/contracts";

import { requestJson } from "./http.js";

export function listCharacters(): Promise<{ characters: CharacterSummaryDto[] }> {
  return requestJson<{ characters: CharacterSummaryDto[] }>("/api/characters");
}

export function getCharacter(characterId: string): Promise<CharacterDetail> {
  return requestJson<CharacterDetail>(`/api/characters/${encodeURIComponent(characterId)}`);
}

export function createCharacter(payload: CharacterPayloadDto): Promise<CharacterDetail> {
  return requestJson<CharacterDetail>("/api/characters", {
    method: "POST",
    body: JSON.stringify({ payload }),
  });
}

export function addCharacterVersion(input: {
  readonly characterId: string;
  readonly expectedActiveVersionId: string;
  readonly payload: CharacterPayloadDto;
}): Promise<CharacterVersionResponse> {
  return requestJson<CharacterVersionResponse>(
    `/api/characters/${encodeURIComponent(input.characterId)}/versions`,
    {
      method: "POST",
      body: JSON.stringify({
        expectedActiveVersionId: input.expectedActiveVersionId,
        payload: input.payload,
      }),
    },
  );
}

export async function deleteCharacter(characterId: string): Promise<void> {
  const response = await fetch(`/api/characters/${encodeURIComponent(characterId)}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Delete failed (${response.status}).`);
  }
}
