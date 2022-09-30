import type { IronSessionData } from "iron-session";
import type { Mission } from "server/database/models/mission.model";

export async function getMissions(): Promise<WrappedResponse<AEGISMission[]>> {
  const res = await fetch(`/api/mission/missions`);
  const response: WrappedResponse<AEGISMission[]> = await res.json();

  return response;
}

export async function getMission(mission: number): Promise<WrappedResponse<Mission>> {
  const res = await fetch(`/api/mission/${mission}`);
  const response: WrappedResponse<Mission> = await res.json();

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
