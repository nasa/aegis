import path from "node:path";
import process from "node:process";

import { readElevationProfile } from "./readElevationProfile";
import type { GeographicPoint } from "./types";

const option = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};

const usage = (): never => {
  throw new Error(
    'Usage: npm run elevation:prototype -- --raster <file> --projection <proj4> --path \'[{"lat":-3.6,"lng":-17.4},{"lat":-3.7,"lng":-17.5}]\' [--steps \'[2]\']'
  );
};

const raster = option("raster");
const projection = option("projection");
const pathJson = option("path");
if (!raster || !projection || !pathJson) usage();

const profilePath = JSON.parse(pathJson) as GeographicPoint[];
const steps = option("steps")
  ? (JSON.parse(option("steps") as string) as number[])
  : Array.from({ length: profilePath.length - 1 }, () => 2);

const result = await readElevationProfile(
  { absolutePath: path.resolve(raster), projection },
  profilePath,
  steps
);

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
