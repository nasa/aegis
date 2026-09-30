export async function isLoggedIn(): Promise<WrappedResponse<AppUser>> {
  const res = await fetch(`/api/v1/auth/isLoggedIn`);
  if (res.status !== 200) {
    let errorMessage = `${res.status} ${res.statusText}`;
    try {
      const errorBody = await res.json();
      if (errorBody?.message) errorMessage = errorBody.message;
    } catch {
      /* response body is not JSON */
    }
    return { status: "error", message: errorMessage };
  }
  const response: WrappedResponse<AppUser> = await res.json();

  return response;
}

export async function login(username: string, password: string): Promise<WrappedResponse<AppUser>> {
  const data = new URLSearchParams();
  data.append("username", username);
  data.append("password", password);

  const res = await fetch(`/api/v1/auth/login`, { method: "POST", body: data });
  if (res.status !== 200) {
    let errorMessage = `${res.status} ${res.statusText}`;
    try {
      const errorBody = await res.json();
      if (errorBody?.message) errorMessage = errorBody.message;
    } catch {
      /* response body is not JSON */
    }
    return { status: "error", message: errorMessage };
  }
  const response: WrappedResponse<AppUser> = await res.json();

  return response;
}

export async function logout(): Promise<WrappedResponse<boolean>> {
  const res = await fetch(`/api/v1/auth/logout`);
  if (res.status !== 200) {
    let errorMessage = `${res.status} ${res.statusText}`;
    try {
      const errorBody = await res.json();
      if (errorBody?.message) errorMessage = errorBody.message;
    } catch {
      /* response body is not JSON */
    }
    return { status: "error", message: errorMessage };
  }
  const response: WrappedResponse<boolean> = await res.json();

  return response;
}
