import { EventEmitter } from "node:events";
import { Repo, type DocHandle } from "@automerge/automerge-repo/slim";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankStation } from "store/storeUtils/station";
import {
  calculateMissionLanderElevation,
  watchLanderElevation,
} from "server/terrain/landerElevation";
import { TERRAIN_PROFILE_NO_DATA_ELEVATION_METERS } from "utils/elevation";

const mocks = vi.hoisted(() => ({ sample: vi.fn(), resolvePath: vi.fn(), warning: vi.fn() }));
vi.mock("server/raster/missionDems", () => ({ resolveMissionDemPath: mocks.resolvePath }));
vi.mock("server/terrain/readTerrainProfile", () => ({
  readTerrainProfileInWorker: mocks.sample,
  TERRAIN_PROFILE_NO_DATA_ELEVATION_METERS: -1100101,
}));
vi.mock("utils/logging/serverLogger", () => ({ serverLogger: { warning: mocks.warning } }));

const configured = () =>
  generateBlankMission({
    id: 42,
    demFilePath: "Data/dem.tif",
    demResolution: 1,
    landerLocation: { lat: -85, lng: 5 },
  });
const result = (elevation: number) => ({ elevationsMeters: [[elevation, elevation]] });
function fakeHandle(mission: Mission) {
  const events = new EventEmitter();
  let ready = true;
  const handle = {
    doc: () => structuredClone(mission),
    isReady: () => ready,
    whenReady: async () => {},
    on: events.on.bind(events),
    off: events.off.bind(events),
    change: (update: (draft: Mission) => void) => {
      update(mission);
      events.emit("change");
    },
  } as unknown as DocHandle<Mission>;
  return {
    handle,
    remove: () => {
      ready = false;
      events.emit("delete");
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolvePath.mockResolvedValue("/mission/Data/dem.tif");
  mocks.sample.mockResolvedValue(result(123));
});

test("a new mission has unknown elevation and requires a DEM and valid location", async () => {
  const mission = generateBlankMission({ id: 42 });
  expect(mission.landerElevationMeters).toBeNull();
  expect(await calculateMissionLanderElevation(mission)).toBeNull();
  expect(
    await calculateMissionLanderElevation({
      ...configured(),
      landerLocation: { lat: null, lng: 0 },
    })
  ).toBeNull();
  expect(mocks.sample).not.toHaveBeenCalled();
});

test.each([0, -35, 123])("preserves the valid DEM elevation %s", async (elevation) => {
  mocks.sample.mockResolvedValue(result(elevation));
  expect(await calculateMissionLanderElevation(configured())).toBe(elevation);
});

test.each([NaN, TERRAIN_PROFILE_NO_DATA_ELEVATION_METERS])(
  "keeps unknown elevation when the DEM has no valid sample",
  async (elevation) => {
    mocks.sample.mockResolvedValue(result(elevation));
    expect(await calculateMissionLanderElevation(configured())).toBeNull();
  }
);

test("adding and removing a DEM updates elevation and lander xgress stations automatically", async () => {
  const mission = generateBlankMission({ id: 42, landerLocation: { lat: -85, lng: 5 } });
  const station = generateBlankStation({ isLanderXgress: true, elevation: 999 });
  mission.stations[station.uuid] = station;
  const { handle } = fakeHandle(mission);
  watchLanderElevation(handle);
  await vi.waitFor(() => expect(station.elevation).toBeNull());
  expect(mocks.sample).not.toHaveBeenCalled();
  handle.change((draft) => {
    draft.demFilePath = "Data/dem.tif";
    draft.demResolution = 1;
  });
  await vi.waitFor(() => expect(mission.landerElevationMeters).toBe(123));
  expect(station.elevation).toBe(123);
  handle.change((draft) => {
    draft.demFilePath = "";
  });
  expect(mission.landerElevationMeters).toBeNull();
  expect(station.elevation).toBeNull();
});

test("never publishes an elevation sampled for an older lander location", async () => {
  const mission = configured();
  let finishOld: (value: ReturnType<typeof result>) => void;
  mocks.sample.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOld = resolve;
      })
  );
  const { handle } = fakeHandle(mission);
  watchLanderElevation(handle);
  await vi.waitFor(() => expect(mocks.sample).toHaveBeenCalledTimes(1));
  handle.change((draft) => {
    draft.landerLocation = { lat: -86, lng: 6 };
  });
  await vi.waitFor(() => expect(mission.landerElevationMeters).toBe(123));
  finishOld(result(999));
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  expect(mission.landerElevationMeters).toBe(123);
});

test("sampling failure leaves elevation null and does not loop on unrelated edits", async () => {
  const mission = configured();
  mission.landerElevationMeters = 999;
  mocks.sample.mockRejectedValue(new Error("DEM is unavailable"));
  const { handle } = fakeHandle(mission);
  watchLanderElevation(handle);
  await vi.waitFor(() => expect(mocks.warning).toHaveBeenCalledOnce());
  expect(mission.landerElevationMeters).toBeNull();
  handle.change((draft) => {
    draft.name = "Updated name";
  });
  expect(mocks.sample).toHaveBeenCalledOnce();
});

test("a deleted mission cannot receive a late sample", async () => {
  const mission = configured();
  let finish: (value: ReturnType<typeof result>) => void;
  mocks.sample.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const { handle, remove } = fakeHandle(mission);
  watchLanderElevation(handle);
  await vi.waitFor(() => expect(mocks.sample).toHaveBeenCalledOnce());
  remove();
  finish(result(999));
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  expect(mission.landerElevationMeters).toBeNull();
});

test("updates a real Automerge handle after a DEM is added and after the lander moves", async () => {
  const repo = new Repo();
  try {
    const handle = repo.create<Mission>(
      generateBlankMission({ id: 42, landerLocation: { lat: -85, lng: 5 } })
    );
    watchLanderElevation(handle);
    handle.change((mission) => {
      mission.demFilePath = "Data/dem.tif";
      mission.demResolution = 1;
    });
    await vi.waitFor(() => expect(handle.doc().landerElevationMeters).toBe(123));
    mocks.sample.mockResolvedValue(result(0));
    handle.change((mission) => {
      mission.landerLocation = { lat: -86, lng: 6 };
    });
    expect(handle.doc().landerElevationMeters).toBeNull();
    await vi.waitFor(() => expect(handle.doc().landerElevationMeters).toBe(0));
  } finally {
    await repo.shutdown();
  }
});
