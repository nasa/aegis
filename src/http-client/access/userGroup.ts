import { checkResponse } from "http-client/helperResponse";

export async function getUserGroups(): Promise<WrappedResponse<UserGroupSummary[]>> {
  return checkResponse<UserGroupSummary[]>(await fetch("/api/v1/userGroup"));
}

export async function upsertUserGroup(
  body: UserGroupUpsertRequest
): Promise<WrappedResponse<UserGroup>> {
  return checkResponse<UserGroup>(
    await fetch("/api/v1/userGroup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

export async function deleteUserGroup(
  body: UserGroupDeleteRequest
): Promise<WrappedResponse<boolean>> {
  return checkResponse<boolean>(
    await fetch("/api/v1/userGroup", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}
