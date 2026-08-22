import { MAX_RASTER_PROFILE_SAMPLES } from "./constants";
import { interpolateSegment } from "./greatCircleInterpolation";
import { sampleRasterPoints } from "./sampleRasterPoints";
import type { GeographicPoint, RasterDescriptor, RasterMetadata, RasterSample } from "./types";

export type RasterProfileSamplingResult = {
  samples: RasterSample[][];
  metadata: RasterMetadata;
  samplesRead: number;
  blocksRead: number;
};

export const sampleRasterProfile = async (
  descriptor: RasterDescriptor,
  path: GeographicPoint[],
  steps: number[]
): Promise<RasterProfileSamplingResult> => {
  if (path.length < 2) throw new Error("A raster profile requires at least two points");
  if (steps.length !== path.length - 1) {
    throw new Error("Steps must contain one value for each path segment");
  }

  let totalSamples = 0;
  steps.forEach((segmentSteps) => {
    if (!Number.isSafeInteger(segmentSteps) || segmentSteps < 0) {
      throw new Error("Steps must be non-negative safe integers");
    }
    totalSamples += segmentSteps <= 1 ? 2 : segmentSteps;
  });
  if (totalSamples > MAX_RASTER_PROFILE_SAMPLES) {
    throw new Error(`Raster profile exceeds the ${MAX_RASTER_PROFILE_SAMPLES} sample limit`);
  }

  const segments = steps.map((segmentSteps, index) =>
    interpolateSegment(path[index], path[index + 1], segmentSteps)
  );
  const result = await sampleRasterPoints(descriptor, segments.flat());
  let sampleOffset = 0;
  const samples = segments.map((segment) => {
    const segmentSamples = result.samples.slice(sampleOffset, sampleOffset + segment.length);
    sampleOffset += segment.length;
    return segmentSamples;
  });

  return {
    samples,
    metadata: result.metadata,
    samplesRead: result.samples.length,
    blocksRead: result.blocksRead,
  };
};
