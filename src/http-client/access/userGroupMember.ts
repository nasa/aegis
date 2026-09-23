import { checkResponse } from "http-client/helperResponse";

export async function getGroupMembers(groupId: number): Promise<WrappedResponse<AppUser[]>> {
  return checkResponse<AppUser[]>(await fetch(`/api/v1/userGroup/member?groupId=${groupId}`));
}

/** The groups one user belongs to. */
export async function getGroupsForUser(userId: number): Promise<WrappedResponse<UserGroup[]>> {
  return checkResponse<UserGroup[]>(await fetch(`/api/v1/userGroup/member?userId=${userId}`));
}

export async function setGroupMembership(
  body: UserGroupMemberRequest
): Promise<WrappedResponse<boolean>> {
  return checkResponse<boolean>(
    await fetch("/api/v1/userGroup/member", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}
