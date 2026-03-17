// wrap all functions in a vi.fn so they read as a mock and can be referenced in assertions

export const getPresets = vi.fn(async (): Promise<WrappedResponse<Preset[]>> => {
  const res: WrappedResponse<Preset[]> = {
    status: "success",
    message: "Presets retrieved",
    data: [],
  };
  return res;
});

export const upsertPresets = vi.fn(
  async (Presets: Preset[]): Promise<WrappedResponse<Preset[]>> => {
    //just return the Preset that was passed in
    const res: WrappedResponse<Preset[]> = {
      status: "success",
      message: "Preset upserted",
      data: Presets,
    };
    return res;
  }
);

export const deletePresets = vi.fn(async (): Promise<WrappedResponse<null>> => {
  const res: WrappedResponse<null> = {
    status: "success",
    message: "Preset Deleted",
  };
  return res;
});
