import { createCustomTestStore } from "tests/vitest/fixtures/store";
import { initialState as actionInitialState } from "store/action";
import { v4 as uuidv4 } from "uuid";
import { thunkDocUpdateActionLocation } from "store/thunk/thunkAction";
import { generateBlankAction } from "store/storeUtils/action";
import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";

// default mock: elevation rejected (no data). Individual tests can override.
const mockThunkFetchElevation = vi.fn().mockReturnValue({
  meta: { requestStatus: "rejected" },
});
vi.mock("store/thunk/thunkElevation", () => ({
  thunkFetchElevation: () => mockThunkFetchElevation,
}));

beforeAll(() => {
  /**
   * Init the mission automerge doc. In the app this is handled in the component.
   * Pass in null because this function is being mocked so we don't
   * have to pass in a real value.
   */
  setMissionAutomergeDocHandle(null);
});

beforeEach(async () => {
  vi.clearAllMocks(); // clear call count
  // Reset automerge actions to empty
  const missionDocHandle = getMissionDocHandle();
  missionDocHandle.change((mission) => {
    mission.actions = {};
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("Thunk Action Tests", () => {
  describe("thunkDocUpdateActionLocation", () => {
    test("rejected elevation sets location and null elevation", async () => {
      mockThunkFetchElevation.mockReturnValueOnce({ meta: { requestStatus: "rejected" } });
      const action: Action = generateBlankAction({
        name: "Vitest Action-1",
        stationUuid: uuidv4(),
      });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((mission) => {
        mission.actions[action.uuid] = action;
      });

      const store = createCustomTestStore({
        action: actionInitialState,
      });

      expect(missionDocHandle.doc()?.actions?.[action.uuid]?.location).toBeNull();
      const newLocation: AEGISPoint = { lat: 1, lng: 2 };
      await store.dispatch(
        thunkDocUpdateActionLocation({
          location: newLocation,
          actionUuid: action.uuid,
        })
      );
      expect(missionDocHandle.doc()?.actions?.[action.uuid]?.location).toEqual(newLocation);
      expect(missionDocHandle.doc()?.actions?.[action.uuid]?.elevation).toBeNull();
      expect(mockThunkFetchElevation).toHaveBeenCalled();
    });

    test("fulfilled elevation sets both location and elevation", async () => {
      mockThunkFetchElevation.mockReturnValueOnce({
        meta: { requestStatus: "fulfilled" },
        payload: 1234,
      });
      const action: Action = generateBlankAction({
        name: "Vitest Action-2",
        stationUuid: uuidv4(),
      });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((mission) => {
        mission.actions[action.uuid] = action;
      });

      const store = createCustomTestStore({ action: actionInitialState });

      const newLocation: AEGISPoint = { lat: 5, lng: 6 };
      await store.dispatch(
        thunkDocUpdateActionLocation({
          location: newLocation,
          actionUuid: action.uuid,
        })
      );
      expect(missionDocHandle.doc()?.actions?.[action.uuid]?.location).toEqual(newLocation);
      expect(missionDocHandle.doc()?.actions?.[action.uuid]?.elevation).toBe(1234);
    });
  });
});
