interface WrappedResponse<T> {
  status: "success" | "failure" | "error";
  message: string;
  data?: T;
}

type ElevationProfilePostData = {
  missionId: number;
  demFilepath: string;
  path: AEGISPoint[];
  pathSegmentDistances: number[];
  resolutionMeters: number;
  radius: number;
};

type TerrainProfilePostData = {
  path: AEGISPoint[];
  pathSegmentDistances: number[];
  entityKey?: string;
};

type TerrainProfile = {
  elevationsMeters: number[][];
  terrainSlopesDegrees: (number | null)[][];
};
