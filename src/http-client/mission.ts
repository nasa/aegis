import { checkResponse } from "http-client/helperResponse";

export async function getMissions(): Promise<WrappedResponse<Mission[]>> {
  return checkResponse<Mission[]>(await fetch(`/api/v1/missionAutomerge`));
}

export async function getMissionHomepageItems(
  includeArchived = false
): Promise<WrappedResponse<MissionHomepageItem[]>> {
  const query = includeArchived ? "?includeArchived=true" : "";
  return checkResponse<MissionHomepageItem[]>(await fetch(`/api/v1/missionHomepageItems${query}`));
}

// create a new mission
export async function createMission(
  sourceMission?: Mission
): Promise<WrappedResponse<AutomergeDocListing>> {
  const res = await fetch(`/api/v1/missionAutomerge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sourceMission }),
  });
  return checkResponse<AutomergeDocListing>(res, "Error creating mission.");
}

export async function duplicateMission(missionId: number): Promise<WrappedResponse<number>> {
  const res = await fetch(`/api/v1/missionDup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ missionId }),
  });
  return checkResponse<number>(res, "Error duplicating mission.");
}

export async function deleteMissions(missionIds: number[]): Promise<WrappedResponse<number[]>> {
  const res = await fetch(`/api/v1/missionAutomerge`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ missionIds }),
  });
  return checkResponse<number[]>(res, "Error deleting mission.");
}

// Given that this is a raw dump, we want the raw data and don't need to be worried about whether it matches any specific type.
export async function dumpMission(missionId: number): Promise<WrappedResponse<MissionDump>> {
  const res = await fetch(`/api/v1/missionDump?missionId=${missionId}`);
  return checkResponse<MissionDump>(res, "Error dumping mission.");
}
