interface WrappedResponse<T> {
  status: "success" | "failure" | "error";
  message: string;
  data?: T;
}

/** Notification banner create/update body after validation, with times parsed to Dates. */
type ValidatedNotificationBannerInput = Omit<NotificationBannerInput, "startsAt" | "endsAt"> & {
  startsAt: Date | null;
  endsAt: Date | null;
};

type NotificationBannerValidationResult =
  { ok: true; value: ValidatedNotificationBannerInput } | { ok: false; message: string };

type TerrainProfilePostData = {
  path: AEGISPoint[];
  pathSegmentDistances: number[];
  entityUuid?: string;
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
