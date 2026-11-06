import path from "node:path";
import { readdir, realpath } from "node:fs/promises";
import { fromFile } from "geotiff";
import { getRasterMetadata } from "./rasterReader";
import { getRasterProjections, validateRasterUnitsInMeters } from "./projection";

const dataDirectory = (missionId: number): string => {
  if (!Number.isSafeInteger(missionId) || missionId <= 0) throw new Error("Invalid mission ID");
  return path.resolve(process.env.STATIC_DIR ?? "", "missionFiles", String(missionId), "Data");
};

/** Resolve only files inside this mission's Data folder, including through symlinks. */
export async function resolveMissionDemPath(missionId: number, filePath: string): Promise<string> {
  if (
    typeof filePath !== "string" ||
    !filePath.startsWith("Data/") ||
    filePath.includes("\\") ||
    filePath.split("/").some((part) => !part || part === "." || part === "..") ||
    !/\.tiff?$/i.test(filePath)
  )
    throw new Error("DEM must be a GeoTIFF in the mission Data folder");
  const root = await realpath(dataDirectory(missionId));
  const target = await realpath(path.join(root, filePath.slice(5)));
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("DEM must be inside the mission Data folder");
  }
  return target;
}

/** Read only GeoTIFF headers, never the elevation pixels or overview image. */
export async function readMissionDem(missionId: number, filePath: string): Promise<MissionDem> {
  const absolutePath = await resolveMissionDemPath(missionId, filePath);
  // A fresh handle ensures replacing a file and refreshing the picker reads its new metadata.
  const tiff = await fromFile(absolutePath);
  try {
    const metadata = getRasterMetadata(await tiff.getImage());
    if (metadata.geoKeys.GTModelTypeGeoKey === 2) {
      throw new Error(
        "DEM must use a projected CRS with metre units; geographic degrees are unsupported"
      );
    }
    validateRasterUnitsInMeters(metadata);
    getRasterProjections(metadata);
    if (metadata.samplesPerPixel !== 1) throw new Error("DEM must have one elevation band");
    // Match the terrain sampler's spacing for rectangular pixels.
    const resolution = Math.min(...metadata.resolution.map(Math.abs));
    return { filePath, resolution, error: null };
  } finally {
    await tiff.close();
  }
}

export async function listMissionDems(missionId: number): Promise<MissionDem[]> {
  const root = dataDirectory(missionId);
  const files: string[] = [];
  const visit = async (directory: string, prefix: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const filePath = `${prefix}/${entry.name}`;
      // Skip symlinks when walking so a linked folder cannot escape the mission or form a loop.
      if (entry.isDirectory()) await visit(path.join(directory, entry.name), filePath);
      else if (entry.isFile() && /\.tiff?$/i.test(entry.name)) files.push(filePath);
    }
  };
  try {
    await visit(root, "Data");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const dems: MissionDem[] = [];
  for (const filePath of files.sort()) {
    try {
      dems.push(await readMissionDem(missionId, filePath));
    } catch (error) {
      dems.push({
        filePath,
        resolution: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return dems;
}
