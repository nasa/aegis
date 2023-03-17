export async function getUsers(userId: number = null): Promise<WrappedResponse<User_db_type[]>> {
  let res: Response;
  if (userId) {
    res = await fetch(`/api/users?userId=${userId}`);
  } else {
    res = await fetch(`/api/users`);
  }
  const response: WrappedResponse<User_db_type[]> = await res.json();
  return response;
}

export async function upsertUser(userObj: User_db_type): Promise<WrappedResponse<User_db_type>> {
  const res = await fetch(`/api/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(userObj),
  });
  const response: WrappedResponse<User_db_type> = await res.json();
  return response;
}

export async function deleteUser(userId: number): Promise<WrappedResponse<User_db_type>> {
  const res = await fetch(`/api/users?userId=${userId}`, {
    method: "DELETE",
  });
  const response: WrappedResponse<User_db_type> = await res.json();
  return response;
}
