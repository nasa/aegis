import type { DocHandle } from "@automerge/automerge-repo/slim";
import { LockMode } from "@mikro-orm/postgresql";
import { Doc_Listing_db, Terrain_Profile_Cache_db } from "server/database/models/_allModels";
import { globalValues } from "server/express/global";
import { RasterSamplingWorkerPoolSupersededError } from "server/raster/rasterSamplingWorkerPool";
import { serverLogger } from "utils/logging/serverLogger";

// Only pending work is held in memory. Completed profiles live in the database.
const pendingEntityWork = new Map<number, Map<string, Promise<unknown>>>();
const latestInputSignatures = new Map<number, Map<string, string>>();
async function withEntityWorkLock<T>(
  missionId: number,
  entityUuid: string,
  work: () => Promise<T>
): Promise<T> {
  const missionWork = pendingEntityWork.get(missionId) ?? new Map<string, Promise<unknown>>();
  pendingEntityWork.set(missionId, missionWork);
  const previous = missionWork.get(entityUuid) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(work);
  missionWork.set(entityUuid, next);
  try {
    return await next;
  } finally {
    if (missionWork.get(entityUuid) === next) missionWork.delete(entityUuid);
    if (!missionWork.size) pendingEntityWork.delete(missionId);
  }
}

export async function loadMissionTerrainProfileCache(
  missionId: number
): Promise<MissionTerrainProfileCache> {
  const rows = await globalValues.orm.em.fork().find(Terrain_Profile_Cache_db, { missionId });
  return { missionId, profiles: new Map(rows.map((row) => [row.entityUuid, row])) };
}

export async function cachedTerrainProfile(args: {
  missionId: number;
  entityUuid: string;
  inputSignature: string;
  isCurrent: () => boolean;
  compute: () => Promise<TerrainProfile>;
  onCacheStatus?: (status: "hit" | "miss") => void;
  cache?: MissionTerrainProfileCache;
}): Promise<TerrainProfile> {
  const { missionId, entityUuid, inputSignature } = args;
  if (args.cache && args.cache.missionId !== missionId)
    throw new Error("Invalid terrain profile cache mission ID");
  const owner = { missionId, entityUuid };
  const latestInputs = latestInputSignatures.get(missionId) ?? new Map<string, string>();
  latestInputSignatures.set(missionId, latestInputs);
  // A queued request must see the preceding writer's result rather than its older snapshot.
  const refresh = pendingEntityWork.get(missionId)?.has(entityUuid);
  latestInputs.set(entityUuid, inputSignature);
  return withEntityWorkLock(missionId, entityUuid, async () => {
    if (latestInputs.get(entityUuid) !== inputSignature)
      throw new RasterSamplingWorkerPoolSupersededError();
    const em = globalValues.orm.em.fork();
    const stored =
      args.cache && !refresh
        ? args.cache.profiles.get(entityUuid)
        : await em.findOne(Terrain_Profile_Cache_db, owner);
    if (stored?.inputSignature === inputSignature && isValidProfile(stored.profile)) {
      args.cache?.profiles.set(entityUuid, stored);
      args.onCacheStatus?.("hit");
      return stored.profile;
    }
    args.onCacheStatus?.("miss");
    const result = await args.compute();
    const profile = {
      elevationsMeters: result.elevationsMeters,
      terrainSlopesDegrees: result.terrainSlopesDegrees,
    };
    if (args.isCurrent() && latestInputs.get(entityUuid) === inputSignature) {
      const published = await em.transactional(async (tx) => {
        // Lock only while publishing, so mission deletion can proceed during sampling.
        // A deleted listing must never be recreated by a late cache write.
        const listing = await tx.findOne(
          Doc_Listing_db,
          { missionId },
          { lockMode: LockMode.PESSIMISTIC_WRITE }
        );
        if (listing && args.isCurrent() && latestInputs.get(entityUuid) === inputSignature) {
          await tx.upsert(Terrain_Profile_Cache_db, { ...owner, inputSignature, profile });
          return true;
        }
        return false;
      });
      if (published) args.cache?.profiles.set(entityUuid, { inputSignature, profile });
    }
    return profile;
  }).finally(() => {
    if (!pendingEntityWork.get(missionId)?.has(entityUuid)) latestInputs.delete(entityUuid);
    if (!latestInputs.size) latestInputSignatures.delete(missionId);
  });
}

function isValidProfile(profile: TerrainProfile): boolean {
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

export async function deleteTerrainProfileFromDb(
  mission: Mission,
  current: () => Mission = () => mission
): Promise<void> {
  const rows = await globalValues.orm.em
    .fork()
    .find(Terrain_Profile_Cache_db, { missionId: mission.id }, { fields: ["entityUuid"] });
  await Promise.all(
    rows.map(async ({ entityUuid }) => {
      if (mission.traverses?.[entityUuid] || mission.stations?.[entityUuid]) return;
      await withEntityWorkLock(mission.id, entityUuid, async () => {
        const latest = current();
        if (!latest?.traverses?.[entityUuid] && !latest?.stations?.[entityUuid])
          await globalValues.orm.em
            .fork()
            .nativeDelete(Terrain_Profile_Cache_db, { missionId: mission.id, entityUuid });
      });
    })
  );
}

const watched = new WeakSet<DocHandle<Mission>>();
export function watchTerrainCache(handle: DocHandle<Mission>): void {
  if (watched.has(handle)) return;
  watched.add(handle);
  let previous: Set<string> | undefined;
  const checkForDeletedEntities = () => {
    const mission = handle.doc();
    if (!mission?.id) return;
    const current = new Set([
      ...Object.keys(mission.traverses ?? {}),
      ...Object.keys(mission.stations ?? {}),
    ]);
    const removed = !previous || [...previous].some((key) => !current.has(key));
    previous = current;
    if (removed)
      deleteTerrainProfileFromDb(mission, () => handle.doc()).catch((error) =>
        serverLogger.error(
          {
            logId: "terrain-cache",
            logValue: "Could not delete terrain profiles",
            missionId: mission.id,
          },
          error
        )
      );
  };
  handle.on("change", checkForDeletedEntities);
  handle.on("delete", () => handle.off("change", checkForDeletedEntities));
  handle
    .whenReady()
    .then(checkForDeletedEntities)
    .catch(() => {});
}

/** Let in-flight sampling finish before removing the mission's raster files. */
export async function waitForTerrainCache(missionId: number): Promise<void> {
  await Promise.allSettled(pendingEntityWork.get(missionId)?.values() ?? []);
}
