export async function getUsers(userId: number = null): Promise<WrappedResponse<User[]>> {
  let res: Response;
  if (userId) {
    res = await fetch(`/api/users?userId=${userId}`);
  } else {
    res = await fetch(`/api/users`);
  }
  const response: WrappedResponse<User[]> = await res.json();
  return response;
}

export async function upsertUsers(userObjs: User[]): Promise<WrappedResponse<User[]>> {
  const res = await fetch(`/api/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(userObjs),
  });
  const response: WrappedResponse<User[]> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error saving users to database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}

export async function deleteUsers(userIds: number[]): Promise<WrappedResponse<null>> {
  const res = await fetch(`/api/users`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(userIds),
  });
  const response: WrappedResponse<null> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error deleting users from database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}
