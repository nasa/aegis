import { prefixUrl } from "utils/basePath";

export async function getAppUsers(userId: number = null): Promise<WrappedResponse<AppUser[]>> {
  let res: Response;
  if (userId) {
    res = await fetch(prefixUrl(`/api/v1/appUsers?userId=${userId}`));
  } else {
    res = await fetch(prefixUrl(`/api/v1/appUsers`));
  }
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
  const response: WrappedResponse<AppUser[]> = await res.json();
  return response;
}

export async function upsertAppUsers(users: AppUser[]): Promise<WrappedResponse<AppUser[]>> {
  const requestBody: UserUpsertRequest = { users };
  const res = await fetch(prefixUrl(`/api/v1/appUsers`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  if (res.status !== 200) {
    let errorMessage = `${res.status} ${res.statusText}`;
    try {
      const errorBody = await res.json();
      if (errorBody?.message) errorMessage = errorBody.message;
    } catch {
      /* response body is not JSON */
    }
    alert(
      `Error saving users to database. Please let the AEGIS developers know. Status ${errorMessage}`
    );
    return { status: "error", message: errorMessage };
  }
  const response: WrappedResponse<AppUser[]> = await res.json();
  return response;
}

export async function deleteAppUsers(userIds: number[]): Promise<WrappedResponse<null>> {
  const requestBody: UserDeleteRequest = { userIds };
  const res = await fetch(prefixUrl(`/api/v1/appUsers`), {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  if (res.status !== 200) {
    let errorMessage = `${res.status} ${res.statusText}`;
    try {
      const errorBody = await res.json();
      if (errorBody?.message) errorMessage = errorBody.message;
    } catch {
      /* response body is not JSON */
    }
    alert(
      `Error deleting users from database. Please let the AEGIS developers know. Status ${errorMessage}`
    );
    return { status: "error", message: errorMessage };
  }
  const response: WrappedResponse<null> = await res.json();
  return response;
}
