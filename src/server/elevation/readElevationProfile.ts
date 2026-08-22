import { NODATA_SENTINEL } from "./constants";
import {
  sampleRasterProfileInWorker,
  type RasterSamplingWorkerResult,
} from "server/raster/rasterSamplingWorkerPool";
import { sampleRasterProfile } from "server/raster/sampleRasterProfile";
import type { GeographicPoint, RasterDescriptor, RasterMetadata } from "server/raster/types";

export type ElevationProfileResult = {
  elevations: number[][];
  metadata: RasterMetadata;
  samplesRead: number;
  blocksRead: number;
};

export type ElevationProfileWorkerResult = ElevationProfileResult &
  Pick<RasterSamplingWorkerResult, "workerId" | "queueDurationMs" | "executionDurationMs">;

const asElevationProfile = (
  result: Awaited<ReturnType<typeof sampleRasterProfile>>
): ElevationProfileResult => ({
  elevations: result.samples.map((segment) =>
    segment.map((sample) => (sample.status === "value" ? sample.value : NODATA_SENTINEL))
  ),
  metadata: result.metadata,
  samplesRead: result.samplesRead,
  blocksRead: result.blocksRead,
});

export const readElevationProfile = async (
  descriptor: RasterDescriptor,
  path: GeographicPoint[],
  steps: number[]
): Promise<ElevationProfileResult> =>
  asElevationProfile(await sampleRasterProfile(descriptor, path, steps));

export const readElevationProfileInWorker = async (
  descriptor: RasterDescriptor,
  path: GeographicPoint[],
  steps: number[]
): Promise<ElevationProfileWorkerResult> => {
  const result = await sampleRasterProfileInWorker(descriptor, path, steps);
  return {
    ...asElevationProfile(result),
    workerId: result.workerId,
    queueDurationMs: result.queueDurationMs,
    executionDurationMs: result.executionDurationMs,
  };
};
