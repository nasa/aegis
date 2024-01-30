// wrap all functions in a jest.fn so they read as a mock and can be referenced in assertions

export const getRexes = jest.fn(async (): Promise<WrappedResponse<Rex[]>> => {
  const res: WrappedResponse<Rex[]> = {
    status: "success",
    message: "Rexes retrieved",
    data: [],
  };
  return res;
});

export const upsertRexes = jest.fn(async (rexes: Rex[]): Promise<WrappedResponse<Rex[]>> => {
  const res: WrappedResponse<Rex[]> = {
    status: "success",
    message: "Rex upserted",
    data: rexes,
  };
  return res;
});

export const deleteRexes = jest.fn(async (): Promise<WrappedResponse<null>> => {
  const res: WrappedResponse<null> = {
    status: "success",
    message: "Rex deleted",
    data: null,
  };
  return res;
});
