type ElevationProfilePostData = {
  missionId: number;
  demFilepath: string;
  path: AEGISPoint[];
  pathSegmentDistances: number[];
  resolutionMeters: number;
  R: number;
};
