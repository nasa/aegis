import type { IronSessionData } from "iron-session";

export async function getConfigs(): Promise<WrappedResponse<string[]>> {
  const res = await fetch(`/api/configs/getconfigs`);
  const response: WrappedResponse<string[]> = await res.json();

  return response;
}

export async function getConfig(mission: string): Promise<WrappedResponse<MMGISConfig>> {
  const res = await fetch(`/api/configs/getconfig?mission=${mission}`);
  const response: WrappedResponse<MMGISConfig> = await res.json();

  return response;
}

export async function isLoggedIn(mission: string): Promise<WrappedResponse<boolean>> {
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
