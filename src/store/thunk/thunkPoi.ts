import {
  deletePoisByUuid,
  deletePoisFromDbByUuid,
  selectPoi,
  upsertPoiByField,
  upsertPoisFromDb,
} from "store/poi";
import appCreateAsyncThunk from "./thunkUtil";
import { thunkGetElevation } from "./thunkElevation";
import * as httpClient_poi from "http-client/poi";
import { upsertActions, deleteActionsByUuid } from "store/action";
import { thunkDeletePoiAndActionsFromStore } from "./crossThunk";
import { setPoiEditMode, setSelectedPoiUuid, upsertPois } from "store/poi";
import { generateUniqueName } from "utils/names/unique-name";
import { v4 as uuidv4 } from "uuid";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import { thunkCancelMarkerMapDirective } from "./thunkMap";
import cloneDeep from "lodash/cloneDeep";
import {
  thunkDeleteActionsFromDbAndStore,
  thunkDuplicateActions,
  thunkSaveActions,
} from "./thunkAction";
import { getAccurateNow } from "utils/formatting";
import { isModified } from "utils/component-helpers";
import { thunkSetRightPanelIsOpenIfAuto } from "./thunkInterface";
import { generateBlankPoi } from "store/storeUtils/poi";
import { thunkAddRemoveFolderItem } from "./thunkFolder";

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
    dispatch(upsertPoiByField(poi.uuid, "location", location, false));
  } else {
    //upsert location and elevation
    dispatch(upsertPois([{ ...poi, location, elevation: elevationRes.payload as number }]));
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
  const updatedPoi = {
    ...poi,
    updatedAt: getAccurateNow().toISOString(),
  };
  const poiUpsertResponse = await httpClient_poi.upsertPOIs([updatedPoi]);

  if (poiUpsertResponse.status !== "success") {
    throw new Error("Error upserting POI: " + poiUpsertResponse.message);
  }
  // upsert the changed POI to the store
  dispatch(upsertPois([updatedPoi], true));
  // update the POI in the store with a fresh copy of POIs from DB
  dispatch(upsertPoisFromDb([updatedPoi]));

  // find out if the actions in this poi have been modified and need to be persisted
  const actionsModified = isModified(poiActions, poiActionsFromDb);
  if (actionsModified) {
    await dispatch(thunkSaveActions({ actions: poiActions, actionsFromDb: poiActionsFromDb }));
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
    dispatch(upsertPois([poiFromDb], true));
    dispatch(upsertActions(poiActionsFromDb, true));

    //delete newly added actions from the store that user doesn't want to save
    const addedActionsToDelete: Action[] = poiActions.filter(
      // only delete actions that don't exist in the db
      (action) => poiActionsFromDb.findIndex((actionDb) => actionDb.uuid === action.uuid) === -1
    );
    dispatch(deleteActionsByUuid(addedActionsToDelete.map((a) => a.uuid)));
  } else {
    // if selected poi isn't in the db, delete it from the store
    await dispatch(thunkDeletePoiAndActionsFromStore({ poiUuid: poi.uuid }));
    dispatch(
      thunkAddRemoveFolderItem({
        itemUuid: poi.uuid,
        folderUuid: null,
      })
    );
  }

  dispatch(setPoiEditMode({ poiUuid: poi.uuid, editMode: false }));
  //if we're in the middle of a map action, cancel it
  dispatch(thunkCancelMarkerMapDirective({ uuid: poi.uuid }));
});

export const thunkDeletePoi = appCreateAsyncThunk<{
  poi: POI;
}>("poiDelete", async ({ poi }, { dispatch, getState }) => {
  const poiActions = getState().action.actions.filter((action) => action.poiUuid === poi.uuid);
  const poiFromDb = getState().poi.poisFromDb.find((poiFromDb) => poiFromDb.uuid === poi.uuid);

  // if the selected poi is in poisFromDb then delete it from the db
  if (poiFromDb) {
    // delete actions from the db via internal api call
    const actionUuidsToDelete = poiActions.map((a) => a.uuid);
    if (actionUuidsToDelete.length > 0) {
      await dispatch(thunkDeleteActionsFromDbAndStore({ uuids: actionUuidsToDelete }));
    }

    // delete the POI from the DB via internal API call
    const deleteResponse = await httpClient_poi.deletePOIs([poi.uuid]);
    if (deleteResponse.status !== "success") {
      throw new Error("Error deleting POI: " + deleteResponse.message);
    }
    // remove the corresponding POI from the store
    dispatch(deletePoisByUuid([poi.uuid]));
    dispatch(deletePoisFromDbByUuid([poi.uuid]));
    dispatch(setSelectedPoiUuid(null));
  } else {
    // if the selected poi is not in poisFromDb then delete it from the store
    dispatch(deletePoisByUuid([poi.uuid]));
    dispatch(setSelectedPoiUuid(null));
    dispatch(deleteActionsByUuid(poiActions.map((a) => a.uuid)));
  }
  dispatch(
    thunkAddRemoveFolderItem({
      itemUuid: poi.uuid,
      folderUuid: null,
    })
  );
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
    dispatch(upsertPois([blankPoi]));
    dispatch(selectPoi({ uuid: blankPoi.uuid }));
    dispatch(setPoiEditMode({ poiUuid: blankPoi.uuid, editMode: true }));
    dispatch(thunkSetRightPanelIsOpenIfAuto(true));
  }
);

export const thunkDuplicatePoi = appCreateAsyncThunk<{ poiUuid: string }>(
  "poiDuplicate",
  async ({ poiUuid }, { dispatch, getState }) => {
    if (!poiUuid) return;

    const poi = getState().poi.pois.find((p) => p.uuid === poiUuid);
    //duplicate poi
    const newPoi: POI = cloneDeep(poi);
    newPoi.uuid = uuidv4();
    newPoi.updatedAt = null;
    newPoi.createdAt = getAccurateNow().toISOString();
    newPoi.name = makeUniqueStringCopy(
      poi.name,
      getState().poi.pois.map((item) => item.name)
    );
    newPoi.actionOrderUuids = [];

    // upsert new poi and persist to the db
    dispatch(upsertPois([newPoi]));
    dispatch(upsertPoisFromDb([newPoi]));
    const upsertPoisResponse = await httpClient_poi.upsertPOIs([newPoi]);
    if (upsertPoisResponse.status !== "success") {
      throw new Error("Error upserting POI: " + upsertPoisResponse.message);
    }

    dispatch(selectPoi({ uuid: newPoi.uuid }));
    dispatch(thunkSetRightPanelIsOpenIfAuto(true));

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
        preserveRefUuid: false,
        saveToDb: true,
      })
    );
  }
);
