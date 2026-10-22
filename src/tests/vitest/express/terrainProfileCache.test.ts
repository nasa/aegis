import { applyDeleteRexStage } from "operations/apply/apply-rex";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankRex } from "store/storeUtils/rex";
import { watchTerrainCache } from "server/terrain/terrainProfileCache";
import type { DocHandle } from "@automerge/automerge-repo/slim";
// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  cachedTerrainProfile,
  pruneTerrainProfiles,
  terrainCacheDirectory,
} from "server/terrain/terrainProfileCache";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankTraverse } from "store/storeUtils/traverse";

let root: string;
let oldStaticDir: string | undefined;
const profile = { elevationsMeters: [[1, 2]], terrainSlopesDegrees: [[3, null]] };
beforeEach(async () => {
  oldStaticDir = process.env.STATIC_DIR;
  root = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-terrain-cache-"));
  process.env.STATIC_DIR = root;
  await fs.writeFile(path.join(root, "dem.tif"), "raster fixture");
});
afterEach(async () => {
  if (oldStaticDir === undefined) delete process.env.STATIC_DIR;
  else process.env.STATIC_DIR = oldStaticDir;
  if (
    path.dirname(root) !== path.resolve(os.tmpdir()) ||
    !path.basename(root).startsWith("aegis-terrain-cache-")
  )
    throw new Error("Unexpected test directory");
  await fs.rm(root, { recursive: true, force: true });
});
const args = () => ({
  missionId: 42,
  entity: "traverse-1",
  rasterPath: path.join(root, "dem.tif"),
  inputs: [1],
  isCurrent: () => true,
  compute: vi.fn(async () => profile),
});

it("reuses disk results, invalidates geometry and DEM changes, and keeps one file", async () => {
  const request = args();
  await cachedTerrainProfile(request);
  await cachedTerrainProfile(request);
  expect(request.compute).toHaveBeenCalledTimes(1);
  await cachedTerrainProfile({ ...request, inputs: [2] });
  expect(request.compute).toHaveBeenCalledTimes(2);
  await fs.appendFile(request.rasterPath, "changed");
  await cachedTerrainProfile({ ...request, inputs: [2] });
  expect(request.compute).toHaveBeenCalledTimes(3);
  expect(await fs.readdir(terrainCacheDirectory(42))).toEqual(["traverse-1.json"]);
});
it("repairs corrupt files and shares simultaneous requests", async () => {
  const request = args();
  await cachedTerrainProfile(request);
  await fs.writeFile(path.join(terrainCacheDirectory(42), "traverse-1.json"), "broken");
  await Promise.all([cachedTerrainProfile(request), cachedTerrainProfile(request)]);
  expect(request.compute).toHaveBeenCalledTimes(2);
  await fs.writeFile(path.join(terrainCacheDirectory(42), "traverse-1.json"), "null");
  await cachedTerrainProfile(request);
  expect(request.compute).toHaveBeenCalledTimes(3);
});
it("removes deleted entity files while retaining live entities", async () => {
  await cachedTerrainProfile(args());
  await cachedTerrainProfile({ ...args(), entity: "traverse-2" });
  const traverse = generateBlankTraverse({ uuid: "traverse-2" });
  await pruneTerrainProfiles(
    generateBlankMission({ id: 42, traverses: { [traverse.uuid]: traverse } })
  );
  expect(await fs.readdir(terrainCacheDirectory(42))).toEqual(["traverse-2.json"]);
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
  await expect(fs.readdir(terrainCacheDirectory(42))).rejects.toMatchObject({ code: "ENOENT" });
});

it("cleans a deleted REX's profiles through the server document observer", async () => {
  const traverse = generateBlankTraverse({ uuid: "traverse-1" });
  const eva = generateBlankEVA({ sequence: [{ type: "traverse", uuid: traverse.uuid }] });
  const rex = generateBlankRex({ evaUuid: eva.uuid });
  const mission = generateBlankMission({
    id: 42,
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
  await vi.waitFor(async () => expect(await fs.readdir(terrainCacheDirectory(42))).toEqual([]));
});
