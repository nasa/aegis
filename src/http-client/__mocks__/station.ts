// wrap all functions in a jest.fn so they read as a mock and can be referenced in assertions

export const getStations = jest.fn(async (): Promise<WrappedResponse<Station[]>> => {
  const res: WrappedResponse<Station[]> = {
    status: "success",
    message: "Stations retrieved",
    data: [],
  };
  return res;
});

export const upsertStations = jest.fn(
  async (Stations: Station[]): Promise<WrappedResponse<Station[]>> => {
    //just return the Station that was passed in
    const res: WrappedResponse<Station[]> = {
      status: "success",
      message: "Station upserted",
      data: Stations,
    };
    return res;
  }
);

export const deleteStations = jest.fn(async (): Promise<WrappedResponse<null>> => {
  const res: WrappedResponse<null> = {
    status: "success",
    message: "Station Deleted",
  };
  return res;
});
