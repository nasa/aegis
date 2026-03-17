// wrap all functions in a vi.fn so they read as a mock and can be referenced in assertions

export const getEvas = vi.fn(async (): Promise<WrappedResponse<Eva[]>> => {
  const res: WrappedResponse<Eva[]> = {
    status: "success",
    message: "Evas retrieved",
    data: [],
  };
  return res;
});

export const upsertEvas = vi.fn(async (Evas: Eva[]): Promise<WrappedResponse<Eva[]>> => {
  //just return the Eva that was passed in
  const res: WrappedResponse<Eva[]> = {
    status: "success",
    message: "Eva upserted",
    data: Evas,
  };
  return res;
});

export const deleteEvas = vi.fn(async (): Promise<WrappedResponse<null>> => {
  const res: WrappedResponse<null> = {
    status: "success",
    message: "Eva Deleted",
  };
  return res;
});
