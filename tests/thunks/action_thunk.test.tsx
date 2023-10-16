import createTestStore from "../factories/makeTestStore";
import { roundDateToSecond } from "utils/formatting";
import { createTestAction } from "../factories/ActionFactory";
import { createTestStation } from "../factories/StationFactory";
import { initialState as actionInitialState } from "store/action";
import { initialState as stationInitialState } from "store/station";
import { initialState as poiInitialState } from "store/poi";
import { v4 as uuidv4 } from "uuid";
import {
  thunkCreateAction,
  thunkCycleActionRexToNextStatus,
  thunkDeleteAction,
  thunkDuplicateActions,
  thunkGetHighlightedActions,
  thunkSaveActions,
  thunkUpdateActionLocation,
} from "store/thunk/thunkAction";
import { createTestPoi } from "../factories/PoiFactory";
import * as httpClient_action from "http-client/action";
jest.mock("http-client/action", () => {
  return {
    __esModule: true,
    ...jest.requireActual("http-client/action"),
  };
});

const mockThunkGetElevation = jest.fn();
jest.mock("store/thunk/thunkElevation", () => ({
  thunkGetElevation: () => mockThunkGetElevation,
}));

afterAll(() => {
  jest.restoreAllMocks();
});

describe("Thunk Action Tests", () => {
  test("thunkCreateAction()", async () => {
    //populate the action state in the store
    const store = createTestStore({
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
    expect(mockSetActionOrderUuids).toBeCalledTimes(1);
    expect(mockSetActionOrderUuids).toBeCalledWith([newAction.uuid]);
  });

  test("thunkDuplicateAction()", async () => {
    //populate the action state in the store
    const station: Station = createTestStation();
    const poi: POI = createTestPoi();
    const stationAction: Action = createTestAction({ stationUuid: station.uuid });
    stationAction.name = "test station action";
    station.actionOrderUuids = [stationAction.uuid];
    const poiAction: Action = createTestAction({ poiUuid: poi.uuid });
    poiAction.name = "test poi action";
    poi.actionOrderUuids = [poiAction.uuid];
    const store = createTestStore({
      station: { ...stationInitialState, stations: [station] },
      poi: { ...poiInitialState, pois: [poi] },
      action: {
        actions: [stationAction, poiAction],
        actionsFromDb: [stationAction, poiAction],
      },
    });

    //duplicate station action
    await store.dispatch(
      thunkDuplicateActions({ actions: [stationAction], stationUuid: station.uuid })
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
    await store.dispatch(thunkDuplicateActions({ actions: [poiAction], poiUuid: poi.uuid }));
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
    const station: Station = createTestStation();
    const stationAction: Action = createTestAction({ stationUuid: station.uuid });
    const stationActionModified = {
      ...stationAction,
      name: "Jest Action-1 Modified",
      description: "modified description",
      updatedAt: roundDateToSecond(new Date()).toISOString(),
    };
    const unsavedStationAction: Action = createTestAction({ stationUuid: station.uuid });
    unsavedStationAction.name = "Unsaved action";
    const deletedStationAction: Action = createTestAction({ stationUuid: station.uuid });
    deletedStationAction.name = "Deleted action";
    const store = createTestStore({
      action: {
        actions: [stationActionModified, unsavedStationAction],
        actionsFromDb: [stationAction, deletedStationAction],
      },
    });

    //mock the call to upsert to the DB (we don't actually want to upsert)
    const mockDbDeleteAction = jest
      .spyOn(httpClient_action, "deleteAction")
      .mockImplementation(async () => {
        const res: WrappedResponse<null> = {
          status: "success",
          message: "Action Deleted",
        };
        return res;
      });
    const mockDbGetActions = jest
      .spyOn(httpClient_action, "getActions")
      .mockImplementation(async () => {
        const res: WrappedResponse<Action[]> = {
          status: "success",
          message: "Actions retrieved",
          data: [stationActionModified, unsavedStationAction],
        };
        return res;
      });
    const mockDbUpsertAction = jest
      .spyOn(httpClient_action, "upsertActions")
      .mockImplementation(async (actions) => {
        //just return the action that was passed in
        const res: WrappedResponse<Action[]> = {
          status: "success",
          message: "Action upserted",
          data: actions,
        };
        return res;
      });

    //call the thunk
    await store.dispatch(
      thunkSaveActions({
        actions: store.getState().action.actions,
        actionsFromDb: store.getState().action.actionsFromDb,
        stationUuid: station.uuid,
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

    expect(mockDbUpsertAction).toBeCalledTimes(1); //check the db call was made
    expect(mockDbDeleteAction).toBeCalledTimes(1);
    expect(mockDbGetActions).toBeCalledTimes(1);

    expect(storeState.action.actions.map((a) => a.uuid)).toEqual(
      storeState.action.actionsFromDb.map((a) => a.uuid)
    );

    //restore the mock back to normal
    mockDbUpsertAction.mockRestore();
    mockDbDeleteAction.mockRestore();
    mockDbGetActions.mockRestore();
  });

  test("thunkUpdateActionLocation()", async () => {
    //populate the action state in the store
    const action: Action = createTestAction({ stationUuid: uuidv4() });
    const store = createTestStore({
      action: { actions: [action], actionsFromDb: [action] },
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
    expect(mockThunkGetElevation).toBeCalled();
  });

  test("thunkGetHighlightedActions()", async () => {
    //populate the action state in the store
    const stmUuid1 = uuidv4();
    const stmUuid2 = uuidv4();
    const action1: Action = createTestAction({ stationUuid: uuidv4() });
    action1.stmUuidRefs = [stmUuid1, stmUuid2];
    const action2: Action = createTestAction({ stationUuid: uuidv4() });
    action2.stmUuidRefs = [stmUuid1, uuidv4()];
    const actionWithNoStm: Action = createTestAction({ stationUuid: uuidv4() });
    const store = createTestStore({
      action: { actions: [action1, action2, actionWithNoStm], actionsFromDb: [] },
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

  test("thunkDeleteAction()", async () => {
    //populate the action state in the store
    const station: Station = createTestStation();
    const stationAction: Action = createTestAction({ stationUuid: station.uuid });
    station.actionOrderUuids = [stationAction.uuid];
    const poi: POI = createTestPoi();
    const poiAction: Action = createTestAction({ poiUuid: poi.uuid });
    poi.actionOrderUuids = [poiAction.uuid, uuidv4()];

    const store = createTestStore({
      station: { ...stationInitialState, stations: [station] },
      poi: { ...poiInitialState, pois: [poi] },
      action: {
        actions: [stationAction, poiAction],
        actionsFromDb: [],
      },
    });

    //delete from station
    await store.dispatch(thunkDeleteAction({ uuid: stationAction.uuid }));
    let storeState = store.getState();
    expect(storeState.station.stations[0].actionOrderUuids.length).toEqual(0);
    expect(storeState.action.actions.find((a) => a.uuid === stationAction.uuid)).toBeUndefined();

    //delete from poi
    await store.dispatch(thunkDeleteAction({ uuid: poiAction.uuid }));
    storeState = store.getState();
    expect(storeState.poi.pois[0].actionOrderUuids.length).toEqual(1);
    expect(storeState.action.actions.find((a) => a.uuid === poiAction.uuid)).toBeUndefined();
  });

  test("thunkCycleActionRexToNextStatus()", async () => {
    //mock the call to upsert to the DB (we don't actually want to upsert)
    const mockDbUpsertAction = jest
      .spyOn(httpClient_action, "upsertActions")
      .mockImplementation(async (actions: Action[]) => {
        const res: WrappedResponse<Action[]> = {
          status: "success",
          message: "Action upserted",
          data: actions,
        };
        return res;
      });

    //populate the action state in the store
    const action: Action = createTestAction({ stationUuid: uuidv4() });
    const store = createTestStore({
      action: {
        actions: [action],
        actionsFromDb: [action],
      },
    });

    await store.dispatch(thunkCycleActionRexToNextStatus({ actionUuid: action.uuid }));
    expect(store.getState().action.actions[0].rexStatus).toEqual("in-progress");
    expect(store.getState().action.actionsFromDb[0].rexStatus).toEqual("in-progress");
    expect(store.getState().action.actions[0].updatedAt).toEqual(action.updatedAt);
    expect(mockDbUpsertAction).toBeCalledTimes(1);
    await store.dispatch(thunkCycleActionRexToNextStatus({ actionUuid: action.uuid }));
    expect(store.getState().action.actions[0].rexStatus).toEqual("complete");
    expect(store.getState().action.actionsFromDb[0].rexStatus).toEqual("complete");
    expect(store.getState().action.actions[0].updatedAt).toEqual(action.updatedAt);
    expect(mockDbUpsertAction).toBeCalledTimes(2);
    await store.dispatch(thunkCycleActionRexToNextStatus({ actionUuid: action.uuid }));
    expect(store.getState().action.actions[0].rexStatus).toEqual("skipped");
    expect(store.getState().action.actionsFromDb[0].rexStatus).toEqual("skipped");
    expect(store.getState().action.actions[0].updatedAt).toEqual(action.updatedAt);
    expect(mockDbUpsertAction).toBeCalledTimes(3);
    await store.dispatch(thunkCycleActionRexToNextStatus({ actionUuid: action.uuid }));
    expect(store.getState().action.actions[0].rexStatus).toEqual("pending");
    expect(store.getState().action.actionsFromDb[0].rexStatus).toEqual("pending");
    expect(store.getState().action.actions[0].updatedAt).toEqual(action.updatedAt);
    expect(mockDbUpsertAction).toBeCalledTimes(4);

    mockDbUpsertAction.mockRestore();
  });
});
