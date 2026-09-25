import { checkResponse } from "http-client/helperResponse";

/** Everyone holding a grant on one mission, with each group's members expanded. */
export async function getUserAccessForMission(
  missionId: number
): Promise<WrappedResponse<MissionAccessSummary>> {
  return checkResponse<MissionAccessSummary>(
    await fetch(`/api/v1/missionPermission?missionId=${missionId}`)
  );
}

/**
 * Every mission one user can reach. Each entry carries all contributing grants, not only the
 * winning one, so a direct grant out-ranked by a group is still visible.
 */
export async function getUserAccessForAllMissions(
  userId: number
): Promise<WrappedResponse<ResolvedMissionAccess[]>> {
  return checkResponse<ResolvedMissionAccess[]>(
    await fetch(`/api/v1/missionPermission?userId=${userId}`)
  );
}

/** Every mission one group grants */
export async function getGroupMissionGrants(
  groupId: number
): Promise<WrappedResponse<MissionPermission[]>> {
  return checkResponse<MissionPermission[]>(
    await fetch(`/api/v1/missionPermission?groupId=${groupId}`)
  );
}

export async function upsertMissionPermission(
  body: MissionPermissionGrantRequest
): Promise<WrappedResponse<number>> {
  return checkResponse<number>(
    await fetch("/api/v1/missionPermission", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

export async function deleteMissionPermission(
  body: MissionPermissionRevokeRequest
): Promise<WrappedResponse<boolean>> {
  return checkResponse<boolean>(
    await fetch("/api/v1/missionPermission", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}
