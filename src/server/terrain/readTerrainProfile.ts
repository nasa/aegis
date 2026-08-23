import { MAX_RASTER_PROFILE_SAMPLES } from "server/raster/constants";
import { interpolateSegment } from "server/raster/greatCircleInterpolation";
import { validateRasterUnitsInMeters } from "server/raster/projection";
import { sampleRasterNeighborhoods } from "server/raster/sampleRasterPoints";
import {
  sampleTerrainProfileInWorker,
  type TerrainProfileSamplingWorkerResult,
} from "server/raster/rasterSamplingWorkerPool";
import { NODATA_SENTINEL } from "server/elevation/constants";

import { calculateTerrainSlopeDegrees } from "./calculateTerrainSlope";

export type TerrainProfileResult = {
  elevationsMeters: number[][];
  terrainSlopesDegrees: (number | null)[][];
  centerSamples: number;
  uniqueDemPixels: number;
  blocksRead: number;
};

export type TerrainProfileWorkerResult = TerrainProfileResult &
  Pick<TerrainProfileSamplingWorkerResult, "workerId" | "queueDurationMs" | "executionDurationMs">;

const validateAndInterpolate = (path: GeographicPoint[], samplesPerSegment: number[]) => {
  if (path.length < 2) throw new Error("A terrain profile requires at least two points");
  if (samplesPerSegment.length !== path.length - 1) {
    throw new Error("Sample counts must contain one value for each path segment");
  }
  let centerSamples = 0;
  samplesPerSegment.forEach((sampleCount) => {
    if (!Number.isSafeInteger(sampleCount) || sampleCount < 2) {
      throw new Error("Sample counts must be safe integers of at least two endpoint samples");
    }
    centerSamples += sampleCount;
  });
  if (centerSamples > MAX_RASTER_PROFILE_SAMPLES) {
    throw new Error(`Terrain profile exceeds the ${MAX_RASTER_PROFILE_SAMPLES} sample limit`);
  }
  return samplesPerSegment.map((sampleCount, index) =>
    interpolateSegment(path[index], path[index + 1], sampleCount)
  );
};

const elevationMeters = (sample: RasterSample, scale: number, offset: number): number =>
  sample.status === "value" ? sample.value * scale + offset : NODATA_SENTINEL;

export const readTerrainProfile = async (
  descriptor: RasterDescriptor,
  path: GeographicPoint[],
  samplesPerSegment: number[]
): Promise<TerrainProfileResult> => {
  const segments = validateAndInterpolate(path, samplesPerSegment);
  const sampled = await sampleRasterNeighborhoods(descriptor, segments.flat());
  validateRasterUnitsInMeters(sampled.metadata);
  if (descriptor.expectedResolutionMeters !== undefined) {
    const tolerance = Math.max(1e-6, descriptor.expectedResolutionMeters * 1e-6);
    const nativeSamplingResolution = Math.min(
      Math.abs(sampled.metadata.resolution[0]),
      Math.abs(sampled.metadata.resolution[1])
    );
    if (Math.abs(nativeSamplingResolution - descriptor.expectedResolutionMeters) > tolerance) {
      throw new Error("Mission DEM resolution is invalid: it does not match the raster metadata");
    }
  }

  let offset = 0;
  const elevationsMeters = segments.map((segment) => {
    const values = sampled.centerSamples
      .slice(offset, offset + segment.length)
      .map((sample) => elevationMeters(sample, sampled.metadata.scale, sampled.metadata.offset));
    offset += segment.length;
    return values;
  });
  offset = 0;
  const terrainSlopesDegrees = segments.map((segment) => {
    const values = sampled.neighborhoods
      .slice(offset, offset + segment.length)
      .map((neighborhood) => calculateTerrainSlopeDegrees(neighborhood, sampled.metadata));
    offset += segment.length;
    return values;
  });

  return {
    elevationsMeters,
    terrainSlopesDegrees,
    centerSamples: sampled.centerSamples.length,
    uniqueDemPixels: sampled.uniquePixelsRead,
    blocksRead: sampled.blocksRead,
  };
};

export const readTerrainProfileInWorker = async (
  descriptor: RasterDescriptor,
  path: GeographicPoint[],
  samplesPerSegment: number[],
  coalescingKey?: string
): Promise<TerrainProfileWorkerResult> => {
  const result = await sampleTerrainProfileInWorker(
    descriptor,
    path,
    samplesPerSegment,
    coalescingKey
  );
  return result;
};
