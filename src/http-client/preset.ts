import { checkResponse } from "http-client/helperResponse";

export async function upsertPresets(presets: Preset[]): Promise<WrappedResponse<Preset[]>> {
  const missionIdStr =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const missionId = missionIdStr ? parseInt(missionIdStr) : undefined;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const requestBody: PresetUpsertRequest = { missionId, socketId, presets };
  const res = await fetch(`/api/v1/preset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  return checkResponse<Preset[]>(res, "Error saving presets to database.");
}

export async function deletePresets(presetUuids: string[]): Promise<WrappedResponse<Preset[]>> {
  const missionIdStr =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const missionId = missionIdStr ? parseInt(missionIdStr) : undefined;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const requestBody: PresetDeleteRequest = { missionId, socketId, presetUuids };
  const res = await fetch(`/api/v1/preset`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  return checkResponse<Preset[]>(res, "Error deleting presets from database.");
}
