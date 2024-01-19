// wrap all functions in a jest.fn so they read as a mock and can be referenced in assertions

export const getLogs = jest.fn(async (): Promise<WrappedResponse<Log[]>> => {
  const res: WrappedResponse<Log[]> = {
    status: "success",
    message: "logs retrieved",
    data: [],
  };
  return res;
});

export const upsertLogs = jest.fn(async (logs: Log[]): Promise<WrappedResponse<Log[]>> => {
  //just return the log that was passed in
  const res: WrappedResponse<Log[]> = {
    status: "success",
    message: "Log upserted",
    data: logs,
  };
  return res;
});

export const deleteAllLogs = jest.fn(async (): Promise<WrappedResponse<null>> => {
  const res: WrappedResponse<null> = {
    status: "success",
    message: "Logs Deleted",
  };
  return res;
});
