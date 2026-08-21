import { interpolateSegment } from "./geoInterpolation";
import { sampleRasterPoints } from "./sampleRasterPoints";
import type { GeographicPoint, RasterDescriptor, RasterMetadata } from "./types";

export const NODATA_SENTINEL = -1100101;

export type ElevationProfileResult = {
  elevations: number[][];
  metadata: RasterMetadata;
  samplesRead: number;
  blocksRead: number;
};

export const readElevationProfile = async (
  descriptor: RasterDescriptor,
  path: GeographicPoint[],
  steps: number[]
): Promise<ElevationProfileResult> => {
  if (path.length < 2) throw new Error("An elevation profile requires at least two points");
  if (steps.length !== path.length - 1) {
    throw new Error("Steps must contain one value for each path segment");
  }

  const segments = steps.map((segmentSteps, index) => {
    if (!Number.isInteger(segmentSteps) || segmentSteps < 0) {
      throw new Error("Steps must be non-negative integers");
    }
    return interpolateSegment(path[index], path[index + 1], segmentSteps);
  });
  const flattenedPoints = segments.flat();
  const result = await sampleRasterPoints(descriptor, flattenedPoints);
  let sampleOffset = 0;
  const elevations = segments.map((segment) => {
    const values = result.samples
      .slice(sampleOffset, sampleOffset + segment.length)
      .map((sample) => (sample.status === "value" ? sample.value : NODATA_SENTINEL));
    sampleOffset += segment.length;
    return values;
  });

  return {
    elevations,
    metadata: result.metadata,
    samplesRead: result.samples.length,
    blocksRead: result.blocksRead,
  };
};
