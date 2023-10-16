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
  return response;
}
