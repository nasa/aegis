// wrap all functions in a vi.fn so they read as a mock and can be referenced in assertions

export const getMissions = vi.fn(async (): Promise<WrappedResponse<Mission[]>> => {
  const res: WrappedResponse<Mission[]> = {
    status: "success",
    message: "Missions retrieved",
    data: [],
  };
  return res;
});

export const getMissionHomepageItems = vi.fn(
  async (): Promise<WrappedResponse<MissionHomepageItem[]>> => {
    const response: WrappedResponse<MissionHomepageItem[]> = {
      status: "success",
      message: "missionHomepageItems GET successful",
      data: [],
    };
    return response;
  }
);

export const upsertMissions = vi.fn(
  async (Missions: Mission[]): Promise<WrappedResponse<Mission[]>> => {
    //just return the Mission that was passed in
    const res: WrappedResponse<Mission[]> = {
      status: "success",
      message: "Mission upserted",
      data: Missions,
    };
    return res;
  }
);

export const deleteMissions = vi.fn(async (): Promise<WrappedResponse<null>> => {
  const res: WrappedResponse<null> = {
    status: "success",
    message: "Mission Deleted",
  };
  return res;
});
