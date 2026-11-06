interface WrappedResponse<T> {
  status: "success" | "failure" | "error";
  message: string;
  data?: T;
}

type TerrainProfilePostData = {
  path: AEGISPoint[];
  pathSegmentDistances: number[];
  entityUuid?: string;
  getElevationOnly?: boolean;
  /** Reject sampling until the selected DEM has synced to the server. */
  expectedDem?: Pick<Mission, "demFilePath" | "demResolution">;
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
