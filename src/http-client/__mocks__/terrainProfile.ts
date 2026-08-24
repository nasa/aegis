export const getTerrainProfile = vi.fn(
  async (): Promise<WrappedResponse<TerrainProfile>> => ({
    status: "success",
    data: {
      elevationsMeters: [],
      terrainSlopesDegrees: [],
    },
    message: "Terrain profile sampled",
  })
);

export const getElevationProfile = vi.fn(
  async (): Promise<WrappedResponse<number[][]>> => ({
    status: "success",
    data: [],
    message: "Terrain profile sampled",
  })
);

export const getElevationSinglePoint = vi.fn(
  async (): Promise<WrappedResponse<number>> => ({
    status: "success",
    data: null,
    message: "Terrain profile sampled",
  })
);
