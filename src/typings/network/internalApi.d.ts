interface WrappedResponse<T> {
  status: "success" | "failure" | "error";
  message: string;
  data?: T;
  code?: ElevationErrorCode;
  retryAfterMs?: number;
}

type ElevationErrorCode =
  | "ELEVATION_INVALID_REQUEST"
  | "ELEVATION_TOO_MANY_SAMPLES"
  | "ELEVATION_TOO_MANY_VERTICES"
  | "ELEVATION_RATE_LIMITED"
  | "ELEVATION_BUSY"
  | "ELEVATION_QUEUE_DEADLINE"
  | "ELEVATION_SUPERSEDED"
  | "ELEVATION_TIMEOUT"
  | "ELEVATION_DEM_UNAVAILABLE"
  | "ELEVATION_SAMPLING_FAILED";

type ElevationProfilePostData = {
  missionId: number;
  demFilepath: string;
  path: AEGISPoint[];
  pathSegmentDistances: number[];
  resolutionMeters: number;
  radius: number;
  streamId?: string;
  generation?: number;
};
