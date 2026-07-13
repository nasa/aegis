import type { StoreType } from "store";
import { createTestStoreWithAutomergeMission } from "tests/vitest/fixtures/store";
import { v4 as uuidv4 } from "uuid";

let store: StoreType;

// mock all calls to the db so no transactions are actually made
// CAUTION, the import line must be below the vi.mock
vi.mock("http-client/elevation");
import * as httpClient_elevation from "http-client/elevation";
import { thunkFetchElevation } from "store/thunk/thunkElevation";
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
  it("thunkFetchElevation rejects with no DEM", async () => {
    const dummyUuid = uuidv4();
    const point: AEGISPoint = { lat: 1, lng: 1 };
    const thunkRes = await store.dispatch(
      thunkFetchElevation({ path: [point], pathSegmentDistances: [0], uuid: dummyUuid })
    );
    expect(httpClient_elevation.getElevationSinglePoint).toHaveBeenCalledTimes(0);
    expect(thunkRes.meta.requestStatus).toBe("rejected");
    expect(thunkRes.payload).toBeFalsy();
  });
  it("thunkFetchElevation for single point", async () => {
    const missionDocHandle = getMissionDocHandle();
    missionDocHandle.change((mission) => {
      mission.demFilePath = "somefake/path/here.TIF";
    });
    const dummyUuid = uuidv4();
    const point: AEGISPoint = { lat: 1, lng: 1 };
    await store.dispatch(
      thunkFetchElevation({ path: [point], pathSegmentDistances: [0], uuid: dummyUuid })
    );
    expect(httpClient_elevation.getElevationSinglePoint).toHaveBeenCalledTimes(1);
    expect(store.getState().interface.elevationPendingItemUuids.includes(dummyUuid)).toBeFalsy();
  });
  it("thunkFetchElevation for path", async () => {
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
      thunkFetchElevation({ path: path, pathSegmentDistances: [0], uuid: dummyUuid })
    );
    expect(httpClient_elevation.getElevationProfile).toHaveBeenCalledTimes(1);
    expect(store.getState().interface.elevationPendingItemUuids.includes(dummyUuid)).toBeFalsy();
  });
});
