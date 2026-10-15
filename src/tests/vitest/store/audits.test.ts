// mock all calls to the db so no transactions are actually made
// CAUTION, the import line must be below the vi.mock
vi.mock("http-client/terrainProfile", async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  getTerrainProfile: vi.fn(),
}));
import * as httpClient_terrainProfile from "http-client/terrainProfile";

import { auditTraverseTerrainProfiles } from "store/processing/audits";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("auditTraverseTerrainProfiles", () => {
  beforeEach(() => {
    setMissionAutomergeDocHandle(null);
    getMissionDocHandle().change((mission) => {
      mission.id = 42;
      mission.demFilePath = "dem/test.tif";
      mission.traverses = {};
    });
  });

  it("backfills aligned elevation and absolute-slope data", async () => {
    const traverse = generateBlankTraverse({
      path: [
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
      ],
      pathSegmentDistances: [25],
      pathSegmentElevations: [[1, 2]],
      pathSegmentAbsoluteSlopes: null,
    });
    getMissionDocHandle().change((mission) => {
      mission.traverses[traverse.uuid] = traverse;
    });
    vi.mocked(httpClient_terrainProfile.getTerrainProfile).mockResolvedValue({
      status: "success",
      message: "",
      data: {
        elevationsMeters: [[10, 11]],
        terrainSlopesDegrees: [[null, 2.5]],
      },
    });

    await auditTraverseTerrainProfiles({ missionDocHandle: getMissionDocHandle() });

    const updatedTraverse = getMissionDocHandle().doc().traverses[traverse.uuid];
    expect(updatedTraverse.pathSegmentElevations).toEqual([[10, 11]]);
    expect(updatedTraverse.pathSegmentAbsoluteSlopes).toEqual([[null, 2.5]]);
    expect(httpClient_terrainProfile.getTerrainProfile).toHaveBeenCalledWith({
      missionId: 42,
      path: traverse.path,
      pathSegmentDistances: traverse.pathSegmentDistances,
      entityKey: traverse.uuid,
    });
  });

  it("does not fetch or overwrite an existing absolute-slope profile", async () => {
    const traverse = generateBlankTraverse({
      path: [
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
      ],
      pathSegmentDistances: [25],
      pathSegmentElevations: [[10, 11]],
      pathSegmentAbsoluteSlopes: [[1, 2]],
    });
    getMissionDocHandle().change((mission) => {
      mission.traverses[traverse.uuid] = traverse;
    });

    await auditTraverseTerrainProfiles({ missionDocHandle: getMissionDocHandle() });

    expect(httpClient_terrainProfile.getTerrainProfile).not.toHaveBeenCalled();
    expect(getMissionDocHandle().doc().traverses[traverse.uuid]).toEqual(traverse);
  });

  it("throws when the active mission changes during sampling", async () => {
    const traverse = generateBlankTraverse({
      path: [
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
      ],
      pathSegmentDistances: [25],
      pathSegmentElevations: [[1, 2]],
      pathSegmentAbsoluteSlopes: null,
    });
    const originalHandle = getMissionDocHandle();
    originalHandle.change((mission) => {
      mission.traverses[traverse.uuid] = traverse;
    });
    vi.mocked(httpClient_terrainProfile.getTerrainProfile).mockImplementationOnce(async () => {
      setMissionAutomergeDocHandle(null);
      getMissionDocHandle().change((mission) => {
        mission.id = 43;
        mission.demFilePath = "dem/test.tif";
        mission.traverses[traverse.uuid] = traverse;
      });
      return {
        status: "success",
        message: "Terrain profile sampled",
        data: { elevationsMeters: [[10, 11]], terrainSlopesDegrees: [[2, 3]] },
      };
    });

    await expect(
      auditTraverseTerrainProfiles({ missionDocHandle: originalHandle })
    ).rejects.toThrow("Cannot apply terrain-profile audit for mission 42: active mission is 43");

    for (const handle of [originalHandle, getMissionDocHandle()]) {
      expect(handle.doc().traverses[traverse.uuid].pathSegmentElevations).toEqual([[1, 2]]);
      expect(handle.doc().traverses[traverse.uuid].pathSegmentAbsoluteSlopes).toBeNull();
    }
  });

  it("throws when a traverse is removed during sampling", async () => {
    const traverse = generateBlankTraverse({
      path: [
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
      ],
      pathSegmentDistances: [25],
      pathSegmentElevations: [[1, 2]],
      pathSegmentAbsoluteSlopes: null,
    });
    const missionDocHandle = getMissionDocHandle();
    missionDocHandle.change((mission) => {
      mission.traverses[traverse.uuid] = traverse;
    });
    vi.mocked(httpClient_terrainProfile.getTerrainProfile).mockImplementationOnce(async () => {
      missionDocHandle.change((mission) => {
        delete mission.traverses[traverse.uuid];
      });
      return {
        status: "success",
        message: "Terrain profile sampled",
        data: { elevationsMeters: [[10, 11]], terrainSlopesDegrees: [[2, 3]] },
      };
    });

    await expect(auditTraverseTerrainProfiles({ missionDocHandle })).rejects.toThrow(
      `Cannot apply terrain-profile audit: traverse ${traverse.uuid} was removed`
    );
  });

  it("throws when the mission has no ID", async () => {
    const missionDocHandle = getMissionDocHandle();
    missionDocHandle.change((mission) => {
      mission.id = null;
    });

    await expect(auditTraverseTerrainProfiles({ missionDocHandle })).rejects.toThrow(
      "Cannot audit terrain profiles for a mission without an ID"
    );
  });

  it("ignores an invalid terrain profile", async () => {
    const traverse = generateBlankTraverse({
      path: [
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
      ],
      pathSegmentDistances: [25],
      pathSegmentElevations: null,
      pathSegmentAbsoluteSlopes: null,
    });
    getMissionDocHandle().change((mission) => {
      mission.traverses[traverse.uuid] = traverse;
    });
    vi.mocked(httpClient_terrainProfile.getTerrainProfile).mockResolvedValue({
      status: "success",
      message: "",
      data: {
        elevationsMeters: [[10, 11]],
        terrainSlopesDegrees: [],
      },
    });

    await auditTraverseTerrainProfiles({ missionDocHandle: getMissionDocHandle() });

    const unchangedTraverse = getMissionDocHandle().doc().traverses[traverse.uuid];
    expect(unchangedTraverse.pathSegmentElevations).toBeNull();
    expect(unchangedTraverse.pathSegmentAbsoluteSlopes).toBeNull();
  });
});
