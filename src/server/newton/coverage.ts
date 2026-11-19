/**
 * Whether Newton can plan paths for a mission: one `maps/probe` over the mission's area.
 * The area is the mission DEM's extent in its own CRS, or the lander location without one.
 */
import path from "node:path";
import { fromFile } from "geotiff";

import {
  newtonOptionsFromEnv,
  newtonProbeExtent,
  newtonProbePoint,
} from "server/newton/v1/http-newton";
import { getRasterProjections } from "server/raster/projection";
import { serverLogger } from "utils/logging/serverLogger";

/** The DEM's extent and CRS, or null when it can't be read. */
export async function demProbeRegion(absolutePath: string): Promise<NewtonProbeRegion | null> {
  let tiff: Awaited<ReturnType<typeof fromFile>> | undefined;
  try {
    tiff = await fromFile(absolutePath);
    const image = await tiff.getImage();
    const [minX, minY, maxX, maxY] = image.getBoundingBox();
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
    const { projection } = getRasterProjections({
      geoKeys: (image.getGeoKeys() ?? {}) as Record<string, unknown>,
    });
    return { kind: "extent", extent: [minX, minY, maxX, maxY], crs: projection };
  } catch (error) {
    serverLogger.info({
      logId: "newton:demProbeRegion:unreadableDem",
      logValue: `Can't read the DEM extent of ${absolutePath}: ${error instanceof Error ? error.message : String(error)}`,
    });
    return null;
  } finally {
    await tiff?.close();
  }
}

function landerRegion(mission: Mission): NewtonProbeRegion | null {
  const { lat, lng } = mission.landerLocation ?? { lat: null, lng: null };
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90) return null;
  return { kind: "point", lon: lng, lat };
}

const demPath = (missionId: number, mission: Mission): string | null =>
  mission.demFilePath
    ? path.resolve(
        process.env.STATIC_DIR ?? "",
        "missionFiles",
        missionId.toString(),
        mission.demFilePath
      )
    : null;

/** A probe takes well under a second, so a slower answer means Newton isn't responding. */
export const NEWTON_COVERAGE_TIMEOUT_MS = 5_000;

const probe = (planet: Newton.Planet, region: NewtonProbeRegion) => {
  const env = newtonOptionsFromEnv();
  const options = { ...env, timeoutMs: Math.min(env.timeoutMs, NEWTON_COVERAGE_TIMEOUT_MS) };
  return region.kind === "extent"
    ? newtonProbeExtent({ planet, extent: region.extent, crs: region.crs, type: "slope" }, options)
    : newtonProbePoint({ planet, lon: region.lon, lat: region.lat, type: "slope" }, options);
};

/**
 * Probes Newton for slope maps over the mission's area. A DEM CRS Newton rejects falls back
 * to the lander location. Resolves to `unavailable` when Newton can't be reached.
 */
export async function getNewtonCoverage(
  missionId: number,
  mission: Mission,
  planet: Newton.Planet
): Promise<{ kind: "ok"; coverage: NewtonCoverage } | { kind: "unavailable"; message: string }> {
  const file = demPath(missionId, mission);
  const regions = [file ? await demProbeRegion(file) : null, landerRegion(mission)].filter(
    (region): region is NewtonProbeRegion => region !== null
  );
  const none = (reason: NewtonCoverageReason): NewtonCoverage => ({
    supported: false,
    reason,
    planet,
    probedBy: null,
    maps: [],
  });
  if (regions.length === 0) return { kind: "ok", coverage: none("no_area") };

  for (const region of regions) {
    const result = await probe(planet, region);
    if (result.kind === "rejected") continue;
    if (result.kind === "transient") return { kind: "unavailable", message: result.message };
    // Newton filters by type; filtering again guards against an older Newton.
    const maps = result.data.maps
      .filter((map) => map.type === "slope")
      .map(({ name, resolution }) => ({ name, resolution }));
    return {
      kind: "ok",
      coverage: {
        supported: maps.length > 0,
        reason: maps.length > 0 ? "covered" : "no_slope_map",
        planet,
        probedBy: region.kind === "extent" ? "dem_extent" : "lander",
        maps,
      },
    };
  }
  return { kind: "ok", coverage: none("no_area") };
}
