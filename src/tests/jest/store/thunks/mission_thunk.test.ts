import { StoreType } from "store";
import { thunkMakeExportString, thunkUpdateLanderLocation } from "store/thunk/thunkMission";
import { createFullTestStore } from "tests/jest/factories/makeTestStore";

// mock all calls to the db so no transactions are actually made
// CAUTION, the import line must be below the jest.mock
jest.mock("http-client/action");
jest.mock("http-client/station");
jest.mock("http-client/traverse");
jest.mock("http-client/mission");
jest.mock("http-client/preset");
import * as httpClient_action from "http-client/action";
import * as httpClient_station from "http-client/station";
import * as httpClient_traverse from "http-client/traverse";
import { getAutomergeDocHandles, setMissionAutomergeDocHandle } from "client/automergeDocHandles";

const mockThunkGetElevation = jest.fn().mockReturnValue({
  meta: { requestStatus: "rejected" },
});
jest.mock("store/thunk/thunkElevation", () => ({
  thunkGetElevation: () => mockThunkGetElevation,
}));

let store: StoreType;

beforeAll(() => {
  store = createFullTestStore();

  /**
   * Init the mission automerge doc. In the app this is handled in the component.
   * Pass in null because this function is being mocked in jest.setup.ts so we don't
   * have to pass in a real value.
   */
  setMissionAutomergeDocHandle(null);
});

beforeEach(async () => {
  jest.clearAllMocks(); // clear call count
});

afterAll(() => {
  // restoreAllMocks() only restores mocks with .spyOn(). All others must be called manually
  // Modules mocked with jest.mock are only mocked for the file
  // https://jestjs.io/docs/jest-object#jestmockmodulename-factory-options
  jest.restoreAllMocks();
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
