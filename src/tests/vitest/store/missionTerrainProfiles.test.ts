vi.mock("http-client/terrainProfile", async (original: () => Promise<object>) => ({
  ...(await original()),
  getTerrainProfile: vi.fn(),
  getTerrainProfiles: vi.fn(),
}));
import { getTerrainProfile, getTerrainProfiles } from "http-client/terrainProfile";
import { syncMissionTerrainProfiles } from "client/missionTerrainProfiles";
import { setTerrainPreview, terrainFingerprint } from "store/terrainProfiles";
import { createCustomTestStore } from "tests/vitest/fixtures/store";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import type { DocHandle } from "@automerge/automerge-repo";

const profile = { elevationsMeters: [[10, 20]], terrainSlopesDegrees: [[1, 2]] };
function fixture(count = 1) {
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
    traverses: Object.fromEntries(
      Array.from({ length: count }, (_, index) => {
        const entity = index === 0 ? traverse : { ...traverse, uuid: `traverse-${index}` };
        return [entity.uuid, entity];
      })
    ),
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
afterEach(() => vi.useRealTimers());
it("fetches all 40 mission profiles in one call", async () => {
  const { handle } = fixture(40);
  vi.mocked(getTerrainProfiles).mockImplementation(async (_missionId, requests) =>
    requests.map(() => ({
      status: "success",
      message: "ok",
      data: profile,
    }))
  );
  const store = createCustomTestStore({});
  const stop = syncMissionTerrainProfiles(handle, store);
  await vi.waitFor(() =>
    expect(
      Object.values(store.getState().terrainProfiles.missions[42].profiles).every(
        (entry) => entry.status === "ready"
      )
    ).toBe(true)
  );
  expect(getTerrainProfiles).toHaveBeenCalledTimes(1);
  expect(vi.mocked(getTerrainProfiles).mock.calls[0][1]).toHaveLength(40);
  expect(getTerrainProfile).not.toHaveBeenCalled();
  stop();
});

it("keeps successes and retries only failed profiles together in one batch", async () => {
  vi.useFakeTimers();
  const { handle, traverse } = fixture();
  handle.doc().traverses.second = { ...traverse, uuid: "second" };
  handle.doc().traverses.third = { ...traverse, uuid: "third" };
  vi.mocked(getTerrainProfiles)
    .mockResolvedValueOnce([
      { status: "success", message: "ok", data: profile },
      { status: "error", message: "busy", httpStatus: 503 },
      { status: "error", message: "busy", httpStatus: 503 },
    ])
    .mockResolvedValue([
      { status: "success", message: "ok", data: profile },
      { status: "success", message: "ok", data: profile },
    ]);
  const store = createCustomTestStore({});
  const stop = syncMissionTerrainProfiles(handle, store);
  await vi.waitFor(() =>
    expect(store.getState().terrainProfiles.missions[42].profiles.second.status).toBe("error")
  );
  expect(store.getState().terrainProfiles.missions[42].profiles[traverse.uuid].status).toBe(
    "ready"
  );
  await vi.advanceTimersByTimeAsync(2_001);
  expect(getTerrainProfiles).toHaveBeenCalledTimes(2);
  expect(vi.mocked(getTerrainProfiles).mock.calls[1][1].map(({ entityKey }) => entityKey)).toEqual([
    "second",
    "third",
  ]);
  expect(
    Object.values(store.getState().terrainProfiles.missions[42].profiles).every(
      (entry) => entry.status === "ready"
    )
  ).toBe(true);
  stop();
});

it("loads into Redux without changing Automerge and reuses unchanged geometry", async () => {
  vi.mocked(getTerrainProfiles).mockResolvedValue([
    {
      status: "success",
      message: "ok",
      data: profile,
    },
  ]);
  const { handle, traverse, update } = fixture();
  const store = createCustomTestStore({});
  const stop = syncMissionTerrainProfiles(handle, store);
  expect(store.getState().terrainProfiles.missions[42].profiles[traverse.uuid].status).toBe("idle");
  await vi.waitFor(() =>
    expect(store.getState().terrainProfiles.missions[42].profiles[traverse.uuid].profile).toEqual(
      profile
    )
  );
  expect(handle.doc().traverses[traverse.uuid]).not.toHaveProperty("pathSegmentElevations");
  update(handle.doc());
  expect(getTerrainProfiles).toHaveBeenCalledTimes(1);
  stop();
  expect(store.getState().terrainProfiles.missions[42]).toBeUndefined();
});
it("ignores old responses after geometry changes and clears deleted entities", async () => {
  let resolve: (value: TerrainProfileResponse[]) => void;
  vi.mocked(getTerrainProfiles).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  vi.mocked(getTerrainProfiles).mockResolvedValue([
    {
      status: "success",
      message: "ok",
      data: profile,
    },
  ]);
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
  resolve([
    {
      status: "success",
      message: "old",
      data: { elevationsMeters: [[0, 0]], terrainSlopesDegrees: [[0, 0]] },
    },
  ]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(store.getState().terrainProfiles.missions[42].profiles[traverse.uuid].profile).toEqual(
    profile
  );
  update({ ...handle.doc(), traverses: {} });
  expect(store.getState().terrainProfiles.missions[42].profiles).toEqual({});
  stop();
});
it("records errors and ignores completion after leaving the mission", async () => {
  vi.mocked(getTerrainProfiles).mockRejectedValue(new Error("offline"));
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

it("adopts a ready preview on commit and caches the released geometry", () => {
  vi.mocked(getTerrainProfiles).mockReturnValue(new Promise(() => {}));
  vi.mocked(getTerrainProfile).mockReturnValue(new Promise(() => {}));
  const { handle, traverse, update } = fixture();
  const store = createCustomTestStore({});
  const stop = syncMissionTerrainProfiles(handle, store);
  vi.mocked(getTerrainProfile).mockClear();
  const path = [
    { lat: 5, lng: 6 },
    { lat: 7, lng: 8 },
  ];
  store.dispatch(
    setTerrainPreview({
      missionId: 42,
      uuid: traverse.uuid,
      entry: {
        fingerprint: terrainFingerprint(handle.doc(), path, [10]),
        path,
        distances: [10],
        status: "ready",
        profile,
        error: null,
      },
    })
  );
  update({
    ...handle.doc(),
    traverses: { [traverse.uuid]: { ...traverse, path, pathSegmentDistances: [10] } },
  });
  const terrain = store.getState().terrainProfiles.missions[42];
  expect(terrain.previews[traverse.uuid]).toBeUndefined();
  expect(terrain.profiles[traverse.uuid].status).toBe("ready");
  expect(terrain.profiles[traverse.uuid].profile).toEqual(profile);
  // One cache-through request stores the released geometry; it does not block the display.
  expect(getTerrainProfile).toHaveBeenCalledTimes(1);
  expect(getTerrainProfile).toHaveBeenCalledWith({
    missionId: 42,
    entityKey: traverse.uuid,
    path,
    pathSegmentDistances: [10],
  });
  stop();
});

it("drops a preview when different geometry is committed", () => {
  vi.mocked(getTerrainProfiles).mockReturnValue(new Promise(() => {}));
  const { handle, traverse, update } = fixture();
  const store = createCustomTestStore({});
  const stop = syncMissionTerrainProfiles(handle, store);
  const path = [
    { lat: 5, lng: 6 },
    { lat: 7, lng: 8 },
  ];
  store.dispatch(
    setTerrainPreview({
      missionId: 42,
      uuid: traverse.uuid,
      entry: {
        fingerprint: terrainFingerprint(handle.doc(), path, [10]),
        path,
        distances: [10],
        status: "ready",
        profile,
        error: null,
      },
    })
  );
  update({ ...handle.doc(), name: "renamed" });
  expect(store.getState().terrainProfiles.missions[42].previews[traverse.uuid]).toBeDefined();
  update({
    ...handle.doc(),
    traverses: {
      [traverse.uuid]: {
        ...traverse,
        path: [
          { lat: 9, lng: 9 },
          { lat: 8, lng: 8 },
        ],
      },
    },
  });
  expect(store.getState().terrainProfiles.missions[42].previews[traverse.uuid]).toBeUndefined();
  stop();
});

it("retries transient failures with backoff but not on unrelated edits", async () => {
  vi.useFakeTimers();
  vi.mocked(getTerrainProfiles)
    .mockResolvedValueOnce([{ status: "error", message: "busy", httpStatus: 503 }])
    .mockResolvedValue([{ status: "success", message: "ok", data: profile }]);
  const { handle, traverse, update } = fixture();
  const store = createCustomTestStore({});
  const stop = syncMissionTerrainProfiles(handle, store);
  await vi.waitFor(() =>
    expect(store.getState().terrainProfiles.missions[42].profiles[traverse.uuid].status).toBe(
      "error"
    )
  );
  update({ ...handle.doc(), name: "renamed" });
  expect(getTerrainProfiles).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(2_001);
  expect(getTerrainProfiles).toHaveBeenCalledTimes(2);
  expect(store.getState().terrainProfiles.missions[42].profiles[traverse.uuid].profile).toEqual(
    profile
  );
  stop();
});

it("does not retry permanent failures", async () => {
  vi.useFakeTimers();
  vi.mocked(getTerrainProfiles).mockResolvedValue([
    {
      status: "error",
      message: "outside DEM",
      httpStatus: 400,
    },
  ]);
  const { handle, traverse } = fixture();
  const store = createCustomTestStore({});
  const stop = syncMissionTerrainProfiles(handle, store);
  await vi.waitFor(() =>
    expect(store.getState().terrainProfiles.missions[42].profiles[traverse.uuid].error).toBe(
      "outside DEM"
    )
  );
  await vi.advanceTimersByTimeAsync(120_000);
  expect(getTerrainProfiles).toHaveBeenCalledTimes(1);
  stop();
});

it("shares one coordinator between concurrent mounts", async () => {
  vi.mocked(getTerrainProfiles).mockResolvedValue([
    {
      status: "success",
      message: "ok",
      data: profile,
    },
  ]);
  const { handle, traverse } = fixture();
  const store = createCustomTestStore({});
  const stopFirst = syncMissionTerrainProfiles(handle, store);
  const stopSecond = syncMissionTerrainProfiles(handle, store);
  await vi.waitFor(() =>
    expect(store.getState().terrainProfiles.missions[42].profiles[traverse.uuid].status).toBe(
      "ready"
    )
  );
  expect(getTerrainProfiles).toHaveBeenCalledTimes(1);
  stopFirst();
  expect(store.getState().terrainProfiles.missions[42]).toBeDefined();
  stopSecond();
  expect(store.getState().terrainProfiles.missions[42]).toBeUndefined();
});
