import { interpolateSegment } from "./greatCircleInterpolation";
import { sampleRasterPoints } from "./sampleRasterPoints";
import { MAX_RASTER_PROFILE_SAMPLES } from "./constants";

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

  // `steps[n]` is the requested sample count for the path leg from path[n] to path[n + 1].
  // Degenerate counts still produce both endpoints to match interpolateSegment's contract.
  let totalSamples = 0;
  steps.forEach((segmentSteps) => {
    if (!Number.isSafeInteger(segmentSteps) || segmentSteps < 2) {
      throw new Error("Steps must be safe integers of at least two endpoint samples");
    }
    totalSamples += segmentSteps;
  });
  if (totalSamples > MAX_RASTER_PROFILE_SAMPLES) {
    throw new Error(`Raster profile exceeds the ${MAX_RASTER_PROFILE_SAMPLES} sample limit`);
  }

  // Flatten all legs into one point request so shared GeoTIFF blocks are decoded only once.
  const segments = steps.map((segmentSteps, index) =>
    interpolateSegment(path[index], path[index + 1], segmentSteps)
  );
  const result = await sampleRasterPoints(descriptor, segments.flat());
  // Restore the per-leg shape expected by profile consumers. Adjacent legs intentionally retain
  // their shared endpoint in both arrays.
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
