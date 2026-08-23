import path from "node:path";
import { realpath, stat } from "node:fs/promises";

export const resolveMissionRasterPath = async (
  staticDirectory: string | undefined,
  missionId: number,
  configuredFilePath: string,
  rasterName: string
): Promise<string> => {
  if (!staticDirectory) throw new Error("STATIC_DIR is not configured");
  if (!configuredFilePath) throw new Error(`Mission does not have ${rasterName} configured`);
  if (path.isAbsolute(configuredFilePath)) {
    throw new Error(`Mission ${rasterName} path must be relative`);
  }

  const lexicalDataDirectory = path.resolve(
    staticDirectory,
    "missionFiles",
    missionId.toString(),
    "Data"
  );
  const configuredPath = path.resolve(
    staticDirectory,
    "missionFiles",
    missionId.toString(),
    configuredFilePath
  );
  const lexicalRelativePath = path.relative(lexicalDataDirectory, configuredPath);
  if (
    lexicalRelativePath === "" ||
    lexicalRelativePath.startsWith(`..${path.sep}`) ||
    lexicalRelativePath === ".." ||
    path.isAbsolute(lexicalRelativePath)
  ) {
    throw new Error(`Mission ${rasterName} path must remain inside the mission Data directory`);
  }

  const dataDirectory = await realpath(lexicalDataDirectory);
  const rasterPath = await realpath(configuredPath);
  const relativePath = path.relative(dataDirectory, rasterPath);
  if (
    relativePath === "" ||
    relativePath.startsWith(`..${path.sep}`) ||
    relativePath === ".." ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Mission ${rasterName} path must remain inside the mission Data directory`);
  }

  const rasterStat = await stat(rasterPath);
  if (!rasterStat.isFile()) throw new Error(`Mission ${rasterName} path is not a regular file`);
  if (![".tif", ".tiff"].includes(path.extname(rasterPath).toLowerCase())) {
    throw new Error(`Mission ${rasterName} must be a GeoTIFF`);
  }
  return rasterPath;
};

export const resolveMissionDemPath = (
  staticDirectory: string | undefined,
  missionId: number,
  demFilePath: string
): Promise<string> => resolveMissionRasterPath(staticDirectory, missionId, demFilePath, "DEM");

export const resolveMissionAbsoluteSlopePath = (
  staticDirectory: string | undefined,
  missionId: number,
  absoluteSlopeFilePath: string
): Promise<string> =>
  resolveMissionRasterPath(
    staticDirectory,
    missionId,
    absoluteSlopeFilePath,
    "absolute slope raster"
  );
