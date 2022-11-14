import type { IronSessionData } from "iron-session";

export async function getPOIs(mission: number): Promise<WrappedResponse<POI[]>> {
  const res = await fetch(`/api/poi?missionId=${mission}`);
  const response: WrappedResponse<POI[]> = await res.json();
  return response;
}

export async function setPOI(poi: POI): Promise<WrappedResponse<POI>> {
  const res = await fetch("/api/poi", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(poi),
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

export async function getMissions(): Promise<WrappedResponse<AEGISMission[]>> {
  const res = await fetch(`/api/mission/missions`);
  const response: WrappedResponse<AEGISMission[]> = await res.json();

  return response;
}

export async function getMission(mission: number): Promise<WrappedResponse<AEGISMission>> {
  const res = await fetch(`/api/mission/${mission}`);
  const response: WrappedResponse<AEGISMission> = await res.json();

  return response;
}

export async function getLayers(mission: number): Promise<WrappedResponse<AEGISLayer[]>> {
  const res = await fetch(`/api/layer/${mission}`);
  const response: WrappedResponse<AEGISLayer[]> = await res.json();

  return response;
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
