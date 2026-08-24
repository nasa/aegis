interface WrappedResponse<T> {
  status: "success" | "failure" | "error";
  message: string;
  data?: T;
}

type TerrainProfilePostData = {
  path: AEGISPoint[];
  pathSegmentDistances: number[];
  entityKey?: string;
  getElevationOnly?: boolean;
};

type TerrainProfile = {
  elevationsMeters: number[][];
  terrainSlopesDegrees: (number | null)[][];
};
