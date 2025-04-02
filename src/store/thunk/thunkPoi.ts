import { deletePoiByUuid, upsertPoiFromDb } from "store/poi";
import appCreateAsyncThunk from "./thunkUtil";
import { thunkGetElevation } from "./thunkElevation";
import * as httpClient_poi from "http-client/poi";
import { upsertActions, deleteActionsByUuid } from "store/action";
import { thunkObliteratePoi, thunkSaveNewPoi } from "./crossThunk";
import { setPoiEditMode, setPoisFromDb, setSelectedPoiUuid, upsertPoi } from "store/poi";
import { generateUniqueName } from "utils/names/unique-name";
import { v4 as uuidv4 } from "uuid";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import { thunkCancelMarkerMapDirective } from "./thunkMap";
import cloneDeep from "lodash/cloneDeep";
import {
  thunkDeleteActionFromDbAndStore,
  thunkDuplicateActions,
  thunkSaveActions,
} from "./thunkAction";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import { isModified } from "utils/component-helpers";
import { thunkSetRightPanelIsOpenIfAuto } from "./thunkInterface";
import { generateBlankPoi } from "store/storeUtils/poi";

export const thunkUpdatePoiLatLngField = appCreateAsyncThunk<{
  poiUuid: string;
  type: "lat" | "lng";
  value: number;
}>("updatePoiLatLngField", async ({ poiUuid, type, value }, { getState, dispatch }) => {
  const poiLocation: AEGISPoint = cloneDeep(
    getState().poi.pois.find((p) => p.uuid === poiUuid)?.location
  );
  if (type === "lat") {
    poiLocation.lat = value;
  } else {
    poiLocation.lng = value;
  }
  await dispatch(thunkUpdatePoiLocation({ location: poiLocation, poiUuid }));
});

export const thunkUpdatePoiLocation = appCreateAsyncThunk<{
  location: AEGISPoint;
  poiUuid: string;
}>("updatePoiLocation", async ({ location, poiUuid }, { dispatch, getState }) => {
  const elevationRes = await dispatch(
    thunkGetElevation({
      path: [location],
      pathSegmentDistances: [0],
      uuid: poiUuid,
    })
  );
  const poi = getState().poi.pois.find((s) => s.uuid === poiUuid);
  if (!elevationRes || elevationRes.payload === false) {
    //elevation failed - upsert without it
    dispatch(upsertPoi({ ...poi, location }));
  } else {
    //upsert location and elevation
    dispatch(upsertPoi({ ...poi, location, elevation: elevationRes.payload as number }));
  }
});

export const thunkSavePoi = appCreateAsyncThunk<{
  poi: POI;
}>("poiSave", async ({ poi }, { dispatch, getState }) => {
  const poiActions = getState().action.actions.filter((action) => action.poiUuid === poi.uuid);
  const poiActionsFromDb = getState().action.actionsFromDb.filter(
    (action) => action.poiUuid === poi.uuid
  );

  //save poi to db
  const poiUpsertResponse = await httpClient_poi.upsertPOIs([
    {
      ...poi,
      updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
    },
  ]);

  if (poiUpsertResponse.status === "success") {
    // upsert the changed POI to the store
    dispatch(upsertPoi(poiUpsertResponse.data[0], true));
    // update the POI in the store with a fresh copy of POIs from DB
    dispatch(upsertPoiFromDb(poiUpsertResponse.data[0]));
  } else {
    throw new Error("Error upserting POI: " + poiUpsertResponse.message);
  }

  // find out if the actions in this poi have been modified and need to be persisted
  const actionsModified = isModified(poiActions, poiActionsFromDb);
  if (actionsModified) {
    dispatch(thunkSaveActions({ actions: poiActions, actionsFromDb: poiActionsFromDb }));
  }

  dispatch(setPoiEditMode({ poiUuid: poi.uuid, editMode: false }));
  //if we're in the middle of a map action, cancel it
  dispatch(thunkCancelMarkerMapDirective({ uuid: poi.uuid }));
});

export const thunkPoiCancel = appCreateAsyncThunk<{
  poi: POI;
}>("poiCancel", async ({ poi }, { dispatch, getState }) => {
  const poiFromDb = getState().poi.poisFromDb.find((poiFromDb) => poiFromDb.uuid === poi.uuid);
  const poiActions = getState().action.actions.filter((action) => action.poiUuid === poi.uuid);
  const poiActionsFromDb = getState().action.actionsFromDb.filter(
    (action) => action.poiUuid === poi.uuid
  );

  if (poiFromDb) {
    // if selected poi is in the db, replace it with the one from the db (undoing any changes)
    dispatch(upsertPoi(poiFromDb, true));
    dispatch(upsertActions(poiActionsFromDb, true));

    //delete newly added actions from the store that user doesn't want to save
    const addedActionsToDelete: Action[] = poiActions.filter(
      // only delete actions that don't exist in the db
      (action) => poiActionsFromDb.findIndex((actionDb) => actionDb.uuid === action.uuid) === -1
    );
    dispatch(deleteActionsByUuid(addedActionsToDelete.map((a) => a.uuid)));
  } else {
    // if selected poi isn't in the db, delete it from the store
    dispatch(thunkObliteratePoi({ poiUuid: poi.uuid }));
  }

  dispatch(setPoiEditMode({ poiUuid: poi.uuid, editMode: false }));
  //if we're in the middle of a map action, cancel it
  dispatch(thunkCancelMarkerMapDirective({ uuid: poi.uuid }));
});

export const thunkDeletePoi = appCreateAsyncThunk<{
  poi: POI;
}>("poiDelete", async ({ poi }, { dispatch, getState }) => {
  const selectedMissionId = getState().mission.mission?.id;
  const poiActions = getState().action.actions.filter((action) => action.poiUuid === poi.uuid);
  const poiFromDb = getState().poi.poisFromDb.find((poiFromDb) => poiFromDb.uuid === poi.uuid);

  // if the selected poi is in poisFromDb then delete it from the db
  if (poiFromDb) {
    // delete actions from the db via internal api call
    const actionUuidsToDelete = poiActions.map((a) => a.uuid);
    if (actionUuidsToDelete.length > 0) {
      await dispatch(thunkDeleteActionFromDbAndStore({ uuids: actionUuidsToDelete }));
    }

    // delete the POI from the DB via internal API call
    const deleteResponse = await httpClient_poi.deletePOIs([poi.uuid]);
    if (deleteResponse.status === "success") {
      // remove the corresponding POI from the store
      dispatch(deletePoiByUuid(poi.uuid));
      dispatch(setSelectedPoiUuid(null));

      // get fresh copy of POIs from DB
      const poiData = await httpClient_poi.getPOIs(selectedMissionId);
      if (poiData.data) {
        dispatch(setPoisFromDb(poiData.data));
      }
    } else {
      console.error("Error deleting POI: " + deleteResponse.message);
    }
  } else {
    // if the selected poi is not in poisFromDb then delete it from the store
    dispatch(deletePoiByUuid(poi.uuid));
    dispatch(setSelectedPoiUuid(null));
    dispatch(deleteActionsByUuid(poiActions.map((a) => a.uuid)));
  }

  dispatch(setPoiEditMode({ poiUuid: poi.uuid, editMode: false }));
  //if we're in the middle of a map action, cancel it
  dispatch(thunkCancelMarkerMapDirective({ uuid: poi.uuid }));

  // close right panel
  dispatch(thunkSetRightPanelIsOpenIfAuto(false));
});

export const thunkCreatePoi = appCreateAsyncThunk<void>(
  "poiCreate",
  async (_, { dispatch, getState }) => {
    const randomName = generateUniqueName({
      dictName: "animals",
      existingNames: getState().poi.pois.map((item: POI) => item.name),
    });

    const blankPoi = generateBlankPoi({
      missionId: getState().mission.mission?.id,
      name: randomName,
    });
    dispatch(thunkSaveNewPoi({ poi: blankPoi }));
  }
);

export const thunkDuplicatePoi = appCreateAsyncThunk<{ poi: POI }>(
  "poiDuplicate",
  async ({ poi }, { dispatch, getState }) => {
    if (!poi) return;
    //duplicate poi
    const newPoi: POI = cloneDeep(poi);
    newPoi.uuid = uuidv4();
    newPoi.updatedAt = null;
    newPoi.createdAt = roundDateToSecond(getAccurateNow()).toISOString();
    newPoi.name = makeUniqueStringCopy(
      poi.name,
      getState().poi.pois.map((item) => item.name)
    );
    newPoi.actionOrderUuids = [];
    dispatch(thunkSaveNewPoi({ poi: newPoi }));

    //duplicate actions, in order
    const poiActions = getState()
      .action.actions.filter((action) => action.poiUuid === poi?.uuid)
      .sort(
        (a, b) =>
          poi.actionOrderUuids.findIndex((o) => o === a.uuid) -
          poi.actionOrderUuids.findIndex((o) => o === b.uuid)
      );
    await dispatch(
      thunkDuplicateActions({
        actions: poiActions,
        poiUuid: newPoi.uuid,
        promotingFromPoi: false,
      })
    );
  }
);
