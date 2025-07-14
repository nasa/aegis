export async function getUsers(userId: number = null): Promise<WrappedResponse<AppUser[]>> {
  let res: Response;
  if (userId) {
    res = await fetch(`/api/v1/users?userId=${userId}`);
  } else {
    res = await fetch(`/api/v1/users`);
  }
  const response: WrappedResponse<AppUser[]> = await res.json();
  return response;
}

export async function upsertUsers(users: AppUser[]): Promise<WrappedResponse<AppUser[]>> {
  const requestBody: UserUpsertRequest = { users };
  const res = await fetch(`/api/v1/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const response: WrappedResponse<AppUser[]> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error saving users to database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}

export async function deleteUsers(userIds: number[]): Promise<WrappedResponse<null>> {
  const requestBody: UserDeleteRequest = { userIds };
  const res = await fetch(`/api/v1/users`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const response: WrappedResponse<null> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error deleting users from database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}
