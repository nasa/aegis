export async function getAll(
  missionId: number = null
): Promise<WrappedResponse<OneMissionToRuleThemAll>> {
  let res: Response;
  if (missionId) {
    res = await fetch(`/api/v1/all?missionId=${missionId}`);
  } else {
    res = await fetch(`/api/v1/all`);
  }
  const response: WrappedResponse<OneMissionToRuleThemAll> = await res.json();
  return response;
}
