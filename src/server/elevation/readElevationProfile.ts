import { MAX_ELEVATION_PROFILE_SAMPLES, NODATA_SENTINEL } from "./constants";
import { interpolateSegment } from "./geoInterpolation";
import { sampleRasterPoints } from "server/raster/sampleRasterPoints";
import type { GeographicPoint, RasterDescriptor, RasterMetadata } from "server/raster/types";

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

  let totalSamples = 0;
  steps.forEach((segmentSteps) => {
    if (!Number.isSafeInteger(segmentSteps) || segmentSteps < 0) {
      throw new Error("Steps must be non-negative safe integers");
    }
    totalSamples += segmentSteps <= 1 ? 2 : segmentSteps;
  });
  if (totalSamples > MAX_ELEVATION_PROFILE_SAMPLES) {
    throw new Error(`Elevation profile exceeds the ${MAX_ELEVATION_PROFILE_SAMPLES} sample limit`);
  }

  const segments = steps.map((segmentSteps, index) =>
    interpolateSegment(path[index], path[index + 1], segmentSteps)
  );
  const result = await sampleRasterPoints(descriptor, segments.flat());
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
