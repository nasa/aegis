/****** GET ******/
export async function getSTMLevel1s(urlParams?: {
  missionId: number;
  level1Uuid?: string;
}): Promise<WrappedResponse<STMLevel1[]>> {
  let params = `stmType=l1&missionId=${urlParams.missionId}`;

  if (urlParams?.level1Uuid) params += `&l1=${urlParams.level1Uuid}`;
  const res = await fetch(`/api/v1/stm?${params}`);
  const response: WrappedResponse<STMLevel1[]> = await res.json();
  return response;
}

export async function getStmLevel2s(urlParams?: {
  missionId: number;
  level1Uuid?: string;
  level2Uuid?: string;
}): Promise<WrappedResponse<STMLevel2[]>> {
  let params = `stmType=l2&missionId=${urlParams.missionId}`;
  if (urlParams?.level1Uuid) params += `&l1=${urlParams.level1Uuid}`;
  if (urlParams?.level2Uuid) params += `&l2=${urlParams.level2Uuid}`;

  const res = await fetch(`/api/v1/stm?${params}`);
  const response: WrappedResponse<STMLevel2[]> = await res.json();
  return response;
}

export async function getSTMLevel3s(urlParams?: {
  missionId: number;
  level1Uuid?: string;
  level2Uuid?: string;
  level3Uuid?: string;
}): Promise<WrappedResponse<STMLevel3[]>> {
  let params = `stmType=l3&missionId=${urlParams.missionId}`;
  if (urlParams?.level1Uuid) params += `&l1=${urlParams.level1Uuid}`;
  if (urlParams?.level2Uuid) params += `&l2=${urlParams.level2Uuid}`;
  if (urlParams?.level3Uuid) params += `&l3=${urlParams.level3Uuid}`;

  const res = await fetch(`/api/v1/stm?${params}`);
  const response: WrappedResponse<STMLevel3[]> = await res.json();
  return response;
}

/****** UPSERT ******/
export async function upsertSTMs(
  mission: number,
  stmObjects: STMLevel1[] | STMLevel2[] | STMLevel3[],
  stmType: "Level1" | "Level2" | "Level3"
): Promise<WrappedResponse<STMLevel1[] | STMLevel2[] | STMLevel3[]>> {
  const stmParam: string = stmType.toLowerCase();

  const res = await fetch(`/api/v1/stm?stmType=${stmParam}&missionId=${mission}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(stmObjects),
  });
  const response: WrappedResponse<typeof stmObjects> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error saving ${stmType}s to database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}

/****** DELETE ******/
export async function deleteSTMs(
  missionId: number,
  stmType: "Level1" | "Level2" | "Level3" | "ALL",
  uuids: string[] = []
): Promise<WrappedResponse<null>> {
  const stmParam: string = stmType.toLowerCase();
  const res = await fetch(`/api/v1/stm?stmType=${stmParam}&missionId=${missionId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(uuids),
  });
  const response: WrappedResponse<null> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error deleting ${stmType}s from database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}
