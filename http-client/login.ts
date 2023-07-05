import type { IronSessionData } from "iron-session";

export async function isLoggedIn(): Promise<WrappedResponse<AdminCheck>> {
  const res = await fetch(`/api/users/isLoggedIn`);
  const response: WrappedResponse<AdminCheck> = await res.json();

  return response;
}

export async function isAdmin(): Promise<WrappedResponse<IronSessionData>> {
  const res = await fetch(`/api/users/isAdmin`);
  const response: WrappedResponse<IronSessionData> = await res.json();

  return response;
}

export async function adminRecovery(): Promise<WrappedResponse<void>> {
  const res = await fetch(`/api/users/adminRecovery`);
  const response: WrappedResponse<void> = await res.json();

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
