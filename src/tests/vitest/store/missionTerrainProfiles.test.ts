vi.mock("http-client/terrainProfile", async (original: () => Promise<object>) => ({
  ...(await original()),
  getTerrainProfile: vi.fn(),
}));
import { getTerrainProfile } from "http-client/terrainProfile";
import { syncMissionTerrainProfiles } from "client/missionTerrainProfiles";
import { createCustomTestStore } from "tests/vitest/fixtures/store";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import type { DocHandle } from "@automerge/automerge-repo";

const profile = { elevationsMeters: [[10, 20]], terrainSlopesDegrees: [[1, 2]] };
function fixture() {
  const traverse = generateBlankTraverse({
    path: [
      { lat: 1, lng: 2 },
      { lat: 2, lng: 3 },
    ],
    pathSegmentDistances: [10],
  });
  let mission = generateBlankMission({
    id: 42,
    demFilePath: "dem.tif",
    traverses: { [traverse.uuid]: traverse },
  });
  let listener: () => void;
  const handle = {
    doc: () => mission,
    on: (_event: string, callback: () => void) => {
      listener = callback;
    },
    off: vi.fn(),
  } as unknown as DocHandle<Mission>;
  return {
    traverse,
    handle,
    update: (next: Mission) => {
      mission = next;
      listener();
    },
  };
}
beforeEach(() => vi.clearAllMocks());
it("loads into Redux without changing Automerge and reuses unchanged geometry", async () => {
  vi.mocked(getTerrainProfile).mockResolvedValue({
    status: "success",
    message: "ok",
    data: profile,
  });
  const { handle, traverse, update } = fixture();
  const store = createCustomTestStore({});
  const stop = syncMissionTerrainProfiles(handle, store);
  expect(store.getState().terrainProfiles.missions[42].profiles[traverse.uuid].status).toBe(
    "loading"
  );
  await vi.waitFor(() =>
    expect(store.getState().terrainProfiles.missions[42].profiles[traverse.uuid].profile).toEqual(
      profile
    )
  );
  expect(handle.doc().traverses[traverse.uuid]).not.toHaveProperty("pathSegmentElevations");
  update(handle.doc());
  expect(getTerrainProfile).toHaveBeenCalledTimes(1);
  stop();
  expect(store.getState().terrainProfiles.missions[42]).toBeUndefined();
});
it("ignores old responses after geometry changes and clears deleted entities", async () => {
  let resolve: (value: WrappedResponse<TerrainProfile>) => void;
  vi.mocked(getTerrainProfile).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  vi.mocked(getTerrainProfile).mockResolvedValue({
    status: "success",
    message: "ok",
    data: profile,
  });
  const { handle, traverse, update } = fixture();
  const store = createCustomTestStore({});
  const stop = syncMissionTerrainProfiles(handle, store);
  update({
    ...handle.doc(),
    traverses: {
      [traverse.uuid]: {
        ...traverse,
        path: [
          { lat: 3, lng: 4 },
          { lat: 4, lng: 5 },
        ],
      },
    },
  });
  await vi.waitFor(() =>
    expect(store.getState().terrainProfiles.missions[42].profiles[traverse.uuid].profile).toEqual(
      profile
    )
  );
  resolve({
    status: "success",
    message: "old",
    data: { elevationsMeters: [[0, 0]], terrainSlopesDegrees: [[0, 0]] },
  });
  await Promise.resolve();
  expect(store.getState().terrainProfiles.missions[42].profiles[traverse.uuid].profile).toEqual(
    profile
  );
  update({ ...handle.doc(), traverses: {} });
  expect(store.getState().terrainProfiles.missions[42].profiles).toEqual({});
  stop();
});
it("records errors and ignores completion after leaving the mission", async () => {
  vi.mocked(getTerrainProfile).mockRejectedValue(new Error("offline"));
  const { handle, traverse } = fixture();
  const store = createCustomTestStore({});
  const stop = syncMissionTerrainProfiles(handle, store);
  await vi.waitFor(() =>
    expect(store.getState().terrainProfiles.missions[42].profiles[traverse.uuid].error).toBe(
      "offline"
    )
  );
  stop();
  expect(store.getState().terrainProfiles.missions).toEqual({});
});
