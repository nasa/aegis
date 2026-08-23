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
