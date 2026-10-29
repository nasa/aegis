// @vitest-environment node
import { MikroORM } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";
import config from "server/database/mikro-orm.config";
import { Migration20261029000000 } from "server/database/migrations/Migration20261029000000-terrain-profile-cache";
import { globalValues } from "server/express/global";
import { Doc_Listing_db, Doc_Listing_dbSchema } from "server/database/models/doc_listing.model";
import {
  Terrain_Profile_Cache_db,
  Terrain_Profile_Cache_dbSchema,
} from "server/database/models/terrain_profile_cache.model";
import { applyDeleteRexStage } from "operations/apply/apply-rex";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankRex } from "store/storeUtils/rex";
import { watchTerrainCache } from "server/terrain/terrainProfileCache";
import type { DocHandle } from "@automerge/automerge-repo/slim";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cachedTerrainProfile, pruneTerrainProfiles } from "server/terrain/terrainProfileCache";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankTraverse } from "store/storeUtils/traverse";

let root: string;
let missionId: number;
const schema = "vitest_terrain_cache_" + randomUUID().replaceAll("-", "");
beforeAll(async () => {
  globalValues.orm = await MikroORM.init({
    ...config,
    schema,
    entities: [Doc_Listing_dbSchema, Terrain_Profile_Cache_dbSchema],
    entitiesTs: [Doc_Listing_dbSchema, Terrain_Profile_Cache_dbSchema],
  });
  await globalValues.orm.schema.create();
  // Exercise the shipped migration rather than relying on schema generation for the cache.
  await globalValues.orm.em.fork().transactional(async (tx) => {
    await tx.execute(`set local search_path to "${schema}"`);
    const migration = new Migration20261029000000(tx.getDriver(), globalValues.orm.config);
    migration.down();
    migration.up();
    for (const query of migration.getQueries()) await tx.execute(query as string);
  });
});
afterAll(async () => {
  if (!globalValues.orm) return;
  await globalValues.orm.schema.drop({ dropMigrationsTable: true, dropDb: false });
  await globalValues.orm.em.getConnection().execute('drop schema if exists "' + schema + '"');
  await globalValues.orm.close();
});
const rows = () => globalValues.orm.em.fork().find(Terrain_Profile_Cache_db, { missionId });
const profile = { elevationsMeters: [[1, 2]], terrainSlopesDegrees: [[3, null]] };
beforeEach(async () => {
  const em = globalValues.orm.em.fork();
  const listing = em.create(Doc_Listing_db, { automergeUrl: "Vitest Terrain Cache" });
  await em.flush();
  missionId = listing.missionId;
  root = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-terrain-cache-"));
  await fs.writeFile(path.join(root, "dem.tif"), "raster fixture");
});
afterEach(async () => {
  await globalValues.orm.em.fork().nativeDelete(Doc_Listing_db, { missionId });
  if (
    path.dirname(root) !== path.resolve(os.tmpdir()) ||
    !path.basename(root).startsWith("aegis-terrain-cache-")
  )
    throw new Error("Unexpected test directory");
  await fs.rm(root, { recursive: true, force: true });
});
const args = () => ({
  missionId,
  entity: "traverse-1",
  rasterPath: path.join(root, "dem.tif"),
  inputs: [1],
  isCurrent: () => true,
  compute: vi.fn(async () => profile),
});

it("reuses database results, invalidates geometry and DEM changes, and keeps one row", async () => {
  const onCacheStatus = vi.fn();
  const request = { ...args(), onCacheStatus };
  await cachedTerrainProfile(request);
  await cachedTerrainProfile(request);
  expect(request.compute).toHaveBeenCalledTimes(1);
  await cachedTerrainProfile({ ...request, inputs: [2] });
  expect(request.compute).toHaveBeenCalledTimes(2);
  await fs.appendFile(request.rasterPath, "changed");
  await cachedTerrainProfile({ ...request, inputs: [2] });
  expect(request.compute).toHaveBeenCalledTimes(3);
  expect(await rows()).toMatchObject([{ missionId, entity: "traverse-1", profile }]);
  expect(onCacheStatus.mock.calls.map(([status]) => status)).toEqual([
    "miss",
    "hit",
    "miss",
    "miss",
  ]);
});
it("repairs invalid profiles and shares simultaneous requests", async () => {
  const request = args();
  await cachedTerrainProfile(request);
  await globalValues.orm.em
    .fork()
    .nativeUpdate(
      Terrain_Profile_Cache_db,
      { missionId },
      { profile: { elevationsMeters: [], terrainSlopesDegrees: [] } }
    );
  await Promise.all([cachedTerrainProfile(request), cachedTerrainProfile(request)]);
  expect(request.compute).toHaveBeenCalledTimes(2);
  await globalValues.orm.em
    .fork()
    .nativeUpdate(
      Terrain_Profile_Cache_db,
      { missionId },
      { profile: { elevationsMeters: [[1, 2]], terrainSlopesDegrees: [[3]] } }
    );
  await cachedTerrainProfile(request);
  expect(request.compute).toHaveBeenCalledTimes(3);
});
it("removes deleted entity rows while retaining live entities", async () => {
  await cachedTerrainProfile(args());
  await cachedTerrainProfile({ ...args(), entity: "traverse-2" });
  const traverse = generateBlankTraverse({ uuid: "traverse-2" });
  await pruneTerrainProfiles(
    generateBlankMission({ id: missionId, traverses: { [traverse.uuid]: traverse } })
  );
  expect(await rows()).toMatchObject([{ entity: "traverse-2" }]);
});
it("does not recreate a profile when its owner is deleted during sampling", async () => {
  let current = true;
  let finish: (value: TerrainProfile) => void;
  const compute = vi.fn(
    () =>
      new Promise<TerrainProfile>((resolve) => {
        finish = resolve;
      })
  );
  const result = cachedTerrainProfile({ ...args(), compute, isCurrent: () => current });
  await vi.waitFor(() => expect(compute).toHaveBeenCalled());
  current = false;
  finish(profile);
  await result;
  expect(await rows()).toEqual([]);
});

it("cleans a deleted REX's profiles through the server document observer", async () => {
  const traverse = generateBlankTraverse({ uuid: "traverse-1" });
  const eva = generateBlankEVA({ sequence: [{ type: "traverse", uuid: traverse.uuid }] });
  const rex = generateBlankRex({ evaUuid: eva.uuid });
  const mission = generateBlankMission({
    id: missionId,
    traverses: { [traverse.uuid]: traverse },
    evas: { [eva.uuid]: eva },
    rexes: { [rex.uuid]: rex },
  });
  const callbacks = new Map<string, () => void>();
  const handle = {
    doc: () => mission,
    whenReady: async () => {},
    on: (event: string, callback: () => void) => callbacks.set(event, callback),
    off: vi.fn(),
  } as unknown as DocHandle<Mission>;
  await cachedTerrainProfile(args());
  watchTerrainCache(handle);
  await Promise.resolve();
  applyDeleteRexStage(mission, {
    rexUuid: rex.uuid,
    evaUuid: eva.uuid,
    traverseUuids: [traverse.uuid],
    stationUuids: [],
    actionUuids: [],
  });
  callbacks.get("change")();
  await vi.waitFor(async () => expect(await rows()).toEqual([]));
});

it("isolates the same entity in different missions and cascades mission deletion", async () => {
  const em = globalValues.orm.em.fork();
  const other = em.create(Doc_Listing_db, { automergeUrl: "Vitest Other Terrain Cache" });
  await em.flush();
  try {
    const request = args();
    await cachedTerrainProfile(request);
    await cachedTerrainProfile({ ...request, missionId: other.missionId });
    expect(request.compute).toHaveBeenCalledTimes(2);
    await em.nativeDelete(Doc_Listing_db, { missionId });
    expect(await rows()).toEqual([]);
    expect(await em.count(Terrain_Profile_Cache_db, { missionId: other.missionId })).toBe(1);
  } finally {
    await em.nativeDelete(Doc_Listing_db, { missionId: other.missionId });
  }
});

it("does not publish a late result after its mission listing is deleted", async () => {
  let finish: (value: TerrainProfile) => void;
  const compute = vi.fn(
    () =>
      new Promise<TerrainProfile>((resolve) => {
        finish = resolve;
      })
  );
  const result = cachedTerrainProfile({ ...args(), compute });
  await vi.waitFor(() => expect(compute).toHaveBeenCalled());
  await globalValues.orm.em.fork().nativeDelete(Doc_Listing_db, { missionId });
  finish(profile);
  await expect(result).resolves.toEqual(profile);
  expect(await rows()).toEqual([]);
});
