import {
  thunkCreatePoi,
  thunkCreatePoiCalculatedFields,
  thunkDeletePoi,
  thunkDuplicatePoi,
  thunkPoiCancel,
  thunkSavePoi,
  thunkUpdatePoiLocation,
} from "store/thunk/thunkPoi";
import { createTestPoi } from "../../factories/PoiFactory";
import makeTestStore from "../../factories/makeTestStore";
import * as httpClient_poi from "http-client/poi";
import * as httpClient_action from "http-client/action";
import { roundDateToSecond } from "utils/formatting";
import { createTestAction } from "../../factories/ActionFactory";

const mockThunkSaveActions = jest.fn();
const mockThunkDuplicateActions = jest.fn();

jest.mock("store/thunk/thunkAction", () => ({
  ...jest.requireActual("store/thunk/thunkAction"),
  thunkSaveActions: () => mockThunkSaveActions,
  thunkDuplicateActions: () => mockThunkDuplicateActions,
}));

describe("Thunk POI Tests", () => {
  it("thunkUpdatePoiLocation()", async () => {
    //mock and spy on the console log. This will supress it in the output
    const clg = jest.spyOn(console, "error").mockImplementation(() => {});

    //populate the poi state in the store
    const newPoi: POI = createTestPoi();
    const store = makeTestStore({
      poi: {
        pois: [newPoi],
        poisFromDb: [],
        selectedPoiUuid: null,
        selectedRightNavItem: "info_panel",
        poisEditing: [],
        calculatedFields: [],
      },
    });

    //call the thunk
    expect(store.getState().poi.pois.length).toEqual(1);
    expect(store.getState().poi.pois[0].location).toBeNull();
    const newLocation: AEGISPoint = { lat: 1, lng: 2 };
    await store.dispatch(thunkUpdatePoiLocation({ location: newLocation, poiUuid: newPoi.uuid }));
    expect(store.getState().poi.pois[0].location).toEqual(newLocation);

    //we're expecting elevation call to gdal will fail with a console error during jest testing
    expect(clg).toBeCalledTimes(1);
    clg.mockReset(); //reset the mock back to normal
  });

  it("thunkSavePoi() - does not save actions", async () => {
    //mock the call to upsert to the DB (we don't actually want to upsert)
    const mockDbUpsertPoi = jest
      .spyOn(httpClient_poi, "upsertPOI")
      .mockImplementation(async (poi) => {
        //just return the poi that was passed in
        const res: WrappedResponse<POI> = { status: "success", message: "POI upserted", data: poi };
        return res;
      });

    //populate the poi state in the store
    const poi: POI = createTestPoi();
    const poiModified = {
      ...poi,
      description: "modified description",
      updatedAt: roundDateToSecond(new Date()).toISOString(),
    };
    const newPoiAction: Action = createTestAction({ poiUuid: poi.uuid });
    const store = makeTestStore({
      poi: {
        pois: [poiModified],
        poisFromDb: [poi],
        selectedPoiUuid: null,
        selectedRightNavItem: "info_panel",
        poisEditing: [poi.uuid],
        calculatedFields: [],
      },
      action: {
        actions: [newPoiAction],
        actionsFromDb: [newPoiAction],
      },
    });

    //check init values in store
    let storeState = store.getState();
    expect(storeState.poi.pois[0].updatedAt).toEqual(poiModified.updatedAt);
    expect(storeState.poi.pois[0].description).toEqual("modified description");
    expect(storeState.poi.poisFromDb[0].updatedAt).toEqual(poi.updatedAt);
    expect(storeState.poi.poisFromDb[0].description).toEqual("");

    //call the thunk
    await store.dispatch(
      thunkSavePoi({
        poi: poiModified,
      })
    );
    storeState = store.getState(); //get the new state (always has to be called when state changes)
    expect(storeState.poi.pois[0].updatedAt).toEqual(poiModified.updatedAt);
    expect(storeState.poi.pois[0].description).toEqual("modified description");
    expect(storeState.poi.poisFromDb[0].updatedAt).toEqual(poiModified.updatedAt);
    expect(storeState.poi.poisFromDb[0].description).toEqual("modified description");
    expect(storeState.poi.poisEditing.length).toEqual(0);
    expect(mockDbUpsertPoi).toBeCalledTimes(1); //check the db call was made
    expect(mockThunkSaveActions).toBeCalledTimes(0);
    expect(storeState.action.actions[0]).toEqual(storeState.action.actionsFromDb[0]); //no actions were modified

    mockDbUpsertPoi.mockReset(); //reset the mock back to normal
  });

  it("thunkSavePoi() - saves actions", async () => {
    //mock the call to upsert to the DB (we don't actually want to upsert)
    const mockDbUpsertPoi = jest
      .spyOn(httpClient_poi, "upsertPOI")
      .mockImplementation(async (poi) => {
        const res: WrappedResponse<POI> = { status: "success", message: "POI upserted", data: poi };
        return res;
      });

    //populate the poi state in the store
    const poi: POI = createTestPoi();
    const poiAction: Action = createTestAction({ poiUuid: poi.uuid });
    const poiActionModified = {
      ...poiAction,
      description: "modified description",
      updatedAt: roundDateToSecond(new Date()).toISOString(),
    };
    const store = makeTestStore({
      poi: {
        pois: [poi],
        poisFromDb: [poi],
        selectedPoiUuid: null,
        selectedRightNavItem: "info_panel",
        poisEditing: [poi.uuid],
        calculatedFields: [],
      },
      action: {
        actions: [poiActionModified],
        actionsFromDb: [poiAction],
      },
    });

    //check init values in store
    let storeState = store.getState();
    expect(storeState.action.actions[0]).not.toEqual(storeState.action.actionsFromDb[0]);

    //call the thunk
    await store.dispatch(thunkSavePoi({ poi }));
    storeState = store.getState();
    expect(mockDbUpsertPoi).toBeCalledTimes(1); //check the db call was made
    expect(mockThunkSaveActions).toBeCalledTimes(1);
    expect(storeState.poi.poisEditing.length).toEqual(0);

    mockDbUpsertPoi.mockReset(); //reset the mock back to normal
  });

  it("thunkPoiCancel()", async () => {
    //populate the poi state in the store
    const poi: POI = createTestPoi();
    const poiModified = {
      ...poi,
      description: "modified description",
      updatedAt: roundDateToSecond(new Date()).toISOString(),
    };
    const unsavedPoi: POI = createTestPoi();
    const newPoiAction: Action = createTestAction({ poiUuid: poi.uuid });
    const newPoiActionModified = {
      ...newPoiAction,
      description: "modified description",
      updatedAt: roundDateToSecond(new Date()).toISOString(),
    };
    const store = makeTestStore({
      poi: {
        pois: [poiModified, unsavedPoi],
        poisFromDb: [poi],
        selectedPoiUuid: null,
        selectedRightNavItem: "info_panel",
        poisEditing: [poi.uuid, unsavedPoi.uuid],
        calculatedFields: [],
      },
      action: {
        actions: [newPoiActionModified],
        actionsFromDb: [newPoiAction],
      },
    });

    //cancel a poi that has changes pending
    await store.dispatch(thunkPoiCancel({ poi: poiModified }));
    let storeState = store.getState();
    const cancelledPoi = storeState.poi.pois.find((p) => p.uuid === poi.uuid);
    expect(cancelledPoi.updatedAt).toEqual(poi.updatedAt);
    expect(cancelledPoi.description).toEqual("");
    expect(cancelledPoi).toEqual(storeState.poi.poisFromDb[0]);
    expect(storeState.poi.poisEditing.includes(poi.uuid)).toBeFalsy();
    expect(storeState.action.actions[0]).toEqual(storeState.action.actionsFromDb[0]);

    //cancel a poi that hasn't been saved to the db
    expect(storeState.poi.pois.length).toEqual(2);
    await store.dispatch(thunkPoiCancel({ poi: unsavedPoi }));
    storeState = store.getState();
    expect(storeState.poi.poisEditing.includes(poi.uuid)).toBeFalsy();
    expect(storeState.poi.pois.length).toEqual(1);
    expect(storeState.poi.poisFromDb.length).toEqual(1);
  });

  it("thunkDeletePoi()", async () => {
    //mock the calls the DB
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
          message: "actions retrieved",
          data: [],
        };
        return res;
      });
    const mockDbDeletePoi = jest.spyOn(httpClient_poi, "deletePOI").mockImplementation(async () => {
      const res: WrappedResponse<null> = {
        status: "success",
        message: "POI Deleted",
      };
      return res;
    });
    const mockDbGetPois = jest.spyOn(httpClient_poi, "getPOIs").mockImplementation(async () => {
      const res: WrappedResponse<POI[]> = {
        status: "success",
        message: "POIs retrieved",
        data: [],
      };
      return res;
    });

    //populate the poi state in the store
    const poi: POI = createTestPoi();
    const poiAction: Action = createTestAction({ poiUuid: poi.uuid });
    const unsavedPoi: POI = createTestPoi();
    const unsavedPoiAction: Action = createTestAction({ poiUuid: unsavedPoi.uuid });
    const store = makeTestStore({
      poi: {
        pois: [poi, unsavedPoi],
        poisFromDb: [poi],
        selectedPoiUuid: poi.uuid,
        selectedRightNavItem: "info_panel",
        poisEditing: [poi.uuid, unsavedPoi.uuid],
        calculatedFields: [],
      },
      action: {
        actions: [poiAction, unsavedPoiAction],
        actionsFromDb: [poiAction],
      },
    });

    //delete a saved poi
    await store.dispatch(thunkDeletePoi({ poi: poi }));
    let storeState = store.getState();
    expect(storeState.poi.pois.find((p) => p.uuid === poi.uuid)).toBeFalsy();
    expect(storeState.poi.poisFromDb.find((p) => p.uuid === poi.uuid)).toBeFalsy();
    expect(storeState.poi.poisEditing.includes(poi.uuid)).toBeFalsy();
    expect(storeState.action.actionsFromDb.find((a) => a.uuid === poiAction.uuid)).toBeFalsy();
    expect(storeState.action.actions.find((a) => a.uuid === poiAction.uuid)).toBeFalsy();
    expect(storeState.poi.selectedPoiUuid).toBeFalsy();
    expect(mockDbDeletePoi).toBeCalledTimes(1);
    expect(mockDbGetPois).toBeCalledTimes(1);
    expect(mockDbGetActions).toBeCalledTimes(1);

    //delete an unsaved poi
    await store.dispatch(thunkDeletePoi({ poi: unsavedPoi }));
    storeState = store.getState();
    expect(storeState.poi.pois.find((p) => p.uuid === unsavedPoi.uuid)).toBeFalsy();
    expect(storeState.poi.poisEditing.includes(unsavedPoi.uuid)).toBeFalsy();
    expect(storeState.action.actions.find((a) => a.uuid === unsavedPoiAction.uuid)).toBeFalsy();
    expect(mockDbDeletePoi).toBeCalledTimes(1); //no additional calls should have been made from the earlier call
    expect(mockDbGetPois).toBeCalledTimes(1); //no additional calls should have been made from the earlier call

    //reset the mock back to normal
    mockDbDeleteAction.mockReset();
    mockDbGetActions.mockReset();
    mockDbDeletePoi.mockReset();
    mockDbGetPois.mockReset();
  });

  it("thunkCreatePoi()", async () => {
    //populate the poi state in the store
    const store = makeTestStore({
      poi: {
        pois: [],
        poisFromDb: [],
        selectedPoiUuid: null,
        selectedRightNavItem: "",
        poisEditing: [],
        calculatedFields: [],
      },
    });

    await store.dispatch(thunkCreatePoi());
    const storeState = store.getState();
    expect(storeState.poi.pois.length).toEqual(1);
    expect(storeState.poi.poisEditing.length).toEqual(1);
    expect(storeState.poi.selectedPoiUuid).toBeTruthy();
    expect(storeState.poi.selectedRightNavItem).toEqual("info_panel");
  });

  it("thunkDuplicatePoi()", async () => {
    //populate the poi state in the store
    const poi: POI = createTestPoi();
    const poiAction1: Action = createTestAction({ poiUuid: poi.uuid });
    const poiAction2: Action = createTestAction({ poiUuid: poi.uuid });
    poi.actionOrderUuids = [poiAction1.uuid, poiAction2.uuid];
    const store = makeTestStore({
      poi: {
        pois: [poi],
        poisFromDb: [poi],
        selectedPoiUuid: null,
        selectedRightNavItem: "",
        poisEditing: [],
        calculatedFields: [],
      },
      action: {
        actions: [poiAction1, poiAction2],
        actionsFromDb: [poiAction1, poiAction2],
      },
    });

    await store.dispatch(thunkDuplicatePoi({ poi }));
    const storeState = store.getState();
    expect(storeState.poi.pois.length).toEqual(2);
    expect(storeState.poi.poisEditing.length).toEqual(1);
    expect(storeState.poi.selectedPoiUuid).toBeTruthy();
    expect(storeState.poi.selectedRightNavItem).toEqual("info_panel");
    //we mocked the thunk duplicate action, so no further conditions will be tested here
    expect(mockThunkDuplicateActions).toBeCalledTimes(1);
  });

  it("thunkCreatePoiCalculatedFields()", async () => {
    //populate the poi state in the store
    const poi: POI = createTestPoi();
    const poiNoActions: POI = createTestPoi();
    const poiAction1: Action = {
      ...createTestAction({ poiUuid: poi.uuid }),
      durationLower: 5,
      durationUpper: 10,
      crewAssigned: ["EV1"],
    };
    const poiAction2: Action = {
      ...createTestAction({ poiUuid: poi.uuid }),
      durationLower: 2,
      durationUpper: 4,
      crewAssigned: ["EV2"],
    };
    const poiAction3: Action = {
      ...createTestAction({ poiUuid: poi.uuid }),
      durationLower: 1,
      durationUpper: 1,
    };
    const store = makeTestStore({
      poi: {
        pois: [poi, poiNoActions],
        poisFromDb: [poi, poiNoActions],
        selectedPoiUuid: null,
        selectedRightNavItem: "",
        poisEditing: [],
        calculatedFields: [],
      },
      action: {
        actions: [poiAction1, poiAction2, poiAction3],
        actionsFromDb: [poiAction1, poiAction2, poiAction3],
      },
    });

    await store.dispatch(thunkCreatePoiCalculatedFields());
    const storeState = store.getState();
    //check poi that has no actions
    expect(storeState.poi.calculatedFields.length).toEqual(2);
    const poiNoActionsCalcField = storeState.poi.calculatedFields.find(
      (c) => c.uuid === poiNoActions.uuid
    );
    expect(poiNoActionsCalcField.reportItems.length).toEqual(1);
    expect(poiNoActionsCalcField.reportItems[0]).toEqual({
      message: "POI has no actions",
      type: "warning",
    });

    //check poi with actions
    const poiCalcField = storeState.poi.calculatedFields.find((c) => c.uuid === poi.uuid);
    expect(poiCalcField.uuid).toEqual(poi.uuid);
    expect(poiCalcField.totalActionTime).toEqual({
      durationLower: 8,
      durationUpper: 15,
    });
    expect(poiCalcField.totalEv1Time).toEqual({
      durationLower: 5,
      durationUpper: 10,
    });
    expect(poiCalcField.totalEv2Time).toEqual({
      durationLower: 2,
      durationUpper: 4,
    });
    expect(poiCalcField.totalUnassignedTime).toEqual({
      durationLower: 1,
      durationUpper: 1,
    });
    expect(poiCalcField.totalDwellTime).toEqual({
      durationLower: 5,
      durationUpper: 10,
    });
    expect(poiCalcField.actionCount).toEqual(3);
  });
});
