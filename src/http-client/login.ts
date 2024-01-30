export async function isLoggedIn(): Promise<WrappedResponse<SessionData>> {
  const res = await fetch(`/api/v1/auth/isLoggedIn`);
  const response: WrappedResponse<SessionData> = await res.json();

  return response;
}

export async function login(
  username: string,
  password: string
): Promise<WrappedResponse<SessionData>> {
  const data = new URLSearchParams();
  data.append("username", username);
  data.append("password", password);

  const res = await fetch(`/api/v1/auth/login`, { method: "POST", body: data });
  const response: WrappedResponse<SessionData> = await res.json();

  return response;
}

export async function logout(): Promise<WrappedResponse<boolean>> {
  const res = await fetch(`/api/v1/auth/logout`);
  const response: WrappedResponse<boolean> = await res.json();

  return response;
}
