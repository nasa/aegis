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

type ElevationGdalRequestBody = {
  rasterFilePath: string;
  axes: string;
  band: number;
  path: AEGISPoint[];
  steps: string[];
};
