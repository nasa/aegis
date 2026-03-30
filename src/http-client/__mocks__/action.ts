// wrap all functions in a vi.fn so they read as a mock and can be referenced in assertions

export const getActions = vi.fn(async (): Promise<WrappedResponse<Action[]>> => {
  const res: WrappedResponse<Action[]> = {
    status: "success",
    message: "actions retrieved",
    data: [],
  };
  return res;
});

export const upsertActions = vi.fn(
  async (actions: Action[]): Promise<WrappedResponse<Action[]>> => {
    //just return the action that was passed in
    const res: WrappedResponse<Action[]> = {
      status: "success",
      message: "Action upserted",
      data: actions,
    };
    return res;
  }
);

export const deleteActions = vi.fn(async (): Promise<WrappedResponse<null>> => {
  const res: WrappedResponse<null> = {
    status: "success",
    message: "Action Deleted",
  };
  return res;
});
