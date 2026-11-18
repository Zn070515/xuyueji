import type {
  CreatePresetRequest,
  PresetDetailDto,
  PresetSummaryDto,
  UpdatePresetRequest,
} from "@xuyueji/contracts";

import { request, requestJson } from "./http.js";

export function listPresets(): Promise<{ presets: PresetSummaryDto[] }> {
  return requestJson<{ presets: PresetSummaryDto[] }>("/api/presets");
}

export function createPreset(input: CreatePresetRequest): Promise<PresetDetailDto> {
  return requestJson<PresetDetailDto>("/api/presets", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getPreset(presetId: string): Promise<PresetDetailDto> {
  return requestJson<PresetDetailDto>(`/api/presets/${encodeURIComponent(presetId)}`);
}

export function updatePreset(
  presetId: string,
  input: UpdatePresetRequest,
): Promise<PresetDetailDto> {
  return requestJson<PresetDetailDto>(`/api/presets/${encodeURIComponent(presetId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deletePreset(presetId: string): Promise<void> {
  await request(`/api/presets/${encodeURIComponent(presetId)}`, { method: "DELETE" });
}
