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
  /** Drag previews skip the database cache. */
  preview?: boolean;
};

type TerrainProfile = {
  elevationsMeters: number[][];
  terrainSlopesDegrees: (number | null)[][];
};

type TerrainProfileResponse = WrappedResponse<TerrainProfile> & { httpStatus?: number };

type TerrainProfileBatchPostData = {
  profiles: TerrainProfilePostData[];
};
