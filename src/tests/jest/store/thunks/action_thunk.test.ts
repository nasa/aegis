import { createCustomTestStore } from "../../factories/makeTestStore";
import { roundDateToSecond } from "utils/formatting";
import { initialState as missionInitialState } from "store/mission";
import { initialState as actionInitialState } from "store/action";
import { initialState as stationInitialState } from "store/station";
import { initialState as poiInitialState } from "store/poi";
import { v4 as uuidv4 } from "uuid";
import {
  thunkCreateAction,
  thunkDeleteActionFromStore,
  thunkDeleteActionsFromDbAndStore,
  thunkDuplicateActions,
  thunkGetHighlightedActions,
  thunkSaveActions,
  thunkUpdateActionLocation,
} from "store/thunk/thunkAction";

// mock all calls to the db so no transactions are actually made
// CAUTION, the import line must be below the jest.mock
jest.mock("http-client/action");
import * as httpClient_action from "http-client/action";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankPoi } from "store/storeUtils/poi";
import { generateBlankStation } from "store/storeUtils/station";
import {
  generateBlankActionTemplate,
  generateBlankMission,
  generateDefaultActionDefinitions,
} from "store/storeUtils/mission";

const mockThunkGetElevation = jest.fn();
jest.mock("store/thunk/thunkElevation", () => ({
  thunkGetElevation: () => mockThunkGetElevation,
}));

beforeEach(async () => {
  jest.clearAllMocks(); // clear call count
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe("Thunk Action Tests", () => {
  test("thunkCreateAction()", async () => {
    //populate the action state in the store
    const mission = generateBlankMission({
      name: "Jest Test Mission",
      landerLocation: { lat: 3, lng: 3 },
      actionTemplates: [generateBlankActionTemplate({ templateName: "Jest Action Template" })],
      actionDefinitions: generateDefaultActionDefinitions(),
    });
    const store = createCustomTestStore({
      mission: {
        ...missionInitialState,
        mission: mission,
        missionFromDb: mission,
      },
      action: actionInitialState,
    });

    const mockSetActionOrderUuids = jest.fn();
    await store.dispatch(
      thunkCreateAction({
        actionParentUuid: null,
        actionOrderUuids: [],
        setActionOrderUuids: mockSetActionOrderUuids,
      })
    );
    const storeState = store.getState();
    expect(storeState.action.actions.length).toEqual(1);
    expect(storeState.action.actionsFromDb.length).toEqual(0);
    const newAction = storeState.action.actions[0];
    expect(newAction.name).toBeTruthy();
    expect(newAction.uuid).not.toBeNull();
    expect(newAction.icon).toBeTruthy();
    expect(newAction.createdAt).toBeTruthy();
    expect(mockSetActionOrderUuids).toHaveBeenCalledTimes(1);
    expect(mockSetActionOrderUuids).toHaveBeenCalledWith([newAction.uuid]);
  });

  test("thunkDuplicateAction()", async () => {
    //populate the action state in the store
    const station: Station = generateBlankStation({ name: "Jest Station-1" });
    const stationAction: Action = generateBlankAction({
      name: "test station action",
      stationUuid: station.uuid,
    });
    station.actionOrderUuids = [stationAction.uuid];

    const poi: POI = generateBlankPoi({ name: "Jest Poi-1" });
    const poiAction: Action = generateBlankAction({ name: "test poi action", poiUuid: poi.uuid });
    poi.actionOrderUuids = [poiAction.uuid];

    const store = createCustomTestStore({
      station: { ...stationInitialState, stations: [station] },
      poi: { ...poiInitialState, pois: [poi] },
      action: {
        ...actionInitialState,
        actions: [stationAction, poiAction],
        actionsFromDb: [stationAction, poiAction],
      },
    });

    //duplicate station action
    await store.dispatch(
      thunkDuplicateActions({
        actions: [stationAction],
        saveToDb: false,
        preserveRefUuid: false,
        stationUuid: station.uuid,
      })
    );
    let storeState = store.getState();
    expect(storeState.action.actions.length).toEqual(3);
    let copiedAction = storeState.action.actions.find(
      (a) => a.name === "test station action (copy 1)"
    );
    expect(copiedAction).toBeTruthy();
    expect(copiedAction.parentActionUuid).toBeNull();
    expect(copiedAction.parentCopyDate).toBeNull();
    expect(storeState.station.stations[0].actionOrderUuids.length).toEqual(2);

    //promoting from a poi
    await store.dispatch(
      thunkDuplicateActions({
        actions: [poiAction],
        saveToDb: false,
        preserveRefUuid: false,
        stationUuid: station.uuid,
        promotingFromPoi: true,
      })
    );
    storeState = store.getState();
    expect(storeState.action.actions.length).toEqual(4);
    copiedAction = storeState.action.actions.find(
      (a) => a.name === "test poi action" && a.stationUuid === station.uuid
    );
    expect(copiedAction).toBeTruthy();
    expect(copiedAction.parentActionUuid).toEqual(poiAction.uuid);
    expect(copiedAction.parentCopyDate).toBeTruthy();
    expect(storeState.station.stations[0].actionOrderUuids.length).toEqual(3);

    //duplicate poi action
    await store.dispatch(
      thunkDuplicateActions({
        actions: [poiAction],
        poiUuid: poi.uuid,
        preserveRefUuid: false,
        saveToDb: false,
      })
    );
    storeState = store.getState();
    expect(storeState.action.actions.length).toEqual(5);
    copiedAction = storeState.action.actions.find((a) => a.name === "test poi action (copy 1)");
    expect(copiedAction).toBeTruthy();
    expect(copiedAction.parentActionUuid).toBeNull();
    expect(copiedAction.parentCopyDate).toBeNull();
    expect(storeState.poi.pois[0].actionOrderUuids.length).toEqual(2);
  });

  test("thunkSaveAction()", async () => {
    //populate the action state in the store
    const station: Station = generateBlankStation({ name: "Jest Station-1" });
    const stationAction: Action = generateBlankAction({
      name: "Jest Action-1",
      stationUuid: station.uuid,
    });
    const stationActionModified = {
      ...stationAction,
      name: "Jest Action-1 Modified",
      description: "modified description",
      updatedAt: roundDateToSecond(new Date()).toISOString(),
    };
    const unsavedStationAction: Action = generateBlankAction({
      name: "Jest Action-1",
      stationUuid: station.uuid,
    });
    unsavedStationAction.name = "Unsaved action";
    const deletedStationAction: Action = generateBlankAction({
      name: "Jest Action-1",
      stationUuid: station.uuid,
    });
    deletedStationAction.name = "Deleted action";
    const store = createCustomTestStore({
      action: {
        ...actionInitialState,
        actions: [stationActionModified, unsavedStationAction],
        actionsFromDb: [stationAction, deletedStationAction],
      },
    });

    //call the thunk
    await store.dispatch(
      thunkSaveActions({
        actions: store.getState().action.actions,
        actionsFromDb: store.getState().action.actionsFromDb,
      })
    );
    const storeState = store.getState(); //get the new state (always has to be called when state changes)
    expect(storeState.action.actions.length).toEqual(2);
    expect(storeState.action.actionsFromDb.length).toEqual(2);
    expect(storeState.action.actions.find((a) => a.uuid === stationAction.uuid)).toBeTruthy();
    expect(
      storeState.action.actionsFromDb.find((a) => a.uuid === unsavedStationAction.uuid)
    ).toBeTruthy();
    expect(
      storeState.action.actionsFromDb.find((a) => a.uuid === deletedStationAction.uuid)
    ).toBeFalsy();

    expect(httpClient_action.upsertActions).toHaveBeenCalledTimes(1); //check the db call was made
    expect(httpClient_action.deleteActions).toHaveBeenCalledTimes(1);

    expect(storeState.action.actions.map((a) => a.uuid)).toEqual(
      storeState.action.actionsFromDb.map((a) => a.uuid)
    );
  });

  test("thunkUpdateActionLocation()", async () => {
    //populate the action state in the store
    const action: Action = generateBlankAction({ name: "Jest Action-1", stationUuid: uuidv4() });
    const store = createCustomTestStore({
      action: { ...actionInitialState, actions: [action], actionsFromDb: [action] },
    });

    //call the thunk
    expect(store.getState().action.actions[0].location).toBeNull();
    const newLocation: AEGISPoint = { lat: 1, lng: 2 };
    await store.dispatch(
      thunkUpdateActionLocation({
        location: newLocation,
        actionUuid: action.uuid,
      })
    );
    expect(store.getState().action.actions[0].location).toEqual(newLocation);
    expect(mockThunkGetElevation).toHaveBeenCalled();
  });

  test("thunkGetHighlightedActions()", async () => {
    //populate the action state in the store
    const stmUuid1 = uuidv4();
    const stmUuid2 = uuidv4();
    const action1: Action = generateBlankAction({ name: "Jest Action-1", stationUuid: uuidv4() });
    action1.stmUuidRefs = [stmUuid1, stmUuid2];
    const action2: Action = generateBlankAction({ name: "Jest Action-1", stationUuid: uuidv4() });
    action2.stmUuidRefs = [stmUuid1, uuidv4()];
    const actionWithNoStm: Action = generateBlankAction({
      name: "Jest Action-1",
      stationUuid: uuidv4(),
    });
    const store = createCustomTestStore({
      action: {
        ...actionInitialState,
        actions: [action1, action2, actionWithNoStm],
        actionsFromDb: [],
      },
    });

    //highlight 2
    let thunkResponse = await store.dispatch(
      thunkGetHighlightedActions({
        actionUuids: [action1.uuid, action2.uuid, actionWithNoStm.uuid],
        stmUuid: stmUuid1,
      })
    );
    expect(thunkResponse.payload).toEqual([
      { uuid: action1.uuid, highlight: true },
      { uuid: action2.uuid, highlight: true },
      { uuid: actionWithNoStm.uuid, highlight: false },
    ]);

    //highlight 1
    thunkResponse = await store.dispatch(
      thunkGetHighlightedActions({
        actionUuids: [action1.uuid, action2.uuid, actionWithNoStm.uuid],
        stmUuid: stmUuid2,
      })
    );
    expect(thunkResponse.payload).toEqual([
      { uuid: action1.uuid, highlight: true },
      { uuid: action2.uuid, highlight: false },
      { uuid: actionWithNoStm.uuid, highlight: false },
    ]);

    //highlight none
    thunkResponse = await store.dispatch(
      thunkGetHighlightedActions({
        actionUuids: [action1.uuid, action2.uuid, actionWithNoStm.uuid],
        stmUuid: uuidv4(),
      })
    );
    expect(thunkResponse.payload).toEqual([
      { uuid: action1.uuid, highlight: false },
      { uuid: action2.uuid, highlight: false },
      { uuid: actionWithNoStm.uuid, highlight: false },
    ]);
  });

  test("thunkDeleteActionFromStore()", async () => {
    //populate the action state in the store
    const station: Station = generateBlankStation({ name: "Jest Station-1" });
    const stationAction: Action = generateBlankAction({
      name: "Jest Action-1",
      stationUuid: station.uuid,
    });
    station.actionOrderUuids = [stationAction.uuid];
    const poi: POI = generateBlankPoi({ name: "Jest Poi-1" });
    const poiAction: Action = generateBlankAction({ name: "Jest Action-1", poiUuid: poi.uuid });
    poi.actionOrderUuids = [poiAction.uuid, uuidv4()];

    const store = createCustomTestStore({
      station: { ...stationInitialState, stations: [station] },
      poi: { ...poiInitialState, pois: [poi] },
      action: { ...actionInitialState, actions: [stationAction, poiAction], actionsFromDb: [] },
    });

    //delete from station
    await store.dispatch(thunkDeleteActionFromStore({ uuid: stationAction.uuid }));
    let storeState = store.getState();
    expect(storeState.station.stations[0].actionOrderUuids.length).toEqual(0);
    expect(storeState.action.actions.find((a) => a.uuid === stationAction.uuid)).toBeUndefined();

    //delete from poi
    await store.dispatch(thunkDeleteActionFromStore({ uuid: poiAction.uuid }));
    storeState = store.getState();
    expect(storeState.poi.pois[0].actionOrderUuids.length).toEqual(1);
    expect(storeState.action.actions.find((a) => a.uuid === poiAction.uuid)).toBeUndefined();
  });

  test("thunkDeleteActionFromDbAndStore()", async () => {
    //populate the action state in the store
    const testAction: Action = generateBlankAction({ name: "Jest Action-1" });

    const store = createCustomTestStore({
      action: { ...actionInitialState, actions: [testAction], actionsFromDb: [testAction] },
    });

    await store.dispatch(thunkDeleteActionsFromDbAndStore({ uuids: [testAction.uuid] }));
    const storeState = store.getState();
    expect(httpClient_action.deleteActions).toHaveBeenCalledTimes(1);
    expect(storeState.action.actions.find((a) => a.uuid === testAction.uuid)).toBeUndefined();
    expect(storeState.action.actionsFromDb.find((a) => a.uuid === testAction.uuid)).toBeUndefined();
  });
});
