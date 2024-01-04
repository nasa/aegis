// wrap all functions in a jest.fn so they read as a mock and can be referenced in assertions

export const getElevationProfile = jest.fn(async (): Promise<WrappedResponse<number[][]>> => {
  const res: WrappedResponse<number[][]> = {
    status: "success",
    data: null,
    message: "Success POSTing the job to docker.",
  };
  return res;
});

export const getElevationSinglePoint = jest.fn(async (): Promise<WrappedResponse<number>> => {
  const res: WrappedResponse<number> = {
    status: "success",
    data: null,
    message: "Success POSTing the job to docker.",
  };
  return res;
});
