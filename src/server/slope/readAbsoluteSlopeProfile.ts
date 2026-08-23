import {
  sampleRasterProfileInWorker,
  type RasterSamplingWorkerResult,
} from "server/raster/rasterSamplingWorkerPool";
import { sampleRasterProfile } from "server/raster/sampleRasterProfile";
import type { GeographicPoint, RasterDescriptor, RasterMetadata } from "server/raster/types";

export type AbsoluteSlopeProfileResult = {
  absoluteSlopes: (number | null)[][];
  metadata: RasterMetadata;
  samplesRead: number;
  blocksRead: number;
};

export type AbsoluteSlopeProfileWorkerResult = AbsoluteSlopeProfileResult &
  Pick<RasterSamplingWorkerResult, "workerId" | "queueDurationMs" | "executionDurationMs">;

const asAbsoluteSlopeProfile = (
  result: Awaited<ReturnType<typeof sampleRasterProfile>>
): AbsoluteSlopeProfileResult => ({
  absoluteSlopes: result.samples.map((segment) =>
    segment.map((sample) => (sample.status === "value" ? sample.value : null))
  ),
  metadata: result.metadata,
  samplesRead: result.samplesRead,
  blocksRead: result.blocksRead,
});

export const readAbsoluteSlopeProfile = async (
  descriptor: RasterDescriptor,
  path: GeographicPoint[],
  steps: number[]
): Promise<AbsoluteSlopeProfileResult> =>
  asAbsoluteSlopeProfile(await sampleRasterProfile(descriptor, path, steps));

export const readAbsoluteSlopeProfileInWorker = async (
  descriptor: RasterDescriptor,
  path: GeographicPoint[],
  steps: number[]
): Promise<AbsoluteSlopeProfileWorkerResult> => {
  const result = await sampleRasterProfileInWorker(descriptor, path, steps);
  return {
    ...asAbsoluteSlopeProfile(result),
    workerId: result.workerId,
    queueDurationMs: result.queueDurationMs,
    executionDurationMs: result.executionDurationMs,
  };
};
