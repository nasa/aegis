const mocks = vi.hoisted(() => ({
  getAutomergeMissions: vi.fn(),
  getAutomergeMissionHandle: vi.fn(),
  getGrid: vi.fn(),
  readTerrainProfileInWorker: vi.fn(),
}));

vi.mock("server/express/routes/missionAutomerge", () => ({
  getAutomergeMissions: mocks.getAutomergeMissions,
  getAutomergeMissionHandle: mocks.getAutomergeMissionHandle,
}));
vi.mock("server/express/routes/grid", () => ({ getGrid: mocks.getGrid }));
vi.mock("server/terrain/readTerrainProfile", () => ({
  MAX_RASTER_PROFILE_SAMPLES: 100_000,
  readTerrainProfileInWorker: mocks.readTerrainProfileInWorker,
}));
vi.mock("server/terrain/terrainProfileCache", () => ({
  watchTerrainCache: vi.fn(),
  loadMissionTerrainProfileCache: vi.fn(async (missionId: number) => ({
    missionId,
    profiles: new Map(),
  })),
  cachedTerrainProfile: ({ compute }: { compute: () => Promise<TerrainProfile> }) => compute(),
}));

import path from "node:path";
import { getReadableEvaData } from "server/maestro/v2/routes/eva";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankTraverse } from "store/storeUtils/traverse";

it("exports geometry, elevations and calculated distance from one revision across grid loading", async () => {
  const traverse = generateBlankTraverse({
    path: [
      { lat: 1, lng: 2 },
      { lat: 3, lng: 4 },
    ],
    pathSegmentDistances: [20],
  });
  const eva = generateBlankEVA({ sequence: [{ type: "traverse", uuid: traverse.uuid }] });
  const snapshot = generateBlankMission({
    id: 42,
    demFilePath: "Data/original.tif",
    demResolution: 5,
    serverFileGrid: { numRows: 1, numCols: 1, name: "grid", fileName: "grid.json" },
    traverses: { [traverse.uuid]: traverse },
    evas: { [eva.uuid]: eva },
  });
  let current = snapshot;
  mocks.getAutomergeMissions.mockResolvedValue([snapshot]);
  mocks.getAutomergeMissionHandle.mockResolvedValue({ doc: () => current, isDeleted: () => false });
  mocks.getGrid.mockImplementation(async () => {
    await Promise.resolve();
    current = {
      ...snapshot,
      demFilePath: "Data/replacement.tif",
      demResolution: 10,
      traverses: {
        [traverse.uuid]: {
          ...traverse,
          path: [
            { lat: 5, lng: 6 },
            { lat: 7, lng: 8 },
          ],
          pathSegmentDistances: [100],
        },
      },
    };
    return null;
  });
  mocks.readTerrainProfileInWorker.mockImplementation(async (_raster, points) => ({
    elevationsMeters: [points.map((point: AEGISPoint) => point.lat * 10)],
    terrainSlopesDegrees: [[1, 2]],
  }));

  const result = await getReadableEvaData({ missionId: 42 });

  const exported = result[0].sequenceReadable[0] as ExportTraverse;
  expect(current).not.toBe(snapshot);
  expect(exported.path).toEqual(traverse.path);
  expect(exported.pathSegmentElevations).toEqual([[10, 30]]);
  expect(exported.calculatedFields.distanceMeters).toBe(20);
  expect(mocks.readTerrainProfileInWorker).toHaveBeenCalledWith(
    {
      absolutePath: path.resolve(
        process.env.STATIC_DIR ?? "",
        "missionFiles",
        "42",
        "Data/original.tif"
      ),
      expectedResolutionMeters: 5,
    },
    traverse.path,
    [5],
    `42:${traverse.uuid}`,
    false
  );
});
