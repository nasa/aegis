vi.mock("http-client/terrainProfile", async (original: () => Promise<object>) => ({
  ...(await original()),
  getTerrainProfile: vi.fn(),
  getTerrainProfiles: vi.fn(),
}));
import { getTerrainProfile, getTerrainProfiles } from "http-client/terrainProfile";
import {
  populateTerrainProfiles,
  syncMissionTerrainProfiles,
} from "store/thunk/thunkTerrainProfile";
import { initialState } from "store";
import { setAllSliceStores } from "store/crossActions";
import { thunkObliterateMissionSpecificData } from "store/thunk/crossThunk";
import { getMissionDocHandle } from "client/automergeDocHandles";
import { obliterateState, setTerrainPreview, terrainFingerprint } from "store/terrainProfiles";
import { createCustomTestStore } from "tests/vitest/fixtures/store";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import type { DocHandle } from "@automerge/automerge-repo";

const profile = { elevationsMeters: [[10, 20]], terrainSlopesDegrees: [[1, 2]] };
const populatedState = (terrainProfiles: TerrainProfilesState): WholeStoreState => ({
  ...initialState,
  mission: { ...initialState.mission, automergeUrl: "automerge:test" },
  terrainProfiles,
});
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
    landerLocation: { lat: 2, lng: 3 },
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
    off: vi.fn(() => {
      listener = undefined;
    }),
  } as unknown as DocHandle<Mission>;
  return {
    traverse,
    handle,
    update: (next: Mission) => {
      mission = next;
      listener?.();
    },
  };
}
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());
it("populates all 40 mission profiles in one call and passes load-test options", async () => {
  const { handle } = fixture(40);
  vi.mocked(getTerrainProfiles).mockImplementation(async (_missionId, requests) =>
    requests.map(() => ({ status: "success", message: "ok", data: profile }))
  );
  const loadTestOptions = { serverURL: "http://localhost:4001", cookies: "session=test" };
  const terrain = await populateTerrainProfiles(handle.doc(), loadTestOptions);
  expect(Object.keys(terrain.profiles)).toHaveLength(40);
  expect(Object.values(terrain.profiles).every((entry) => entry.status === "ready")).toBe(true);
  expect(getTerrainProfiles).toHaveBeenCalledTimes(1);
  expect(vi.mocked(getTerrainProfiles).mock.calls[0][1]).toHaveLength(40);
  expect(vi.mocked(getTerrainProfiles).mock.calls[0][2]).toBe(loadTestOptions);
  expect(getTerrainProfile).not.toHaveBeenCalled();
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
  const stop = syncMissionTerrainProfiles(store, undefined, handle);
  await vi.waitFor(() =>
    expect(store.getState().terrainProfiles.profiles.second.status).toBe("error")
  );
  expect(store.getState().terrainProfiles.profiles[traverse.uuid].status).toBe("ready");
  await vi.advanceTimersByTimeAsync(2_001);
  expect(getTerrainProfiles).toHaveBeenCalledTimes(2);
  expect(vi.mocked(getTerrainProfiles).mock.calls[1][1].map(({ entityKey }) => entityKey)).toEqual([
    "second",
    "third",
  ]);
  expect(
    Object.values(store.getState().terrainProfiles.profiles).every(
      (entry) => entry.status === "ready"
    )
  ).toBe(true);
  stop();
  store.dispatch(obliterateState());
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
  const stop = syncMissionTerrainProfiles(store, undefined, handle);
  expect(store.getState().terrainProfiles.profiles[traverse.uuid].status).toBe("idle");
  await vi.waitFor(() =>
    expect(store.getState().terrainProfiles.profiles[traverse.uuid].profile).toEqual(profile)
  );
  expect(handle.doc().traverses[traverse.uuid]).not.toHaveProperty("pathSegmentElevations");
  update(handle.doc());
  expect(getTerrainProfiles).toHaveBeenCalledTimes(1);
  stop();
  store.dispatch(obliterateState());
  expect(store.getState().terrainProfiles).toEqual({ profiles: {}, previews: {} });
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
  const stop = syncMissionTerrainProfiles(store, undefined, handle);
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
    expect(store.getState().terrainProfiles.profiles[traverse.uuid].profile).toEqual(profile)
  );
  resolve([
    {
      status: "success",
      message: "old",
      data: { elevationsMeters: [[0, 0]], terrainSlopesDegrees: [[0, 0]] },
    },
  ]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(store.getState().terrainProfiles.profiles[traverse.uuid].profile).toEqual(profile);
  update({ ...handle.doc(), traverses: {} });
  expect(store.getState().terrainProfiles.profiles).toEqual({});
  stop();
  store.dispatch(obliterateState());
});
it("records errors and ignores completion after leaving the mission", async () => {
  vi.mocked(getTerrainProfiles).mockRejectedValue(new Error("offline"));
  const { handle, traverse } = fixture();
  const store = createCustomTestStore({});
  const stop = syncMissionTerrainProfiles(store, undefined, handle);
  await vi.waitFor(() =>
    expect(store.getState().terrainProfiles.profiles[traverse.uuid].error).toBe("offline")
  );
  stop();
  store.dispatch(obliterateState());
  expect(store.getState().terrainProfiles).toEqual({ profiles: {}, previews: {} });
});

it("adopts a ready preview on commit and caches the released geometry", () => {
  vi.mocked(getTerrainProfiles).mockReturnValue(new Promise(() => {}));
  vi.mocked(getTerrainProfile).mockReturnValue(new Promise(() => {}));
  const { handle, traverse, update } = fixture();
  const store = createCustomTestStore({});
  const stop = syncMissionTerrainProfiles(store, undefined, handle);
  vi.mocked(getTerrainProfile).mockClear();
  const path = [
    { lat: 5, lng: 6 },
    { lat: 7, lng: 8 },
  ];
  store.dispatch(
    setTerrainPreview({
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
  const terrain = store.getState().terrainProfiles;
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
  store.dispatch(obliterateState());
});

it("drops a preview when different geometry is committed", () => {
  vi.mocked(getTerrainProfiles).mockReturnValue(new Promise(() => {}));
  const { handle, traverse, update } = fixture();
  const store = createCustomTestStore({});
  const stop = syncMissionTerrainProfiles(store, undefined, handle);
  const path = [
    { lat: 5, lng: 6 },
    { lat: 7, lng: 8 },
  ];
  store.dispatch(
    setTerrainPreview({
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
  expect(store.getState().terrainProfiles.previews[traverse.uuid]).toBeDefined();
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
  expect(store.getState().terrainProfiles.previews[traverse.uuid]).toBeUndefined();
  stop();
  store.dispatch(obliterateState());
});

it("retries transient failures with backoff but not on unrelated edits", async () => {
  vi.useFakeTimers();
  vi.mocked(getTerrainProfiles)
    .mockResolvedValueOnce([{ status: "error", message: "busy", httpStatus: 503 }])
    .mockResolvedValue([{ status: "success", message: "ok", data: profile }]);
  const { handle, traverse, update } = fixture();
  const store = createCustomTestStore({});
  const stop = syncMissionTerrainProfiles(store, undefined, handle);
  await vi.waitFor(() =>
    expect(store.getState().terrainProfiles.profiles[traverse.uuid].status).toBe("error")
  );
  update({ ...handle.doc(), name: "renamed" });
  expect(getTerrainProfiles).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(2_001);
  expect(getTerrainProfiles).toHaveBeenCalledTimes(2);
  expect(store.getState().terrainProfiles.profiles[traverse.uuid].profile).toEqual(profile);
  stop();
  store.dispatch(obliterateState());
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
  const stop = syncMissionTerrainProfiles(store, undefined, handle);
  await vi.waitFor(() =>
    expect(store.getState().terrainProfiles.profiles[traverse.uuid].error).toBe("outside DEM")
  );
  await vi.advanceTimersByTimeAsync(120_000);
  expect(getTerrainProfiles).toHaveBeenCalledTimes(1);
  stop();
  store.dispatch(obliterateState());
});

it("populates initial profiles and stops updates, retries, and late responses on obliterate", async () => {
  vi.useFakeTimers();
  const { handle, traverse, update } = fixture();
  vi.mocked(getTerrainProfiles).mockResolvedValue([
    { status: "success", message: "ok", data: profile },
  ]);
  const terrainProfiles = await populateTerrainProfiles(handle.doc());
  expect(terrainProfiles.profiles[traverse.uuid].profile).toEqual(profile);
  const store = createCustomTestStore({});
  vi.mocked(getMissionDocHandle).mockReturnValueOnce(handle);
  store.dispatch(setAllSliceStores(populatedState(terrainProfiles)));
  syncMissionTerrainProfiles(store);
  expect(store.getState().terrainProfiles).toEqual(terrainProfiles);
  expect(getTerrainProfiles).toHaveBeenCalledTimes(1);
  vi.mocked(getTerrainProfiles).mockResolvedValueOnce([
    { status: "error", message: "busy", httpStatus: 503 },
  ]);
  update({ ...handle.doc(), demFilePath: "second.tif" });
  await vi.waitFor(() =>
    expect(store.getState().terrainProfiles.profiles[traverse.uuid].error).toBe("busy")
  );
  let resolve: (responses: TerrainProfileResponse[]) => void;
  vi.mocked(getTerrainProfiles).mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    })
  );
  update({ ...handle.doc(), demFilePath: "third.tif" });
  expect(getTerrainProfiles).toHaveBeenCalledTimes(3);
  await store.dispatch(thunkObliterateMissionSpecificData());
  expect(handle.off).toHaveBeenCalledWith("change", expect.any(Function));
  expect(store.getState().terrainProfiles).toEqual({ profiles: {}, previews: {} });
  resolve([{ status: "success", message: "ok", data: profile }]);
  update({ ...handle.doc(), demFilePath: "fourth.tif" });
  await vi.advanceTimersByTimeAsync(120_000);
  expect(getTerrainProfiles).toHaveBeenCalledTimes(3);
  expect(store.getState().terrainProfiles).toEqual({ profiles: {}, previews: {} });
});

it("retries transient population failures and preserves permanent failures", async () => {
  vi.useFakeTimers();
  const { handle, traverse } = fixture(2);
  vi.mocked(getTerrainProfiles)
    .mockResolvedValueOnce([
      { status: "error", message: "busy", httpStatus: 503 },
      { status: "error", message: "outside DEM", httpStatus: 400 },
    ])
    .mockResolvedValue([{ status: "success", message: "ok", data: profile }]);
  const terrainProfiles = await populateTerrainProfiles(handle.doc());
  const store = createCustomTestStore({});
  vi.mocked(getMissionDocHandle).mockReturnValueOnce(handle);
  store.dispatch(setAllSliceStores(populatedState(terrainProfiles)));
  syncMissionTerrainProfiles(store);
  await vi.advanceTimersByTimeAsync(2_001);
  expect(getTerrainProfiles).toHaveBeenCalledTimes(2);
  expect(vi.mocked(getTerrainProfiles).mock.calls[1][1].map(({ entityKey }) => entityKey)).toEqual([
    traverse.uuid,
  ]);
  expect(store.getState().terrainProfiles.profiles[traverse.uuid].profile).toEqual(profile);
  expect(store.getState().terrainProfiles.profiles["traverse-1"].error).toBe("outside DEM");
  await store.dispatch(thunkObliterateMissionSpecificData());
});

it("populates no profiles without a DEM", async () => {
  const { handle } = fixture();
  expect(await populateTerrainProfiles({ ...handle.doc(), demFilePath: "" })).toEqual({
    profiles: {},
    previews: {},
  });
  expect(getTerrainProfiles).not.toHaveBeenCalled();
});

it("replaces leaked profiles and previews and stops old work on the next mission load", async () => {
  vi.useFakeTimers();
  const first = fixture();
  const second = fixture();
  second.update({ ...second.handle.doc(), id: 43 });
  vi.mocked(getTerrainProfiles).mockResolvedValue([
    { status: "error", message: "busy", httpStatus: 503 },
  ]);
  const terrainProfiles = await populateTerrainProfiles(first.handle.doc());
  const store = createCustomTestStore({});
  vi.mocked(getMissionDocHandle).mockReturnValueOnce(first.handle);
  store.dispatch(setAllSliceStores(populatedState(terrainProfiles)));
  syncMissionTerrainProfiles(store);
  store.dispatch(
    setTerrainPreview({
      uuid: first.traverse.uuid,
      entry: { ...terrainProfiles.profiles[first.traverse.uuid], status: "ready", profile },
    })
  );

  vi.mocked(getTerrainProfiles).mockResolvedValue([
    { status: "success", message: "ok", data: profile },
  ]);
  const nextProfiles = await populateTerrainProfiles(second.handle.doc());
  vi.mocked(getMissionDocHandle).mockReturnValueOnce(second.handle);
  store.dispatch(setAllSliceStores(populatedState(nextProfiles)));
  syncMissionTerrainProfiles(store);
  expect(first.handle.off).toHaveBeenCalledWith("change", expect.any(Function));
  expect(store.getState().terrainProfiles).toEqual(nextProfiles);
  expect(store.getState().terrainProfiles.profiles[first.traverse.uuid]).toBeUndefined();
  first.update({ ...first.handle.doc(), demFilePath: "changed.tif" });
  await vi.advanceTimersByTimeAsync(120_000);
  expect(getTerrainProfiles).toHaveBeenCalledTimes(2);
  expect(store.getState().terrainProfiles).toEqual(nextProfiles);
  await store.dispatch(thunkObliterateMissionSpecificData());
});
