// wrap all functions in a jest.fn so they read as a mock and can be referenced in assertions

export const getPOIs = jest.fn(async (): Promise<WrappedResponse<POI[]>> => {
  const res: WrappedResponse<POI[]> = {
    status: "success",
    message: "POIs retrieved",
    data: [],
  };
  return res;
});

export const upsertPOIs = jest.fn(async (pois: POI[]): Promise<WrappedResponse<POI[]>> => {
  //just return the poi that was passed in
  const res: WrappedResponse<POI[]> = {
    status: "success",
    message: "POI upserted",
    data: pois,
  };
  return res;
});

export const deletePOIs = jest.fn(async (): Promise<WrappedResponse<null>> => {
  const res: WrappedResponse<null> = {
    status: "success",
    message: "POI Deleted",
  };
  return res;
});
