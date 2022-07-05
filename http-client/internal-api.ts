export async function getConfigs(): Promise<WrappedResponse<string[]>> {
  const res = await fetch(`/api/configs/getconfigs`);
  const response: WrappedResponse<string[]> = await res.json();

  return response;
}

export async function getConfig(mission: string): Promise<WrappedResponse<MMGISConfig>> {
  const res = await fetch(`/api/configs/getconfig?mission=${mission}`);
  const response: WrappedResponse<MMGISConfig> = await res.json();

  return response;
}
