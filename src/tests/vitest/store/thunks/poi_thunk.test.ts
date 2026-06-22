import { createCustomTestStore } from "tests/vitest/fixtures/store";
import { initialState as poiInitialState } from "store/poi";
import type { StoreType } from "store";
import {
  thunkDocCreatePoi,
  thunkDocDuplicatePoi,
  thunkDocDeletePoi,
  thunkDocUpdatePoiLocation,
} from "store/thunk/thunkPoi";
import { generateBlankPoi } from "store/storeUtils/poi";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankStation } from "store/storeUtils/station";
import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";

const mockThunkFetchElevation = vi.fn().mockReturnValue({
  meta: { requestStatus: "rejected" },
});
vi.mock("store/thunk/thunkElevation", () => ({
  thunkFetchElevation: () => mockThunkFetchElevation,
}));

let store: StoreType;

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  getMissionDocHandle().change((m) => {
    m.pois = {};
    m.actions = {};
    m.stations = {};
  });
});

describe("Thunk POI Tests", () => {
  describe("thunkDocCreatePoi", () => {
    it("adds a new poi to automerge and selects it", async () => {
      const missionDocHandle = getMissionDocHandle();
      const poisBefore = Object.keys(missionDocHandle.doc().pois).length;

      store = createCustomTestStore({
        poi: { ...poiInitialState },
      });

      await store.dispatch(thunkDocCreatePoi());
      const poisAfter = Object.keys(missionDocHandle.doc().pois);
      expect(poisAfter.length).toEqual(poisBefore + 1);
      // should select the new poi
      const newPoiUuid = store.getState().poi.selectedPoiUuid;
      expect(newPoiUuid).toBeTruthy();
      expect(missionDocHandle.doc().pois[newPoiUuid]).toBeTruthy();
    });
  });

  describe("thunkDocDuplicatePoi", () => {
    it("creates a copy of the poi with actions and selects it", async () => {
      const poi = generateBlankPoi({ name: "Vitest Poi-1" });
      const poiAction = generateBlankAction({ name: "Vitest Poi Action", poiUuid: poi.uuid });
      poi.actionOrderUuids = [poiAction.uuid];

      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((mission) => {
        mission.pois[poi.uuid] = poi;
      });

      store = createCustomTestStore({
        poi: { ...poiInitialState },
      });

      await store.dispatch(thunkDocDuplicatePoi({ poiUuid: poi.uuid }));
      const allPois = Object.values(missionDocHandle.doc().pois);
      const duplicatedPoi = allPois.find((p) => p.name === "Vitest Poi-1 (copy 1)");
      expect(duplicatedPoi).toBeTruthy();
      expect(duplicatedPoi.uuid).not.toEqual(poi.uuid);
      // should select the new poi
      expect(store.getState().poi.selectedPoiUuid).toEqual(duplicatedPoi.uuid);
    });

    it("is a no-op when poi doesn't exist", async () => {
      store = createCustomTestStore({ poi: { ...poiInitialState } });
      const before = Object.keys(getMissionDocHandle().doc().pois).length;
      await store.dispatch(thunkDocDuplicatePoi({ poiUuid: "missing" }));
      const after = Object.keys(getMissionDocHandle().doc().pois).length;
      expect(after).toBe(before);
    });
  });

  describe("thunkDocDeletePoi", () => {
    it("removes the poi from automerge and deselects it", async () => {
      const poi = generateBlankPoi({ name: "Vitest Poi-1" });

      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((mission) => {
        mission.pois[poi.uuid] = poi;
      });

      store = createCustomTestStore({
        poi: { ...poiInitialState, selectedPoiUuid: poi.uuid },
      });

      await store.dispatch(thunkDocDeletePoi({ poiUuid: poi.uuid }));
      // POI should be deleted from automerge
      expect(missionDocHandle.doc().pois[poi.uuid]).toBeUndefined();
      // should deselect
      expect(store.getState().poi.selectedPoiUuid).toBeNull();
    });

    it("removes the poi reference from any stations that include it", async () => {
      const poi = generateBlankPoi({ name: "Vitest POI" });
      const station = generateBlankStation({ name: "Vitest Has POI", poiUuids: [poi.uuid] });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.pois[poi.uuid] = poi;
        m.stations[station.uuid] = station;
      });
      store = createCustomTestStore({ poi: { ...poiInitialState } });

      await store.dispatch(thunkDocDeletePoi({ poiUuid: poi.uuid }));
      expect(missionDocHandle.doc().pois[poi.uuid]).toBeUndefined();
      expect(missionDocHandle.doc().stations[station.uuid].poiUuids).not.toContain(poi.uuid);
    });

    it("deletes any actions attached to the poi", async () => {
      const poi = generateBlankPoi({ name: "Vitest POI" });
      const action = generateBlankAction({ name: "Vitest POI Action", poiUuid: poi.uuid });
      poi.actionOrderUuids = [action.uuid];
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.pois[poi.uuid] = poi;
        m.actions[action.uuid] = action;
      });
      store = createCustomTestStore({ poi: { ...poiInitialState } });

      await store.dispatch(thunkDocDeletePoi({ poiUuid: poi.uuid }));
      expect(missionDocHandle.doc().pois[poi.uuid]).toBeUndefined();
      expect(missionDocHandle.doc().actions[action.uuid]).toBeUndefined();
    });
  });

  describe("thunkDocUpdatePoiLocation", () => {
    it("updates the location and skips elevation when elevation lookup is rejected", async () => {
      const poi = generateBlankPoi({ name: "Vitest Poi-1", location: { lat: 1, lng: 2 } });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((mission) => {
        mission.pois[poi.uuid] = poi;
      });

      store = createCustomTestStore({});

      const newLocation: AEGISPoint = { lat: 10, lng: 20 };
      await store.dispatch(thunkDocUpdatePoiLocation({ location: newLocation, poiUuid: poi.uuid }));

      // elevation was rejected, so only location should update
      const updatedPoi = missionDocHandle.doc().pois[poi.uuid];
      expect(updatedPoi.location.lat).toEqual(10);
      expect(updatedPoi.location.lng).toEqual(20);
    });

    it("writes elevation when elevation lookup succeeds", async () => {
      mockThunkFetchElevation.mockReturnValueOnce({
        meta: { requestStatus: "fulfilled" },
        payload: 7777,
      });
      const poi = generateBlankPoi({ name: "Vitest POI", location: { lat: 0, lng: 0 } });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.pois[poi.uuid] = poi;
      });
      store = createCustomTestStore({});

      await store.dispatch(
        thunkDocUpdatePoiLocation({ location: { lat: 5, lng: 5 }, poiUuid: poi.uuid })
      );
      expect(missionDocHandle.doc().pois[poi.uuid].elevation).toBe(7777);
    });
  });
});
