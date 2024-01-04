import { createCustomTestStore } from "../../factories/makeTestStore";
import { createTestStation } from "../../factories/StationFactory";
import { roundDateToSecond } from "utils/formatting";
import { createTestAction } from "../../factories/ActionFactory";
import { createTestEva } from "../../factories/EVAFactory";
import { createTestMission } from "../../factories/MissionFactory";
import { initialState as evaInitialState } from "store/eva";
import { initialState as stationInitialState } from "store/station";
import { initialState as missionInitialState } from "store/mission";
import { initialState as mapInitialState } from "store/map";
import { initialState as actionInitialState } from "store/action";
import { isEqual } from "lodash";
import * as thunkStation from "store/thunk/thunkStation";

// mock all calls to the db so no transactions are actually made
// CAUTION, the import line must be below the jest.mock
jest.mock("http-client/station");
jest.mock("http-client/action");
import * as httpClient_station from "http-client/station";
import * as httpClient_action from "http-client/action";

const mockThunkCancelMarkerMapDirective = jest.fn();
jest.mock("store/thunk/thunkMap", () => {
  return {
    __esModule: true,
    ...jest.requireActual("store/thunk/thunkMap"),
    thunkCancelMarkerMapDirective: () => mockThunkCancelMarkerMapDirective,
  };
});

const mockThunkSaveActions = jest.fn();
const mockThunkDuplicateActions = jest.fn();
jest.mock("store/thunk/thunkAction", () => ({
  ...jest.requireActual("store/thunk/thunkAction"),
  thunkSaveActions: () => mockThunkSaveActions,
  thunkDuplicateActions: () => mockThunkDuplicateActions,
}));

const mockThunkGetElevation = jest.fn();
jest.mock("store/thunk/thunkElevation", () => ({
  thunkGetElevation: () => mockThunkGetElevation,
}));

const mockThunkUpdateTraversesAroundStation = jest.fn();
jest.mock("store/thunk/thunkTraverse", () => ({
  thunkUpdateTraversesAroundStation: () => mockThunkUpdateTraversesAroundStation,
}));

beforeEach(async () => {
  jest.clearAllMocks(); // clear call count
});

afterAll(() => {
  // restoreAllMocks() only restores mocks with .spyOn(). All others must be called manually
  // Modules mocked with jest.mock are only mocked for the file
  // https://jestjs.io/docs/jest-object#jestmockmodulename-factory-options
  jest.restoreAllMocks();
});

describe("Thunk Station Tests", () => {
  test("thunkUpdateStationLocation()", async () => {
    //populate the station state in the store
    const newStation: Station = createTestStation();
    const blankMission: Mission = createTestMission();
    const store = createCustomTestStore({
      station: { ...stationInitialState, stations: [newStation] },
      mission: {
        ...missionInitialState,
        mission: { ...blankMission, planetRadius: 1737400, landerLocation: { lat: 1.2, lng: 2.1 } },
      },
    });

    //call the thunk
    expect(store.getState().station.stations[0].location).toBeNull();
    const newLocation: AEGISPoint = { lat: 1, lng: 2 };
    await store.dispatch(
      thunkStation.thunkUpdateStationLocation({
        location: newLocation,
        stationUuid: newStation.uuid,
      })
    );
    expect(store.getState().station.stations[0].location).toEqual(newLocation);
    expect(mockThunkGetElevation).toHaveBeenCalled();
    expect(mockThunkUpdateTraversesAroundStation).toHaveBeenCalledTimes(1);
  });

  test("thunkUpdateWalkbackPath()", async () => {
    //populate the station state in the store
    const newStation: Station = createTestStation();
    const blankMission: Mission = createTestMission();
    const store = createCustomTestStore({
      station: { ...stationInitialState, stations: [newStation] },
      mission: { ...missionInitialState, mission: { ...blankMission, planetRadius: 1737400 } },
    });
    expect(store.getState().station.stations[0].walkbackPath).toBeNull();

    //path with 3 points
    const newPath: AEGISPoint[] = [
      { lat: 1, lng: 2 },
      { lat: 1, lng: 2.3 },
      { lat: 1, lng: 2.6 },
    ];
    await store.dispatch(
      thunkStation.thunkUpdateWalkbackPath({ path: newPath, stationUuid: newStation.uuid })
    );
    expect(store.getState().station.stations[0].walkbackPath).toEqual(newPath);
    expect(store.getState().station.stations[0].walkbackPathSegmentDistances.length).toEqual(2);
    expect(store.getState().station.stations[0].walkbackPathSegmentElevations).toBeNull();

    //empty path
    await store.dispatch(
      thunkStation.thunkUpdateWalkbackPath({ path: [], stationUuid: newStation.uuid })
    );
    expect(store.getState().station.stations[0].walkbackPath).toEqual([]);
    expect(store.getState().station.stations[0].walkbackPathSegmentDistances.length).toEqual(0);
    expect(store.getState().station.stations[0].walkbackPathSegmentElevations).toBeNull();
  });

  test("thunkFullUpdateWalkback()", async () => {
    //populate the station state in the store
    const newStation: Station = createTestStation();
    const blankMission: Mission = createTestMission();
    const store = createCustomTestStore({
      station: {
        ...stationInitialState,
        stations: [{ ...newStation, location: { lat: 1.3, lng: 2.3 } }],
      },
      mission: {
        ...missionInitialState,
        mission: { ...blankMission, planetRadius: 1737400, landerLocation: { lat: 1.2, lng: 2.1 } },
      },
    });
    expect(store.getState().station.stations[0].walkbackPath).toBeNull();

    //path with 3 points
    const newPath: AEGISPoint[] = [
      { lat: 1, lng: 2 },
      { lat: 1, lng: 2.3 },
      { lat: 1, lng: 2.6 },
    ];
    let expectedPath: AEGISPoint[] = [
      { lat: 1.3, lng: 2.3 },
      { lat: 1, lng: 2.3 },
      { lat: 1.2, lng: 2.1 },
    ];
    let response = await store.dispatch(
      thunkStation.thunkFullUpdateWalkback({ path: newPath, stationUuid: newStation.uuid })
    );
    expect(store.getState().station.stations[0].walkbackPath).toEqual(expectedPath);
    expect(store.getState().station.stations[0].walkbackPathSegmentDistances.length).toEqual(2);
    expect(store.getState().station.stations[0].walkbackPathSegmentElevations).toBeNull();
    expect(response.payload).toEqual(expectedPath);
    expect(mockThunkGetElevation).toHaveBeenCalled();

    //empty path
    expectedPath = [
      { lat: 1.3, lng: 2.3 },
      { lat: 1.2, lng: 2.1 },
    ];
    response = await store.dispatch(
      thunkStation.thunkFullUpdateWalkback({ path: [], stationUuid: newStation.uuid })
    );
    expect(store.getState().station.stations[0].walkbackPath).toEqual(expectedPath);
    expect(store.getState().station.stations[0].walkbackPathSegmentDistances.length).toEqual(1);
    expect(store.getState().station.stations[0].walkbackPathSegmentElevations).toBeNull();
    expect(response.payload).toEqual(expectedPath);
    expect(mockThunkGetElevation).toHaveBeenCalled();
  });

  test("thunkResetWalkback()", async () => {
    //populate the station state in the store
    const newStation: Station = createTestStation();
    const blankMission: Mission = createTestMission();
    const store = createCustomTestStore({
      station: {
        ...stationInitialState,
        stations: [
          {
            ...newStation,
            location: { lat: 1.3, lng: 2.3 },
            walkbackPath: [
              { lat: 1, lng: 2 },
              { lat: 1, lng: 2.3 },
              { lat: 1, lng: 2.6 },
            ],
          },
        ],
      },
      mission: {
        ...missionInitialState,
        mission: { ...blankMission, planetRadius: 1737400, landerLocation: { lat: 1.2, lng: 2.1 } },
      },
    });
    expect(store.getState().station.stations[0].walkbackPath.length).toEqual(3);

    const expectedPath: AEGISPoint[] = [
      { lat: 1.3, lng: 2.3 },
      { lat: 1.2, lng: 2.1 },
    ];
    await store.dispatch(thunkStation.thunkResetWalkback({ stationUuid: newStation.uuid }));
    expect(store.getState().station.stations[0].walkbackPath).toEqual(expectedPath);
    expect(store.getState().station.stations[0].walkbackPathSegmentDistances.length).toEqual(1);
    expect(store.getState().station.stations[0].walkbackPathSegmentElevations).toBeNull();
    expect(mockThunkGetElevation).toHaveBeenCalled();
  });

  test("thunkCreateStationCalculatedFields()", async () => {
    //populate the station state in the store
    const station: Station = createTestStation();
    const blankMission: Mission = createTestMission();
    const stationNoActions: Station = createTestStation();
    const stationAction1: Action = {
      ...createTestAction({ stationUuid: station.uuid }),
      durationLower: 5,
      durationUpper: 10,
      crewAssigned: ["EV1"],
    };
    const stationAction2: Action = {
      ...createTestAction({ stationUuid: station.uuid }),
      durationLower: 2,
      durationUpper: 4,
      crewAssigned: ["EV2"],
    };
    const stationAction3: Action = {
      ...createTestAction({ stationUuid: station.uuid }),
      durationLower: 1,
      durationUpper: 1,
    };
    const store = createCustomTestStore({
      station: {
        ...stationInitialState,
        stations: [station, stationNoActions],
        stationsFromDb: [station, stationNoActions],
        selectedStationUuid: null,
        selectedRightNavItem: "",
        stationsEditing: [],
        calculatedFields: [],
      },
      action: {
        ...actionInitialState,
        actions: [stationAction1, stationAction2, stationAction3],
        actionsFromDb: [stationAction1, stationAction2, stationAction3],
      },
      mission: {
        ...missionInitialState,
        mission: { ...blankMission, traverseRate: 2 },
      },
    });

    await store.dispatch(thunkStation.thunkCreateStationCalculatedFields());
    const storeState = store.getState();
    //two calculated fields for the 2 stations in the store
    expect(storeState.station.calculatedFields.length).toEqual(2);

    //check station that has no actions
    const stationNoActionsCalcField = storeState.station.calculatedFields.find(
      (c) => c.uuid === stationNoActions.uuid
    );
    expect(stationNoActionsCalcField.reportItems.length).toEqual(3);
    expect(
      stationNoActionsCalcField.reportItems.find((r) =>
        isEqual(r, {
          message: "Station has no actions",
          type: "warning",
        })
      )
    ).toBeTruthy();
    expect(
      stationNoActionsCalcField.reportItems.find((r) =>
        isEqual(r, {
          message: "Station location not yet set",
          type: "warning",
        })
      )
    ).toBeTruthy();
    expect(
      stationNoActionsCalcField.reportItems.find((r) =>
        isEqual(r, {
          message: "Station has no associated POIs",
          type: "info",
        })
      )
    ).toBeTruthy();

    //check station with actions
    const stationCalcField = storeState.station.calculatedFields.find(
      (c) => c.uuid === station.uuid
    );
    expect(stationCalcField.uuid).toEqual(station.uuid);
    expect(stationCalcField.totalActionTime).toEqual({
      durationLower: 8,
      durationUpper: 15,
    });
    expect(stationCalcField.totalEv1Time).toEqual({
      durationLower: 5,
      durationUpper: 10,
    });
    expect(stationCalcField.totalEv2Time).toEqual({
      durationLower: 2,
      durationUpper: 4,
    });
    expect(stationCalcField.totalUnassignedTime).toEqual({
      durationLower: 1,
      durationUpper: 1,
    });
    expect(stationCalcField.totalDwellTime).toEqual({
      durationLower: 5,
      durationUpper: 10,
    });
    expect(stationCalcField.actionCount).toEqual(3);
  });

  test("thunkSaveStation() - no modified actions", async () => {
    //populate the station state in the store
    const station: Station = createTestStation();
    const stationModified = {
      ...station,
      name: "Jest Station-1 Modified",
      description: "modified description",
      updatedAt: roundDateToSecond(new Date()).toISOString(),
    };
    const newStationAction: Action = createTestAction({ stationUuid: station.uuid });
    const eva: Eva = createTestEva();
    eva.sequence = [{ type: "station", uuid: station.uuid }];
    const store = createCustomTestStore({
      station: {
        ...stationInitialState,
        stations: [stationModified],
        stationsFromDb: [station],
        stationsEditing: [station.uuid],
      },
      action: {
        ...actionInitialState,
        actions: [newStationAction],
        actionsFromDb: [newStationAction],
      },
      eva: { ...evaInitialState, evas: [eva], evasFromDb: [eva] },
      map: {
        ...mapInitialState,
        mapDirective: { uuid: station.uuid, mapAction: "editPolyline", mapItemType: "walkback" },
      },
    });

    //call the thunk
    await store.dispatch(
      thunkStation.thunkSaveStation({
        station: stationModified,
      })
    );
    const storeState = store.getState(); //get the new state (always has to be called when state changes)
    expect(storeState.station.stations[0].updatedAt).toEqual(stationModified.updatedAt);
    expect(storeState.station.stations[0].description).toEqual("modified description");
    expect(storeState.station.stationsFromDb[0].updatedAt).toEqual(stationModified.updatedAt);
    expect(storeState.station.stationsFromDb[0].description).toEqual("modified description");
    expect(storeState.station.stationsEditing.length).toEqual(0);
    expect(httpClient_station.upsertStations).toHaveBeenCalledTimes(1); //check the db call was made
    expect(mockThunkSaveActions).toHaveBeenCalledTimes(0);
    expect(storeState.action.actions[0]).toEqual(storeState.action.actionsFromDb[0]); //no actions were modified
    expect(mockThunkCancelMarkerMapDirective).toHaveBeenCalledTimes(1);
    expect(storeState.map.mapDirective.mapAction).toEqual("saveEditPolyline");
  });

  test("thunkSaveStation() - saves actions", async () => {
    //populate the station state in the store
    const station: Station = createTestStation();
    const stationAction: Action = createTestAction({ stationUuid: station.uuid });
    const stationActionModified: Action = {
      ...stationAction,
      description: "modified description",
      updatedAt: roundDateToSecond(new Date()).toISOString(),
    };
    const store = createCustomTestStore({
      station: {
        ...stationInitialState,
        stations: [station],
        stationsFromDb: [station],
        stationsEditing: [station.uuid],
      },
      action: {
        ...actionInitialState,
        actions: [stationActionModified],
        actionsFromDb: [stationAction],
      },
    });

    //check init values in store
    let storeState = store.getState();
    expect(storeState.action.actions[0]).not.toEqual(storeState.action.actionsFromDb[0]);

    //call the thunk
    await store.dispatch(thunkStation.thunkSaveStation({ station: station }));
    storeState = store.getState();
    expect(httpClient_station.upsertStations).toHaveBeenCalledTimes(1); //check the db call was made
    expect(mockThunkSaveActions).toHaveBeenCalledTimes(1);
    expect(mockThunkCancelMarkerMapDirective).toHaveBeenCalledTimes(1);
    expect(storeState.station.stationsEditing.length).toEqual(0);
  });

  test("thunkStationCancel()", async () => {
    //populate the station state in the store
    const station: Station = createTestStation();
    const stationModified = {
      ...station,
      description: "modified description",
      updatedAt: roundDateToSecond(new Date()).toISOString(),
      location: { lat: 1, lng: 2 },
    };
    const unsavedStation: Station = createTestStation();
    const unsavedStationAction: Action = createTestAction({ stationUuid: unsavedStation.uuid });
    const stationAction: Action = createTestAction({ stationUuid: station.uuid });
    const stationActionModified = {
      ...stationAction,
      description: "modified description",
      updatedAt: roundDateToSecond(new Date()).toISOString(),
    };
    const newStationAction: Action = createTestAction({ stationUuid: station.uuid });
    const store = createCustomTestStore({
      station: {
        ...stationInitialState,
        stations: [stationModified, unsavedStation],
        stationsFromDb: [station],
        stationsEditing: [station.uuid, unsavedStation.uuid],
      },
      action: {
        ...actionInitialState,
        actions: [stationActionModified, unsavedStationAction, newStationAction],
        actionsFromDb: [stationAction],
      },
      map: {
        ...mapInitialState,
        mapDirective: { uuid: station.uuid, mapAction: "editPolyline", mapItemType: "walkback" },
      },
    });

    //cancel a station that has changes pending
    await store.dispatch(thunkStation.thunkStationCancel({ station: stationModified }));
    let storeState = store.getState();
    const cancelledStation = storeState.station.stations.find((p) => p.uuid === station.uuid);
    expect(cancelledStation.updatedAt).toEqual(station.updatedAt);
    expect(cancelledStation.description).toEqual("");
    expect(cancelledStation).toEqual(storeState.station.stationsFromDb[0]);
    expect(storeState.station.stationsEditing.includes(station.uuid)).toBeFalsy();
    expect(storeState.action.actions.find((a) => a.stationUuid === station.uuid)).toEqual(
      storeState.action.actionsFromDb[0]
    );
    expect(storeState.action.actions.filter((a) => a.stationUuid === station.uuid).length).toEqual(
      1
    );
    expect(mockThunkUpdateTraversesAroundStation).toHaveBeenCalled();
    expect(storeState.map.mapDirective.mapAction).toEqual("cancelEditPolyline");
    expect(mockThunkCancelMarkerMapDirective).toHaveBeenCalled();

    //cancel a station that hasn't been saved to the db
    expect(storeState.station.stations.length).toEqual(2);
    await store.dispatch(thunkStation.thunkStationCancel({ station: unsavedStation }));
    storeState = store.getState();
    expect(storeState.station.stationsEditing.includes(station.uuid)).toBeFalsy();
    expect(storeState.station.stations.length).toEqual(1);
    expect(storeState.station.stationsFromDb.length).toEqual(1);
    expect(storeState.station.selectedStationUuid).toBeNull();
    expect(storeState.action.actions.length).toEqual(1);
    expect(mockThunkCancelMarkerMapDirective).toHaveBeenCalled();
  });

  test("thunkDeleteStation()", async () => {
    const mockAlert = jest.spyOn(window, "alert").mockImplementation(jest.fn());

    //populate the station state in the store
    const station: Station = createTestStation();
    const stationAction: Action = createTestAction({ stationUuid: station.uuid });
    const unsavedStation: Station = createTestStation();
    const unsavedStationAction: Action = createTestAction({ stationUuid: unsavedStation.uuid });
    const stationInEva: Station = createTestStation();
    const eva: Eva = createTestEva();
    const store = createCustomTestStore({
      station: {
        ...stationInitialState,
        stations: [station, unsavedStation, stationInEva],
        stationsFromDb: [station],
        selectedStationUuid: station.uuid,
        selectedRightNavItem: "info_panel",
        stationsEditing: [station.uuid, unsavedStation.uuid],
        calculatedFields: [],
      },
      action: {
        ...actionInitialState,
        actions: [stationAction, unsavedStationAction],
        actionsFromDb: [stationAction],
      },
      eva: {
        ...evaInitialState,
        evas: [{ ...eva, sequence: [{ type: "station", uuid: stationInEva.uuid }] }],
      },
    });

    //delete a saved station
    await store.dispatch(thunkStation.thunkDeleteStation({ station: station }));
    let storeState = store.getState();
    expect(storeState.station.stations.find((p) => p.uuid === station.uuid)).toBeFalsy();
    expect(storeState.station.stationsFromDb.find((p) => p.uuid === station.uuid)).toBeFalsy();
    expect(storeState.station.stationsEditing.includes(station.uuid)).toBeFalsy();
    expect(storeState.action.actionsFromDb.find((a) => a.uuid === stationAction.uuid)).toBeFalsy();
    expect(storeState.action.actions.find((a) => a.uuid === stationAction.uuid)).toBeFalsy();
    expect(storeState.station.selectedStationUuid).toBeFalsy();
    expect(httpClient_station.deleteStations).toHaveBeenCalledTimes(1);
    expect(httpClient_station.getStations).toHaveBeenCalledTimes(1);
    expect(httpClient_action.getActions).toHaveBeenCalledTimes(1);
    expect(mockThunkCancelMarkerMapDirective).toHaveBeenCalled();

    //delete an unsaved station
    await store.dispatch(thunkStation.thunkDeleteStation({ station: unsavedStation }));
    storeState = store.getState();
    expect(storeState.station.stations.find((p) => p.uuid === unsavedStation.uuid)).toBeFalsy();
    expect(storeState.station.stationsEditing.includes(unsavedStation.uuid)).toBeFalsy();
    expect(storeState.action.actions.find((a) => a.uuid === unsavedStationAction.uuid)).toBeFalsy();
    expect(httpClient_station.deleteStations).toHaveBeenCalledTimes(1); //no additional calls should have been made from the earlier call
    expect(httpClient_station.getStations).toHaveBeenCalledTimes(1); //no additional calls should have been made from the earlier call
    expect(mockThunkCancelMarkerMapDirective).toHaveBeenCalled();

    //try to delete a station being used in eva
    await store.dispatch(thunkStation.thunkDeleteStation({ station: stationInEva }));
    storeState = store.getState();
    expect(storeState.station.stations.find((p) => p.uuid === stationInEva.uuid)).toBeTruthy();
    expect(mockAlert).toHaveBeenCalled();

    //reset the mock back to normal
    mockAlert.mockRestore();
  });

  test("thunkCreateStation()", async () => {
    //populate the station state in the store
    const store = createCustomTestStore({
      station: stationInitialState,
    });

    await store.dispatch(thunkStation.thunkCreateStation());
    const storeState = store.getState();
    expect(storeState.station.stations.length).toEqual(1);
    expect(storeState.station.stationsEditing.length).toEqual(1);
    expect(storeState.station.selectedStationUuid).toBeTruthy();
    expect(storeState.station.selectedRightNavItem).toEqual("info_panel");
  });

  test("thunkDuplicateStation()", async () => {
    //populate the station state in the store
    const station: Station = createTestStation();
    const stationAction1: Action = createTestAction({ stationUuid: station.uuid });
    const stationAction2: Action = createTestAction({ stationUuid: station.uuid });
    station.actionOrderUuids = [stationAction1.uuid, stationAction2.uuid];
    const store = createCustomTestStore({
      station: { ...stationInitialState, stations: [station], stationsFromDb: [station] },
      action: {
        ...actionInitialState,
        actions: [stationAction1, stationAction2],
        actionsFromDb: [stationAction1, stationAction2],
      },
    });

    await store.dispatch(thunkStation.thunkDuplicateStation({ station }));
    const storeState = store.getState();
    expect(storeState.station.stations.length).toEqual(2);
    expect(storeState.station.stationsEditing.length).toEqual(1);
    expect(storeState.station.selectedStationUuid).toBeTruthy();
    expect(storeState.station.selectedRightNavItem).toEqual("info_panel");
    //we mocked the thunk duplicate action, so no further conditions will be tested here
    expect(mockThunkDuplicateActions).toHaveBeenCalledTimes(1);
  });

  test("thunkCycleStationRexToNextStatus()", async () => {
    //populate the station state in the store
    const station: Station = createTestStation();
    const store = createCustomTestStore({
      station: { ...stationInitialState, stations: [station], stationsFromDb: [station] },
    });

    await store.dispatch(
      thunkStation.thunkCycleStationRexToNextStatus({ stationUuid: station.uuid })
    );
    expect(store.getState().station.stations[0].rexStatus).toEqual("in-progress");
    expect(store.getState().station.stationsFromDb[0].rexStatus).toEqual("in-progress");
    expect(store.getState().station.stations[0].updatedAt).toEqual(station.updatedAt);
    expect(httpClient_station.upsertStations).toHaveBeenCalledTimes(1);
    await store.dispatch(
      thunkStation.thunkCycleStationRexToNextStatus({ stationUuid: station.uuid })
    );
    expect(store.getState().station.stations[0].rexStatus).toEqual("complete");
    expect(store.getState().station.stationsFromDb[0].rexStatus).toEqual("complete");
    expect(store.getState().station.stations[0].updatedAt).toEqual(station.updatedAt);
    expect(httpClient_station.upsertStations).toHaveBeenCalledTimes(2);
    await store.dispatch(
      thunkStation.thunkCycleStationRexToNextStatus({ stationUuid: station.uuid })
    );
    expect(store.getState().station.stations[0].rexStatus).toEqual("skipped");
    expect(store.getState().station.stationsFromDb[0].rexStatus).toEqual("skipped");
    expect(store.getState().station.stations[0].updatedAt).toEqual(station.updatedAt);
    expect(httpClient_station.upsertStations).toHaveBeenCalledTimes(3);
    await store.dispatch(
      thunkStation.thunkCycleStationRexToNextStatus({ stationUuid: station.uuid })
    );
    expect(store.getState().station.stations[0].rexStatus).toEqual("pending");
    expect(store.getState().station.stationsFromDb[0].rexStatus).toEqual("pending");
    expect(store.getState().station.stations[0].updatedAt).toEqual(station.updatedAt);
    expect(httpClient_station.upsertStations).toHaveBeenCalledTimes(4);
  });
});
