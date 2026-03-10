export async function getMissionBackup(missionId: number): Promise<WrappedResponse<Mission[]>> {
  const res = await fetch(`/api/v1/mission?missionId=${missionId}`);
  const response: WrappedResponse<Mission[]> = await res.json();
  return response;
}

export async function getMissionHomepageItems(): Promise<WrappedResponse<MissionHomepageItem[]>> {
  const res = await fetch(`/api/v1/missionHomepageItems`);
  const response: WrappedResponse<MissionHomepageItem[]> = await res.json();
  return response;
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
  const response: WrappedResponse<AutomergeDocListing> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error creating mission. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}

export async function duplicateMission(missionId: number): Promise<WrappedResponse<number>> {
  const res = await fetch(`/api/v1/missionDup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ missionId }),
  });
  const response: WrappedResponse<null> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error duplicating mission. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}

export async function deleteMissions(missionIds: number[]): Promise<WrappedResponse<number[]>> {
  const res = await fetch(`/api/v1/missionAutomerge`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ missionIds }),
  });
  const response: WrappedResponse<number[]> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error deleting mission. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}

// Given that this is a raw dump, we want the raw data and don't need to be worried about whether it matches any specific type.
export async function dumpMission(missionId: number): Promise<WrappedResponse<MissionDump>> {
  const res = await fetch(`/api/v1/missionDump?missionId=${missionId}`);
  // Using "any" here because the response is database records that haven't gone through transformation to the AEGIS store types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response: WrappedResponse<any> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error dumping mission. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}
