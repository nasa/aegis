import { validateRasterProfileRequest } from "./constants";
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
  validateRasterProfileRequest(path.length, steps);

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
