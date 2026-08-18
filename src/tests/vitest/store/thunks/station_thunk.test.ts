import { createCustomTestStore } from "tests/vitest/fixtures/store";
import { initialState as stationInitialState } from "store/station";
import * as thunkStation from "store/thunk/thunkStation";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { setMissionAutomergeDocHandle, getMissionDocHandle } from "client/automergeDocHandles";

const mockThunkCancelMarkerMapDirective = vi.fn();
vi.mock("store/thunk/thunkMap", async () => {
  const actual = await vi.importActual("store/thunk/thunkMap");
  return {
    ...(actual as object),
    thunkCancelMarkerMapDirective: () => mockThunkCancelMarkerMapDirective,
  };
});

const mockThunkFetchElevation = vi.fn().mockReturnValue({
  meta: { requestStatus: "rejected" },
});
vi.mock("store/thunk/thunkElevation", () => ({
  thunkFetchElevation: () => mockThunkFetchElevation,
}));

const mockThunkDocUpdateTraversesAroundStation = vi.fn();
const mockThunkDocUpdateTraverse = vi.fn();
vi.mock("store/thunk/thunkTraverse", () => ({
  thunkDocUpdateTraversesAroundStation: () => mockThunkDocUpdateTraversesAroundStation,
  thunkDocUpdateTraverse: () => mockThunkDocUpdateTraverse,
}));

const getMission = (): Mission => getMissionDocHandle().doc();

beforeAll(() => {
  // mocked by vitest setup; creates a blank mission doc on first call
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  // wipe the mission doc back to a known-empty state between tests
  getMissionDocHandle().change((m) => {
    m.stations = {};
    m.traverses = {};
    m.evas = {};
    m.actions = {};
    m.pois = {};
    m.rexes = {};
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("Thunk Station Tests", () => {
  describe("thunkDocUpdateStationLocation", () => {
    test("updates location on the automerge doc", async () => {
      const newStation: Station = generateBlankStation({ name: "Vitest Station-1" });
      getMissionDocHandle().change((m) => {
        m.stations[newStation.uuid] = newStation;
      });

      const store = createCustomTestStore({});

      expect(getMission().stations[newStation.uuid].location).toBeNull();
      const newLocation: AEGISPoint = { lat: 1, lng: 2 };
      await store.dispatch(
        thunkStation.thunkDocUpdateStationLocation({
          location: newLocation,
          stationUuid: newStation.uuid,
        })
      );
      expect(getMission().stations[newStation.uuid].location).toEqual(newLocation);
      expect(mockThunkFetchElevation).toHaveBeenCalled();
    });

    test("also writes elevation when elevation is fulfilled", async () => {
      const elevationValue = 42;
      mockThunkFetchElevation.mockReturnValueOnce({
        meta: { requestStatus: "fulfilled" },
        payload: elevationValue,
      });

      const station: Station = generateBlankStation({
        name: "Vitest Station-Elev",
        location: { lat: 5, lng: 6 },
      });
      getMissionDocHandle().change((m) => {
        m.stations[station.uuid] = station;
      });
      const store = createCustomTestStore({});
      const newLocation: AEGISPoint = { lat: 7, lng: 8 };

      await store.dispatch(
        thunkStation.thunkDocUpdateStationLocation({
          location: newLocation,
          stationUuid: station.uuid,
        })
      );

      expect(getMission().stations[station.uuid].location).toEqual(newLocation);
      expect(getMission().stations[station.uuid].elevation).toEqual(elevationValue);
    });
  });

  describe("thunkDocUpdateWalkback", () => {
    test("snaps endpoints and writes to automerge", async () => {
      const newStation: Station = generateBlankStation({
        name: "Vitest Station-1",
        location: { lat: 1.3, lng: 2.3 },
      });
      getMissionDocHandle().change((m) => {
        m.stations[newStation.uuid] = newStation;
      });

      const store = createCustomTestStore({});
      expect(getMission().stations[newStation.uuid].walkbackPath).toBeNull();

      //path with 3 points -> endpoints snap to station/lander
      const newPath: AEGISPoint[] = [
        { lat: 1, lng: 2 },
        { lat: 1, lng: 2.3 },
        { lat: 1, lng: 2.6 },
      ];
      let expectedPath: AEGISPoint[] = [
        { lat: 1.3, lng: 2.3 },
        { lat: 1, lng: 2.3 },
        { lat: 3, lng: 3 }, // lander location from generateBlankMission
      ];
      let response = await store.dispatch(
        thunkStation.thunkDocUpdateWalkback({ path: newPath, stationUuid: newStation.uuid })
      );
      const stationAfter1 = getMission().stations[newStation.uuid];
      expect(stationAfter1.walkbackPath).toEqual(expectedPath);
      expect(stationAfter1.walkbackPathSegmentDistances.length).toEqual(2);
      expect(stationAfter1.walkbackPathSegmentElevations).toBeNull();
      expect(response.payload).toEqual(expectedPath);
      expect(mockThunkFetchElevation).toHaveBeenCalled();

      //empty path -> just station + lander
      expectedPath = [
        { lat: 1.3, lng: 2.3 },
        { lat: 3, lng: 3 },
      ];
      response = await store.dispatch(
        thunkStation.thunkDocUpdateWalkback({ path: [], stationUuid: newStation.uuid })
      );
      const stationAfter2 = getMission().stations[newStation.uuid];
      expect(stationAfter2.walkbackPath).toEqual(expectedPath);
      expect(stationAfter2.walkbackPathSegmentDistances.length).toEqual(1);
      expect(stationAfter2.walkbackPathSegmentElevations).toBeNull();
      expect(response.payload).toEqual(expectedPath);
      expect(mockThunkFetchElevation).toHaveBeenCalled();
    });

    test("stores elevation profile when elevation is fulfilled", async () => {
      const fakeElevationProfile = [[0, 100, 200]];
      mockThunkFetchElevation.mockReturnValueOnce({
        meta: { requestStatus: "fulfilled" },
        payload: fakeElevationProfile,
      });

      const station: Station = generateBlankStation({
        name: "Vitest Station-WalkbackElev",
        location: { lat: 1, lng: 2 },
      });
      getMissionDocHandle().change((m) => {
        m.stations[station.uuid] = station;
      });
      const store = createCustomTestStore({});

      await store.dispatch(
        thunkStation.thunkDocUpdateWalkback({
          path: [
            { lat: 1, lng: 2 },
            { lat: 2, lng: 3 },
          ],
          stationUuid: station.uuid,
        })
      );

      expect(getMission().stations[station.uuid].walkbackPathSegmentElevations).toEqual(
        fakeElevationProfile
      );
    });
  });

  describe("thunkDocResetWalkback", () => {
    test("resets path to just station + lander", async () => {
      const newStation: Station = generateBlankStation({
        name: "Vitest Station-1",
        location: { lat: 1.3, lng: 2.3 },
        walkbackPath: [
          { lat: 1, lng: 2 },
          { lat: 1, lng: 2.3 },
          { lat: 1, lng: 2.6 },
        ],
      });
      getMissionDocHandle().change((m) => {
        m.stations[newStation.uuid] = newStation;
      });
      const store = createCustomTestStore({});
      expect(getMission().stations[newStation.uuid].walkbackPath.length).toEqual(3);

      const expectedPath: AEGISPoint[] = [
        { lat: 1.3, lng: 2.3 },
        { lat: 3, lng: 3 },
      ];
      await store.dispatch(thunkStation.thunkDocResetWalkback({ stationUuid: newStation.uuid }));
      const stationAfter = getMission().stations[newStation.uuid];
      expect(stationAfter.walkbackPath).toEqual(expectedPath);
      expect(stationAfter.walkbackPathSegmentDistances.length).toEqual(1);
      expect(stationAfter.walkbackPathSegmentElevations).toBeNull();
      expect(mockThunkFetchElevation).toHaveBeenCalled();
    });

    test("stores elevation profile when elevation is fulfilled", async () => {
      const fakeElevationProfile = [[0, 50, 100]];
      mockThunkFetchElevation.mockReturnValueOnce({
        meta: { requestStatus: "fulfilled" },
        payload: fakeElevationProfile,
      });

      const station: Station = generateBlankStation({
        name: "Vitest Station-ResetElev",
        location: { lat: 2, lng: 3 },
        walkbackPath: [
          { lat: 2, lng: 3 },
          { lat: 3, lng: 3 },
        ],
      });
      getMissionDocHandle().change((m) => {
        m.stations[station.uuid] = station;
      });
      const store = createCustomTestStore({});

      await store.dispatch(thunkStation.thunkDocResetWalkback({ stationUuid: station.uuid }));

      expect(getMission().stations[station.uuid].walkbackPathSegmentElevations).toEqual(
        fakeElevationProfile
      );
    });
  });

  describe("thunkDocDeleteStations", () => {
    test("deletes a station and its actions, validates EVA sequence usage", async () => {
      const mockAlert = vi.spyOn(window, "alert").mockImplementation(vi.fn());

      const station: Station = generateBlankStation({ name: "Vitest Station-1" });
      const stationAction: Action = generateBlankAction({
        name: "Vitest Action-1",
        stationUuid: station.uuid,
      });
      const stationInEva: Station = generateBlankStation({ name: "Vitest Station-3" });
      const eva: Eva = generateBlankEVA({
        name: "Vitest Eva-1",
        sequence: [{ type: "station", uuid: stationInEva.uuid }],
      });

      getMissionDocHandle().change((m) => {
        m.stations[station.uuid] = station;
        m.stations[stationInEva.uuid] = stationInEva;
        m.actions[stationAction.uuid] = stationAction;
        m.evas[eva.uuid] = eva;
      });

      const store = createCustomTestStore({
        station: {
          ...stationInitialState,
          selectedStationUuid: station.uuid,
          selectedRightNavItem: "info_panel",
        },
      });

      // delete a station
      await store.dispatch(thunkStation.thunkDocDeleteStations({ stationUuids: [station.uuid] }));
      expect(getMission().stations[station.uuid]).toBeUndefined();
      expect(getMission().actions[stationAction.uuid]).toBeUndefined();
      expect(store.getState().station.selectedStationUuid).toBeFalsy();
      expect(mockThunkCancelMarkerMapDirective).toHaveBeenCalled();

      // try to delete a station being used in eva sequence -> alert + no-op
      await store.dispatch(
        thunkStation.thunkDocDeleteStations({ stationUuids: [stationInEva.uuid] })
      );
      expect(getMission().stations[stationInEva.uuid]).toBeDefined();
      expect(mockAlert).toHaveBeenCalled();

      mockAlert.mockRestore();
    });

    test("alerts and aborts when station occupies an EVA ingress position", async () => {
      const mockAlert = vi.spyOn(window, "alert").mockImplementation(vi.fn());

      const egress: Station = generateBlankStation({ name: "Vitest Egress" });
      const station: Station = generateBlankStation({ name: "Vitest Ingress Station" });
      const traverse = generateBlankTraverse({ name: "Vitest Traverse" });
      const eva: Eva = generateBlankEVA({
        name: "Vitest EVA-Ingress",
        sequence: [
          { type: "station", uuid: egress.uuid },
          { type: "traverse", uuid: traverse.uuid },
          { type: "station", uuid: station.uuid },
        ],
      });
      getMissionDocHandle().change((m) => {
        m.stations[egress.uuid] = egress;
        m.stations[station.uuid] = station;
        m.traverses[traverse.uuid] = traverse;
        m.evas[eva.uuid] = eva;
      });
      const store = createCustomTestStore({});

      await store.dispatch(thunkStation.thunkDocDeleteStations({ stationUuids: [station.uuid] }));

      // Station must NOT have been deleted
      expect(getMission().stations[station.uuid]).toBeDefined();
      expect(mockAlert).toHaveBeenCalledTimes(1);
      expect(mockAlert.mock.calls[0][0]).toContain("being used by an EVA");

      mockAlert.mockRestore();
    });

    test("alerts and aborts when deleting a lander station directly", async () => {
      const mockAlert = vi.spyOn(window, "alert").mockImplementation(vi.fn());

      const landerStation: Station = generateBlankStation({
        name: "Lander",
        isLanderXgress: true,
      });
      getMissionDocHandle().change((m) => {
        m.stations[landerStation.uuid] = landerStation;
      });
      const store = createCustomTestStore({});

      await store.dispatch(
        thunkStation.thunkDocDeleteStations({ stationUuids: [landerStation.uuid] })
      );

      expect(getMission().stations[landerStation.uuid]).toBeDefined();
      expect(mockAlert).toHaveBeenCalledTimes(1);
      expect(mockAlert.mock.calls[0][0]).toContain("egress or ingress");

      mockAlert.mockRestore();
    });
  });

  describe("thunkDocCreateStation", () => {
    test("upsert a new station into automerge", async () => {
      const store = createCustomTestStore({ station: { ...stationInitialState } });
      expect(Object.keys(getMission().stations).length).toEqual(0);

      await store.dispatch(thunkStation.thunkDocCreateStation());

      expect(Object.keys(getMission().stations).length).toEqual(1);
      const storeState = store.getState();
      expect(storeState.station.selectedStationUuid).toBeTruthy();
      expect(storeState.station.selectedRightNavItem).toEqual("info_panel");
    });

    test("initializes mapCircleControls and circleUIStates from mission circleDefinitions", async () => {
      const circleDefUuid = "circle-def-uuid-1";
      getMissionDocHandle().change((m) => {
        m.circleDefinitions = {
          [circleDefUuid]: { name: "Vitest Test Circle", radius: 50 },
        };
      });

      const store = createCustomTestStore({ station: { ...stationInitialState } });

      await store.dispatch(thunkStation.thunkDocCreateStation());

      const stations = Object.values(getMission().stations);
      expect(stations.length).toEqual(1);
      const newStation = stations[0];

      // mapCircleControls should contain an entry for the circle definition
      expect(newStation.mapCircleControls[circleDefUuid]).toBeDefined();
      expect(newStation.mapCircleControls[circleDefUuid].uuid).toEqual(circleDefUuid);
      expect(newStation.mapCircleControls[circleDefUuid].visible).toEqual(false);

      // Redux slice should also have circleUIStates for the new station
      const newStationUuid = newStation.uuid;
      const uiStates = store.getState().station.stationCirclesUIStates[newStationUuid];
      expect(uiStates).toBeDefined();
      expect(uiStates[circleDefUuid]).toBeDefined();
      expect(uiStates[circleDefUuid].slidersSelected).toEqual(false);
    });
  });

  describe("thunkDocDuplicateStation", () => {
    test("clones a station and its actions", async () => {
      const station: Station = generateBlankStation({ name: "Vitest Station-1" });
      const stationAction1: Action = generateBlankAction({
        name: "Vitest Action-1",
        stationUuid: station.uuid,
      });
      const stationAction2: Action = generateBlankAction({
        name: "Vitest Action-2",
        stationUuid: station.uuid,
      });
      station.actionOrderUuids = [stationAction1.uuid, stationAction2.uuid];
      getMissionDocHandle().change((m) => {
        m.stations[station.uuid] = station;
        m.actions[stationAction1.uuid] = stationAction1;
        m.actions[stationAction2.uuid] = stationAction2;
      });
      const store = createCustomTestStore({ station: { ...stationInitialState } });

      await store.dispatch(
        thunkStation.thunkDocDuplicateStation({ stationUuid: station.uuid, preserveRefUuid: false })
      );

      expect(Object.keys(getMission().stations).length).toEqual(2);
      expect(store.getState().station.selectedStationUuid).toBeTruthy();
      expect(store.getState().station.selectedRightNavItem).toEqual("info_panel");
      // The two original actions plus two duplicated actions should all be in the doc.
      expect(Object.keys(getMission().actions).length).toEqual(4);
      // The new (duplicate) station should reference 2 cloned action uuids.
      const newStationUuid = store.getState().station.selectedStationUuid;
      expect(getMission().stations[newStationUuid].actionOrderUuids).toHaveLength(2);
    });

    test("copies circleUIStates from original station to duplicate", async () => {
      const circleDefUuid = "circle-def-uuid-2";
      const station: Station = generateBlankStation({ name: "Vitest Station-CircleDup" });
      getMissionDocHandle().change((m) => {
        m.stations[station.uuid] = station;
        m.circleDefinitions = {
          [circleDefUuid]: { name: "Vitest Test Circle", radius: 30 },
        };
      });

      // Pre-populate the Redux slice with circle UI states for the original station
      const store = createCustomTestStore({
        station: {
          ...stationInitialState,
          stationCirclesUIStates: {
            [station.uuid]: {
              [circleDefUuid]: { slidersSelected: true },
            },
          },
        },
      });

      await store.dispatch(
        thunkStation.thunkDocDuplicateStation({ stationUuid: station.uuid, preserveRefUuid: false })
      );

      const stations = Object.values(getMission().stations);
      expect(stations.length).toEqual(2);

      // Find the new station (not the original)
      const dupStation = stations.find((s) => s.uuid !== station.uuid);
      expect(dupStation).toBeDefined();

      // The duplicate's circleUIStates should mirror the original's
      const dupUIStates = store.getState().station.stationCirclesUIStates[dupStation.uuid];
      expect(dupUIStates).toBeDefined();
      expect(dupUIStates[circleDefUuid]).toBeDefined();
      expect(dupUIStates[circleDefUuid].slidersSelected).toEqual(true);
    });

    test("with preserveRefUuid=true does not select new station", async () => {
      const station: Station = generateBlankStation({ name: "Vitest Station-PreserveRef" });
      getMissionDocHandle().change((m) => {
        m.stations[station.uuid] = station;
      });
      const store = createCustomTestStore({ station: { ...stationInitialState } });

      await store.dispatch(
        thunkStation.thunkDocDuplicateStation({ stationUuid: station.uuid, preserveRefUuid: true })
      );

      // Station is duplicated but selectedStationUuid stays null (not changed)
      expect(Object.keys(getMission().stations).length).toEqual(2);
      expect(store.getState().station.selectedStationUuid).toBeNull();
    });
  });

  describe("thunkDocSyncStationsWithMission", () => {
    test("adds circle UI states and mapCircleControls for new circle definitions", async () => {
      const circleDefUuid = "sync-circle-def-1";
      const station: Station = generateBlankStation({
        name: "Vitest Station-Sync",
        // station has no circle controls yet
        mapCircleControls: {},
      });
      getMissionDocHandle().change((m) => {
        m.stations[station.uuid] = station;
        m.circleDefinitions = {
          [circleDefUuid]: { name: "Vitest Sync Circle", radius: 20 },
        };
      });

      const store = createCustomTestStore({
        station: {
          ...stationInitialState,
          // no existing circleUIStates for this station
          stationCirclesUIStates: {},
        },
      });

      await store.dispatch(thunkStation.thunkDocSyncStationsWithMission());

      // mapCircleControls in automerge should now contain the new circle definition
      const updatedStation = getMission().stations[station.uuid];
      expect(updatedStation.mapCircleControls[circleDefUuid]).toBeDefined();
      expect(updatedStation.mapCircleControls[circleDefUuid].uuid).toEqual(circleDefUuid);

      // Redux slice should have the circle UI state
      const uiStates = store.getState().station.stationCirclesUIStates[station.uuid];
      expect(uiStates).toBeDefined();
      expect(uiStates[circleDefUuid]).toBeDefined();
      expect(uiStates[circleDefUuid].slidersSelected).toEqual(false);
    });

    test("removes stale circle UI states and mapCircleControls for deleted circle definitions", async () => {
      const staleCircleUuid = "stale-circle-uuid";
      const station: Station = generateBlankStation({
        name: "Vitest Station-SyncRemove",
        mapCircleControls: {
          [staleCircleUuid]: { uuid: staleCircleUuid, visible: true, style: null },
        },
      });
      getMissionDocHandle().change((m) => {
        m.stations[station.uuid] = station;
        // no circleDefinitions — all existing station entries should be pruned
        m.circleDefinitions = {};
      });

      const store = createCustomTestStore({
        station: {
          ...stationInitialState,
          stationCirclesUIStates: {
            [station.uuid]: {
              [staleCircleUuid]: { slidersSelected: false },
            },
          },
        },
      });

      await store.dispatch(thunkStation.thunkDocSyncStationsWithMission());

      // stale circle removed from automerge
      const updatedStation = getMission().stations[station.uuid];
      expect(updatedStation.mapCircleControls[staleCircleUuid]).toBeUndefined();

      // stale circle removed from Redux
      const uiStates = store.getState().station.stationCirclesUIStates[station.uuid];
      expect(uiStates[staleCircleUuid]).toBeUndefined();
    });

    test("with no stations is a no-op", async () => {
      // empty stations already set in beforeEach
      const store = createCustomTestStore({ station: { ...stationInitialState } });

      await expect(
        store.dispatch(thunkStation.thunkDocSyncStationsWithMission())
      ).resolves.not.toThrow();

      // stationCirclesUIStates stays empty
      expect(store.getState().station.stationCirclesUIStates).toEqual({});
    });

    test("preserves existing circle UI states that still exist in mission", async () => {
      const circleDefUuid = "existing-circle-def";
      const station: Station = generateBlankStation({
        name: "Vitest Station-SyncPreserve",
        mapCircleControls: {
          [circleDefUuid]: { uuid: circleDefUuid, visible: true, style: null },
        },
      });
      getMissionDocHandle().change((m) => {
        m.stations[station.uuid] = station;
        m.circleDefinitions = {
          [circleDefUuid]: { name: "Vitest Existing Circle", radius: 10 },
        };
      });

      const store = createCustomTestStore({
        station: {
          ...stationInitialState,
          stationCirclesUIStates: {
            [station.uuid]: {
              [circleDefUuid]: { slidersSelected: true },
            },
          },
        },
      });

      await store.dispatch(thunkStation.thunkDocSyncStationsWithMission());

      // Existing UI state should be preserved
      const uiStates = store.getState().station.stationCirclesUIStates[station.uuid];
      expect(uiStates[circleDefUuid].slidersSelected).toEqual(true);

      // mapCircleControls in automerge should still have the circle (preserved)
      const updatedStation = getMission().stations[station.uuid];
      expect(updatedStation.mapCircleControls[circleDefUuid]).toBeDefined();
    });
  });
});
