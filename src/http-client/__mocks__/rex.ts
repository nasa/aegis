// wrap all functions in a vi.fn so they read as a mock and can be referenced in assertions

export const getRexes = vi.fn(async (): Promise<WrappedResponse<Rex[]>> => {
  const res: WrappedResponse<Rex[]> = {
    status: "success",
    message: "Rexes retrieved",
    data: [],
  };
  return res;
});

export const upsertRexes = vi.fn(async (rexes: Rex[]): Promise<WrappedResponse<Rex[]>> => {
  const res: WrappedResponse<Rex[]> = {
    status: "success",
    message: "Rex upserted",
    data: rexes,
  };
  return res;
});

export const deleteRexes = vi.fn(async (): Promise<WrappedResponse<null>> => {
  const res: WrappedResponse<null> = {
    status: "success",
    message: "Rex deleted",
    data: null,
  };
  return res;
});
