import type { IronSessionData } from "iron-session";
export async function getPOIs(mission: number): Promise<WrappedResponse<POI[]>> {
  const res = await fetch(`/api/poi?missionId=${mission}`);
  const response: WrappedResponse<POI[]> = await res.json();
  return response;
}

export async function setPOI(poi: POI, updateActions: boolean): Promise<WrappedResponse<POI>> {
  const res = await fetch("/api/poi", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ poi, updateActions }),
  });
  const response: WrappedResponse<POI> = await res.json();
  return response;
}

export async function deletePOI(poiUuid: string): Promise<WrappedResponse<null>> {
  const res = await fetch(`/api/poi?uuid=${poiUuid}`, {
    method: "DELETE",
  });
  const response: WrappedResponse<null> = await res.json();
  return response;
}

export async function getPresets(mission: number): Promise<WrappedResponse<Preset[]>> {
  const res = await fetch(`/api/preset?missionID=${mission}`);
  const response: WrappedResponse<Preset[]> = await res.json();

  return response;
}

export async function setPreset(preset: Preset): Promise<WrappedResponse<Preset>> {
  const res = await fetch(`/api/preset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ preset }),
  });
  return await res.json();
}

export async function deletePreset(presetUuid: string): Promise<WrappedResponse<Preset>> {
  const res = await fetch(`/api/preset?uuid=${presetUuid}`, {
    method: "DELETE",
  });
  return await res.json();
}

export async function isLoggedIn(): Promise<WrappedResponse<boolean>> {
  const res = await fetch(`/api/users/isLoggedIn`);
  const response: WrappedResponse<boolean> = await res.json();

  return response;
}

export async function login(
  username: string,
  password: string
): Promise<WrappedResponse<IronSessionData>> {
  const data = new URLSearchParams();
  data.append("username", username);
  data.append("password", password);

  const res = await fetch(`/api/users/login`, { method: "POST", body: data });
  const response: WrappedResponse<IronSessionData> = await res.json();

  return response;
}

export async function logout(): Promise<WrappedResponse<boolean>> {
  const res = await fetch(`/api/users/logout`);
  const response: WrappedResponse<boolean> = await res.json();

  return response;
}
