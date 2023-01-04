/****** GET ******/
export async function getObjectives(urlParams?: {
  missionId: number;
  objectiveUUID?: string;
}): Promise<WrappedResponse<STMObjective[]>> {
  let params = `stmType=o&missionId=${urlParams.missionId}`;

  if (urlParams?.objectiveUUID) params += `&o=${urlParams.objectiveUUID}`;
  const res = await fetch(`/api/stm?${params}`);
  const response: WrappedResponse<STMObjective[]> = await res.json();
  return response;
}

export async function getGoals(urlParams?: {
  missionId: number;
  objectiveUUID?: string;
  goalUUID?: string;
}): Promise<WrappedResponse<STMGoal[]>> {
  let params = `stmType=g&missionId=${urlParams.missionId}`;
  if (urlParams?.objectiveUUID) params += `&o=${urlParams.objectiveUUID}`;
  if (urlParams?.goalUUID) params += `&g=${urlParams.goalUUID}`;

  const res = await fetch(`/api/stm?${params}`);
  const response: WrappedResponse<STMGoal[]> = await res.json();
  return response;
}

export async function getInvestigations(urlParams?: {
  missionId: number;
  objectiveUUID?: string;
  goalUUID?: string;
  investigationUUID?: string;
}): Promise<WrappedResponse<STMInvestigation[]>> {
  let params = `stmType=i&missionId=${urlParams.missionId}`;
  if (urlParams?.objectiveUUID) params += `&o=${urlParams.objectiveUUID}`;
  if (urlParams?.goalUUID) params += `&g=${urlParams.goalUUID}`;
  if (urlParams?.investigationUUID) params += `&i=${urlParams.investigationUUID}`;

  const res = await fetch(`/api/stm?${params}`);
  const response: WrappedResponse<STMInvestigation[]> = await res.json();
  return response;
}

/****** UPSERT ******/
export async function upsertSTM(
  mission: number,
  stmObject: STMObjective | STMGoal | STMInvestigation,
  stmType: "Objective" | "Goal" | "Investigation"
): Promise<WrappedResponse<STMObjective | STMGoal | STMInvestigation>> {
  const stmParam: string = stmType.charAt(0).toLowerCase();

  const res = await fetch(`/api/stm?stmType=${stmParam}&missionId=${mission}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(stmObject),
  });
  const response: WrappedResponse<typeof stmObject> = await res.json();
  return response;
}

/****** DELETE ******/
export async function deleteSTM(
  missionId: number,
  uuid: string,
  stmType: "Objective" | "Goal" | "Investigation"
): Promise<WrappedResponse<string | null>> {
  const stmParam: string = stmType.charAt(0).toLowerCase();

  const res = await fetch(
    `/api/stm?stmType=${stmParam}&missionId=${missionId}&${stmParam}=${uuid}`,
    {
      method: "DELETE",
    }
  );
  const response: WrappedResponse<string | null> = await res.json();
  return response;
}
