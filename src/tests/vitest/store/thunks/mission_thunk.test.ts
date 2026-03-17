import type { StoreType } from "store";
import { thunkMakeExportString, thunkUpdateLanderLocation } from "store/thunk/thunkMission";
import { createFullTestStore } from "tests/vitest/fixtures/redux/makeTestStore";

// mock all calls to the db so no transactions are actually made
// CAUTION, the import line must be below the vi.mock
vi.mock("http-client/action");
vi.mock("http-client/station");
vi.mock("http-client/traverse");
vi.mock("http-client/mission");
vi.mock("http-client/preset");
import * as httpClient_action from "http-client/action";
import * as httpClient_station from "http-client/station";
import * as httpClient_traverse from "http-client/traverse";
import { getAutomergeDocHandles, setMissionAutomergeDocHandle } from "client/automergeDocHandles";

const mockThunkGetElevation = vi.fn().mockReturnValue({
  meta: { requestStatus: "rejected" },
});
vi.mock("store/thunk/thunkElevation", () => ({
  thunkGetElevation: () => mockThunkGetElevation,
}));

let store: StoreType;

beforeAll(() => {
  store = createFullTestStore();

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
  // restoreAllMocks() only restores mocks with .spyOn(). All others must be called manually
  // Modules mocked with vi.mock are only mocked for the file
  vi.restoreAllMocks();
});

describe("Thunk Mission Tests", () => {
  it("thunkUpdateLanderLocation", async () => {
    const newLanderLoc: AEGISPoint = { lat: 1.1, lng: 1.1 };
    const missionDocHandle = getAutomergeDocHandles().mission;

    await store.dispatch(thunkUpdateLanderLocation({ location: newLanderLoc }));
    expect(missionDocHandle.doc().landerLocation).toEqual(newLanderLoc);
    expect(mockThunkGetElevation).toHaveBeenCalled();

    // check walkback on stations
    const station = store.getState().station.stations[0];
    const numStations = store.getState().station.stations.length;
    expect(station.walkbackPath[station.walkbackPath.length - 1]).toEqual(newLanderLoc);
    expect(httpClient_station.upsertStations).toHaveBeenCalledTimes(numStations);

    //check evas
    const evaFromLander = store.getState().eva.evas.find((e) => e.egressLocationUuid === "lander");
    const traverseFromLander = store
      .getState()
      .traverse.traverses.find((t) => t.uuid === evaFromLander.sequence[0].uuid);
    expect(traverseFromLander.path[0]).toEqual(newLanderLoc);
    expect(httpClient_traverse.upsertTraverses).toHaveBeenCalled();
    expect(httpClient_action.upsertActions).not.toHaveBeenCalled(); // no actions should be updated
  });

  it("thunkMakeExportString", async () => {
    const exportRes = await store.dispatch(
      thunkMakeExportString({
        selectEvas: true,
        selectMission: true,
        selectPois: true,
        selectStations: true,
        selectActions: true,
        selectTraverses: true,
        selectRexes: true,
      })
    );
    expect(exportRes.payload).toBeTruthy();
  });
});
