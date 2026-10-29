import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import type { DocHandle } from "@automerge/automerge-repo/slim";
import { LockMode } from "@mikro-orm/postgresql";
import { Doc_Listing_db, Terrain_Profile_Cache_db } from "server/database/models/_allModels";
import { globalValues } from "server/express/global";
import { RasterSamplingWorkerPoolSupersededError } from "server/raster/rasterSamplingWorkerPool";
import { serverLogger } from "utils/logging/serverLogger";

// Only pending work is held in memory. Completed profiles live in the database.
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

const cacheKey = (missionId: number, entity: string): string => {
  if (!Number.isSafeInteger(missionId) || missionId <= 0) throw new Error("Invalid mission ID");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(entity)) throw new Error("Invalid cache entity");
  return `${missionId}:${entity}`;
};

export async function loadMissionTerrainProfileCache(
  missionId: number
): Promise<MissionTerrainProfileCache> {
  const rows = await globalValues.orm.em.fork().find(Terrain_Profile_Cache_db, { missionId });
  return { missionId, profiles: new Map(rows.map((row) => [row.entity, row])) };
}

export async function cachedTerrainProfile<T extends TerrainProfile>(args: {
  missionId: number;
  entity: string;
  rasterPath: string;
  inputs: unknown;
  isCurrent: () => boolean;
  compute: () => Promise<T>;
  onCacheStatus?: (status: "hit" | "miss") => void;
  cache?: MissionTerrainProfileCache;
}): Promise<TerrainProfile> {
  const key = cacheKey(args.missionId, args.entity);
  if (args.cache && args.cache.missionId !== args.missionId)
    throw new Error("Invalid terrain profile cache mission ID");
  const owner = { missionId: args.missionId, entity: args.entity };
  const requested = JSON.stringify(args.inputs);
  // A queued request must see the preceding writer's result rather than its older snapshot.
  const refresh = pending.has(key);
  latestInputs.set(key, requested);
  return exclusive(key, async () => {
    if (latestInputs.get(key) !== requested) throw new RasterSamplingWorkerPoolSupersededError();
    const stat = await fs.stat(args.rasterPath);
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify([1, args.rasterPath, stat.size, stat.mtimeMs, stat.ctimeMs, args.inputs])
      )
      .digest("hex");
    const em = globalValues.orm.em.fork();
    const stored =
      args.cache && !refresh
        ? args.cache.profiles.get(args.entity)
        : await em.findOne(Terrain_Profile_Cache_db, owner);
    if (stored?.fingerprint === fingerprint && validProfile(stored.profile)) {
      args.cache?.profiles.set(args.entity, stored);
      args.onCacheStatus?.("hit");
      return stored.profile;
    }
    args.onCacheStatus?.("miss");
    const result = await args.compute();
    const profile = {
      elevationsMeters: result.elevationsMeters,
      terrainSlopesDegrees: result.terrainSlopesDegrees,
    };
    if (args.isCurrent() && latestInputs.get(key) === requested) {
      const published = await em.transactional(async (tx) => {
        // Lock only while publishing, so mission deletion can proceed during sampling.
        // A deleted listing must never be recreated by a late cache write.
        const listing = await tx.findOne(
          Doc_Listing_db,
          { missionId: args.missionId },
          { lockMode: LockMode.PESSIMISTIC_WRITE }
        );
        if (listing && args.isCurrent() && latestInputs.get(key) === requested) {
          await tx.upsert(Terrain_Profile_Cache_db, { ...owner, fingerprint, profile });
          return true;
        }
        return false;
      });
      if (published) args.cache?.profiles.set(args.entity, { fingerprint, profile });
    }
    return profile;
  }).finally(() => {
    if (!pending.has(key)) latestInputs.delete(key);
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
  const rows = await globalValues.orm.em
    .fork()
    .find(Terrain_Profile_Cache_db, { missionId: mission.id }, { fields: ["entity"] });
  await Promise.all(
    rows.map(async ({ entity }) => {
      if (mission.traverses?.[entity] || mission.stations?.[entity]) return;
      const target = cacheKey(mission.id, entity);
      await exclusive(target, async () => {
        const latest = current();
        if (!latest?.traverses?.[entity] && !latest?.stations?.[entity])
          await globalValues.orm.em
            .fork()
            .nativeDelete(Terrain_Profile_Cache_db, { missionId: mission.id, entity });
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

/** Let in-flight sampling finish before removing the mission's raster files. */
export async function waitForTerrainCache(missionId: number): Promise<void> {
  const prefix = `${missionId}:`;
  await Promise.allSettled(
    [...pending].filter(([key]) => key.startsWith(prefix)).map(([, work]) => work)
  );
}
