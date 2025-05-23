import {
  thunkCreatePoi,
  thunkDeletePoi,
  thunkDuplicatePoi,
  thunkPoiCancel,
  thunkSavePoi,
  thunkUpdatePoiLocation,
} from "store/thunk/thunkPoi";
import { createCustomTestStore } from "../../factories/makeTestStore";
import { roundDateToSecond } from "utils/formatting";
import { initialState as poiInitialState } from "store/poi";
import { initialState as actionInitialState } from "store/action";

// mock all calls to the db so no transactions are actually made
// CAUTION, the import line must be below the jest.mock
jest.mock("http-client/action");
jest.mock("http-client/poi");
import * as httpClient_action from "http-client/action";
import * as httpClient_poi from "http-client/poi";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankPoi } from "store/storeUtils/poi";

const mockThunkGetElevation = jest.fn();
jest.mock("store/thunk/thunkElevation", () => ({
  thunkGetElevation: () => mockThunkGetElevation,
}));

const mockThunkSaveActions = jest.fn();
const mockThunkDuplicateActions = jest.fn();
jest.mock("store/thunk/thunkAction", () => ({
  ...jest.requireActual("store/thunk/thunkAction"),
  thunkSaveActions: () => mockThunkSaveActions,
  thunkDuplicateActions: () => mockThunkDuplicateActions,
}));

beforeEach(async () => {
  jest.clearAllMocks(); // clear call count
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe("Thunk POI Tests", () => {
  it("thunkUpdatePoiLocation()", async () => {
    //populate the poi state in the store
    const newPoi: POI = generateBlankPoi({ name: "Jest Poi-1" });
    const store = createCustomTestStore({
      poi: {
        ...poiInitialState,
        pois: [newPoi],
      },
    });

    //call the thunk
    expect(store.getState().poi.pois.length).toEqual(1);
    expect(store.getState().poi.pois[0].location).toBeNull();
    const newLocation: AEGISPoint = { lat: 1, lng: 2 };
    await store.dispatch(thunkUpdatePoiLocation({ location: newLocation, poiUuid: newPoi.uuid }));
    expect(store.getState().poi.pois[0].location).toEqual(newLocation);

    //we're expecting elevation call to gdal will fail with a console error during jest testing
    expect(mockThunkGetElevation).toHaveBeenCalledTimes(1);
  });

  it("thunkSavePoi() - no modified actions", async () => {
    //populate the poi state in the store
    const poi: POI = generateBlankPoi({ name: "Jest Poi-1" });
    const poiModified = {
      ...poi,
      description: "modified description",
      updatedAt: roundDateToSecond(new Date()).toISOString(),
    };
    const newPoiAction: Action = generateBlankAction({ name: "Jest Action-1", poiUuid: poi.uuid });
    const store = createCustomTestStore({
      poi: { ...poiInitialState, pois: [poiModified], poisFromDb: [poi], poisEditing: [poi.uuid] },
      action: { ...actionInitialState, actions: [newPoiAction], actionsFromDb: [newPoiAction] },
    });

    //check init values in store
    let storeState = store.getState();
    expect(storeState.poi.pois[0].description).toEqual("modified description");
    expect(storeState.poi.poisFromDb[0].description).toEqual("");

    //call the thunk
    await store.dispatch(
      thunkSavePoi({
        poi: poiModified,
      })
    );
    storeState = store.getState(); //get the new state (always has to be called when state changes)
    expect(storeState.poi.pois[0].description).toEqual("modified description");
    expect(storeState.poi.poisFromDb[0].description).toEqual("modified description");
    expect(storeState.poi.poisEditing.length).toEqual(0);
    expect(httpClient_poi.upsertPOIs).toHaveBeenCalledTimes(1); //check the db call was made
    expect(mockThunkSaveActions).toHaveBeenCalledTimes(0);
    expect(storeState.action.actions[0]).toEqual(storeState.action.actionsFromDb[0]); //no actions were modified
  });

  it("thunkSavePoi() - saves actions", async () => {
    //populate the poi state in the store
    const poi: POI = generateBlankPoi({ name: "Jest Poi-1" });
    const poiAction: Action = generateBlankAction({ name: "Jest Action-1", poiUuid: poi.uuid });
    const poiActionModified = {
      ...poiAction,
      description: "modified description",
      updatedAt: roundDateToSecond(new Date()).toISOString(),
    };
    const store = createCustomTestStore({
      poi: { ...poiInitialState, pois: [poi], poisFromDb: [poi], poisEditing: [poi.uuid] },
      action: { ...actionInitialState, actions: [poiActionModified], actionsFromDb: [poiAction] },
    });

    //check init values in store
    let storeState = store.getState();
    expect(storeState.action.actions[0]).not.toEqual(storeState.action.actionsFromDb[0]);

    //call the thunk
    await store.dispatch(thunkSavePoi({ poi }));
    storeState = store.getState();

    expect(httpClient_poi.upsertPOIs).toHaveBeenCalledTimes(1); //check the db call was made
    expect(mockThunkSaveActions).toHaveBeenCalledTimes(1);
    expect(storeState.poi.poisEditing.length).toEqual(0);
  });

  it("thunkPoiCancel()", async () => {
    //populate the poi state in the store
    const poi: POI = generateBlankPoi({ name: "Jest Poi-1" });
    const poiModified = {
      ...poi,
      description: "modified description",
      updatedAt: roundDateToSecond(new Date()).toISOString(),
    };
    const unsavedPoi: POI = generateBlankPoi({ name: "Jest Poi-1" });
    const newPoiAction: Action = generateBlankAction({ name: "Jest Action-1", poiUuid: poi.uuid });
    const newPoiActionModified = {
      ...newPoiAction,
      description: "modified description",
      updatedAt: roundDateToSecond(new Date()).toISOString(),
    };
    const store = createCustomTestStore({
      poi: {
        ...poiInitialState,
        pois: [poiModified, unsavedPoi],
        poisFromDb: [poi],
        poisEditing: [poi.uuid, unsavedPoi.uuid],
      },
      action: {
        ...actionInitialState,
        actions: [newPoiActionModified],
        actionsFromDb: [newPoiAction],
      },
    });

    //cancel a poi that has changes pending
    await store.dispatch(thunkPoiCancel({ poi: poiModified }));
    let storeState = store.getState();
    const cancelledPoi = storeState.poi.pois.find((p) => p.uuid === poi.uuid);
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
    //populate the poi state in the store
    const poi: POI = generateBlankPoi({ name: "Jest Poi-1" });
    const poiAction: Action = generateBlankAction({ name: "Jest Action-1", poiUuid: poi.uuid });
    const unsavedPoi: POI = generateBlankPoi({ name: "Jest Poi-1" });
    const unsavedPoiAction: Action = generateBlankAction({
      name: "Jest Action-1",
      poiUuid: unsavedPoi.uuid,
    });

    const store = createCustomTestStore({
      poi: {
        ...poiInitialState,
        pois: [poi, unsavedPoi],
        poisFromDb: [poi],
        selectedPoiUuid: poi.uuid,
        poisEditing: [poi.uuid, unsavedPoi.uuid],
      },
      action: {
        ...actionInitialState,
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
    expect(httpClient_poi.deletePOIs).toHaveBeenCalledTimes(1);
    expect(httpClient_poi.getPOIs).toHaveBeenCalledTimes(1);
    expect(httpClient_action.deleteActions).toHaveBeenCalledTimes(1);

    //delete an unsaved poi
    await store.dispatch(thunkDeletePoi({ poi: unsavedPoi }));
    storeState = store.getState();
    expect(storeState.poi.pois.find((p) => p.uuid === unsavedPoi.uuid)).toBeFalsy();
    expect(storeState.poi.poisEditing.includes(unsavedPoi.uuid)).toBeFalsy();
    expect(storeState.action.actions.find((a) => a.uuid === unsavedPoiAction.uuid)).toBeFalsy();
    expect(httpClient_poi.deletePOIs).toHaveBeenCalledTimes(1); //no additional calls should have been made from the earlier call
    expect(httpClient_poi.getPOIs).toHaveBeenCalledTimes(1); //no additional calls should have been made from the earlier call
  });

  it("thunkCreatePoi()", async () => {
    //populate the poi state in the store
    const store = createCustomTestStore({
      poi: { ...poiInitialState },
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
    const poi: POI = generateBlankPoi({ name: "Jest Poi-1" });
    const poiAction1: Action = generateBlankAction({ name: "Jest Action-1", poiUuid: poi.uuid });
    const poiAction2: Action = generateBlankAction({ name: "Jest Action-1", poiUuid: poi.uuid });
    poi.actionOrderUuids = [poiAction1.uuid, poiAction2.uuid];
    const store = createCustomTestStore({
      poi: { ...poiInitialState, pois: [poi], poisFromDb: [poi] },
      action: {
        ...actionInitialState,
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
    expect(mockThunkDuplicateActions).toHaveBeenCalledTimes(1);
  });
});
