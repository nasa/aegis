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

export async function upsertUser(userObj: User): Promise<WrappedResponse<User>> {
  const res = await fetch(`/api/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(userObj),
  });
  const response: WrappedResponse<User> = await res.json();
  return response;
}

export async function upsertAdmin(recoveryKey: string): Promise<WrappedResponse<User>> {
  const res = await fetch(`/api/users/adminRecovery?recoveryKey=${recoveryKey}`, {
    method: "GET",
  });
  const response: WrappedResponse<User> = await res.json();
  return response;
}

export async function deleteUser(userId: number): Promise<WrappedResponse<User>> {
  const res = await fetch(`/api/users?userId=${userId}`, {
    method: "DELETE",
  });
  const response: WrappedResponse<User> = await res.json();
  return response;
}
