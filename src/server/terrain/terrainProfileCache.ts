import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { DocHandle } from "@automerge/automerge-repo/slim";
import { RasterSamplingWorkerPoolSupersededError } from "server/raster/rasterSamplingWorkerPool";
import { serverLogger } from "utils/logging/serverLogger";

// Only pending work is held in memory. Completed profiles live exclusively on disk.
const pending = new Map<string, Promise<unknown>>();
const latestInputs = new Map<string, string>();
async function exclusive<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = pending.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(work);
  pending.set(key, next);
  try {
    return await next;
  } finally {
    if (pending.get(key) === next) pending.delete(key);
  }
}

export const terrainCacheDirectory = (missionId: number): string => {
  if (!Number.isSafeInteger(missionId) || missionId <= 0) throw new Error("Invalid mission ID");
  return path.resolve(
    process.env.STATIC_DIR ?? "",
    "missionFiles",
    String(missionId),
    ".terrain-profiles"
  );
};
const cacheFile = (missionId: number, entity: string): string => {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(entity)) throw new Error("Invalid cache entity");
  return path.join(terrainCacheDirectory(missionId), `${entity}.json`);
};

export async function cachedTerrainProfile<T extends TerrainProfile>(args: {
  missionId: number;
  entity: string;
  rasterPath: string;
  inputs: unknown;
  isCurrent: () => boolean;
  compute: () => Promise<T>;
}): Promise<TerrainProfile> {
  const file = cacheFile(args.missionId, args.entity);
  const requested = JSON.stringify(args.inputs);
  latestInputs.set(file, requested);
  return exclusive(file, async () => {
    if (latestInputs.get(file) !== requested) throw new RasterSamplingWorkerPoolSupersededError();
    const stat = await fs.stat(args.rasterPath);
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify([1, args.rasterPath, stat.size, stat.mtimeMs, stat.ctimeMs, args.inputs])
      )
      .digest("hex");
    try {
      const stored = JSON.parse(await fs.readFile(file, "utf8"));
      if (stored?.fingerprint === fingerprint && validProfile(stored.profile)) {
        serverLogger.debug({
          logId: "terrain-cache",
          logValue: `Hit ${args.entity}`,
          missionId: args.missionId,
        });
        return stored.profile;
      }
    } catch (error) {
      if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== "ENOENT")
        throw error;
    }
    serverLogger.debug({
      logId: "terrain-cache",
      logValue: `Miss ${args.entity}`,
      missionId: args.missionId,
    });
    const result = await args.compute();
    const profile = {
      elevationsMeters: result.elevationsMeters,
      terrainSlopesDegrees: result.terrainSlopesDegrees,
    };
    if (args.isCurrent() && latestInputs.get(file) === requested) {
      await fs.mkdir(path.dirname(file), { recursive: true });
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, JSON.stringify({ fingerprint, profile }) + "\n", "utf8");
        if (args.isCurrent() && latestInputs.get(file) === requested)
          await fs.rename(temporary, file);
      } finally {
        await fs.rm(temporary, { force: true });
      }
    }
    return profile;
  }).finally(() => {
    if (!pending.has(file)) latestInputs.delete(file);
  });
}

function validProfile(profile: TerrainProfile): boolean {
  return (
    !!profile &&
    Array.isArray(profile.elevationsMeters) &&
    profile.elevationsMeters.length > 0 &&
    Array.isArray(profile.terrainSlopesDegrees) &&
    profile.terrainSlopesDegrees.length === profile.elevationsMeters.length &&
    profile.elevationsMeters.every(
      (segment) => Array.isArray(segment) && segment.length >= 2 && segment.every(Number.isFinite)
    ) &&
    profile.terrainSlopesDegrees.every(
      (segment, index) =>
        Array.isArray(segment) &&
        segment.length === profile.elevationsMeters[index].length &&
        segment.every((value) => value === null || Number.isFinite(value))
    )
  );
}

export async function pruneTerrainProfiles(
  mission: Mission,
  current: () => Mission = () => mission
): Promise<void> {
  const directory = terrainCacheDirectory(mission.id);
  let files: string[];
  try {
    files = await fs.readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map(async (file) => {
        const entity = file.slice(0, -5);
        if (mission.traverses?.[entity] || mission.stations?.[entity]) return;
        const target = cacheFile(mission.id, entity);
        await exclusive(target, async () => {
          const latest = current();
          if (!latest?.traverses?.[entity] && !latest?.stations?.[entity])
            await fs.rm(target, { force: true });
        });
      })
  );
}

const watched = new WeakSet<DocHandle<Mission>>();
export function watchTerrainCache(handle: DocHandle<Mission>): void {
  if (watched.has(handle)) return;
  watched.add(handle);
  let previous: Set<string> | undefined;
  const reconcile = () => {
    const mission = handle.doc();
    if (!mission?.id) return;
    const current = new Set([
      ...Object.keys(mission.traverses ?? {}),
      ...Object.keys(mission.stations ?? {}),
    ]);
    const removed = !previous || [...previous].some((key) => !current.has(key));
    previous = current;
    if (removed)
      pruneTerrainProfiles(mission, () => handle.doc()).catch((error) =>
        serverLogger.error(
          {
            logId: "terrain-cache",
            logValue: "Could not clean terrain profiles",
            missionId: mission.id,
          },
          error
        )
      );
  };
  handle.on("change", reconcile);
  handle.on("delete", () => handle.off("change", reconcile));
  handle
    .whenReady()
    .then(reconcile)
    .catch(() => {});
}

/** Called after deleting the handle, before removing the mission directory. */
export async function waitForTerrainCache(missionId: number): Promise<void> {
  const prefix = terrainCacheDirectory(missionId) + path.sep;
  await Promise.allSettled(
    [...pending].filter(([file]) => file.startsWith(prefix)).map(([, work]) => work)
  );
}
