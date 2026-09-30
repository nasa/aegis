// wrap all functions in a vi.fn so they read as a mock and can be referenced in assertions

export const getTraverses = vi.fn(async (): Promise<WrappedResponse<Traverse[]>> => {
  const res: WrappedResponse<Traverse[]> = {
    status: "success",
    message: "Traverses retrieved",
    data: [],
  };
  return res;
});

export const upsertTraverses = vi.fn(
  async (Traverses: Traverse[]): Promise<WrappedResponse<Traverse[]>> => {
    //just return the Traverse that was passed in
    const res: WrappedResponse<Traverse[]> = {
      status: "success",
      message: "Traverse upserted",
      data: Traverses,
    };
    return res;
  }
);

export const deleteTraverses = vi.fn(async (): Promise<WrappedResponse<null>> => {
  const res: WrappedResponse<null> = {
    status: "success",
    message: "Traverse Deleted",
  };
  return res;
});
