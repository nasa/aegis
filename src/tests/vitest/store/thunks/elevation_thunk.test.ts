import type { StoreType } from "store";
import { createTestStoreWithAutomergeMission } from "tests/vitest/fixtures/store";
import { v4 as uuidv4 } from "uuid";

let store: StoreType;

// mock all calls to the db so no transactions are actually made
// CAUTION, the import line must be below the vi.mock
vi.mock("http-client/terrainProfile");
import * as httpClientTerrainProfile from "http-client/terrainProfile";
import {
  thunkFetchPointElevation,
  thunkFetchTerrainProfile,
} from "store/thunk/thunkTerrainProfile";
import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";

beforeAll(() => {
  store = createTestStoreWithAutomergeMission();

  /**
   * Init the mission automerge doc. In the app this is handled in the component.
   * Pass in null because this function is being mocked so we don't
   * have to pass in a real value.
   */
  setMissionAutomergeDocHandle(null);
});

beforeEach(async () => {
  vi.clearAllMocks(); // clear call count
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("Thunk Elevation Tests", () => {
  it("thunkFetchPointElevation rejects with no DEM", async () => {
    const dummyUuid = uuidv4();
    const point: AEGISPoint = { lat: 1, lng: 1 };
    const thunkRes = await store.dispatch(thunkFetchPointElevation({ point, uuid: dummyUuid }));
    expect(httpClientTerrainProfile.getElevationSinglePoint).toHaveBeenCalledTimes(0);
    expect(thunkRes.meta.requestStatus).toBe("rejected");
    expect(thunkRes.payload).toBeFalsy();
  });
  it("thunkFetchPointElevation fetches a single point", async () => {
    const missionDocHandle = getMissionDocHandle();
    missionDocHandle.change((mission) => {
      mission.demFilePath = "somefake/path/here.TIF";
    });
    const dummyUuid = uuidv4();
    const point: AEGISPoint = { lat: 1, lng: 1 };
    await store.dispatch(thunkFetchPointElevation({ point, uuid: dummyUuid }));
    expect(httpClientTerrainProfile.getElevationSinglePoint).toHaveBeenCalledTimes(1);
    expect(store.getState().interface.elevationPendingItemUuids.includes(dummyUuid)).toBeFalsy();
  });
  it("thunkFetchTerrainProfile fetches a path", async () => {
    const missionDocHandle = getMissionDocHandle();
    missionDocHandle.change((mission) => {
      mission.demFilePath = "somefake/path/here.TIF";
    });
    const dummyUuid = uuidv4();
    const path: AEGISPoint[] = [
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 },
    ];
    await store.dispatch(
      thunkFetchTerrainProfile({ path, pathSegmentDistances: [0], uuid: dummyUuid })
    );
    expect(httpClientTerrainProfile.getTerrainProfile).toHaveBeenCalledTimes(1);
    expect(store.getState().interface.elevationPendingItemUuids.includes(dummyUuid)).toBeFalsy();
  });
  it("thunkFetchTerrainProfile fulfills with null when the server supersedes the request", async () => {
    const missionDocHandle = getMissionDocHandle();
    missionDocHandle.change((mission) => {
      mission.demFilePath = "somefake/path/here.TIF";
    });
    vi.mocked(httpClientTerrainProfile.getTerrainProfile).mockResolvedValueOnce({
      status: "error",
      message: "Raster sampling job was superseded by newer queued work",
      httpStatus: 409,
    });
    const path: AEGISPoint[] = [
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 },
    ];
    const thunkRes = await store.dispatch(
      thunkFetchTerrainProfile({ path, pathSegmentDistances: [0], uuid: uuidv4() })
    );
    // A supersede is a cancellation, not an error, so it must not reject and
    // trip the rejected-action logger.
    expect(thunkRes.meta.requestStatus).toBe("fulfilled");
    expect(thunkRes.payload).toBeNull();
  });
});
