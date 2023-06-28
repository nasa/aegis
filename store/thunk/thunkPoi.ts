import {
  deletePoiByUuid,
  duplicatePoi,
  setPoiCalculatedFields,
  setSelectedPOIRightNavItem,
} from "store/poi";
import appCreateAsyncThunk from "./thunkUtil";
import { thunkGetElevation } from "./thunkElevation";
import * as InternalAPI from "http-client/poi";
import * as httpClient_action from "http-client/action";
import {
  deleteActionsFromDbByUuid,
  upsertActions,
  upsertActionsFromDb,
  deleteActionsByUuid,
  setActionsFromDb,
} from "store/action";
import deepEqual from "lodash/isEqual";
import { obliteratePoi } from "store/cross-slice";
import { setPoiEditMode, setPoisFromDb, setSelectedPoiUuid, upsertPoi } from "store/poi";
import { setRightPanelOpen } from "store/interface";
import { generateUniqueName } from "utils/unique-name";
import { v4 as uuidv4 } from "uuid";
import { makeUniqueStringCopy } from "utils/duplicate";
import { thunkCancelMarkerMapDirective } from "./thunkMap";
import _ from "lodash";
import { thunkDuplicateAction } from "./thunkAction";

export const thunkUpdatePoiLocation = appCreateAsyncThunk<{
  location: AEGISPoint;
  poiUuid: string;
}>("updatePoiLocation", async ({ location, poiUuid }, { dispatch, getState }) => {
  const elevation = await dispatch(
    thunkGetElevation({
      path: [location],
      pathSegmentDistances: [0],
      uuid: poiUuid,
    })
  );

  const poi = getState().poi.pois.find((s) => s.uuid === poiUuid);
  if (elevation.payload === false) {
    //gracefully reject?
  } else {
    //upsert location and elevation
    dispatch(upsertPoi({ ...poi, location, elevation: elevation.payload as number }));
  }
});

/**
 * Create reports for all pois
 */
export const thunkCreatePoiCalculatedFields = appCreateAsyncThunk<void>(
  "createPoiCalculatedFields",
  async (_, { dispatch, getState }) => {
    const pois = getState().poi.pois;
    const allCalculatedFields: PoiCalculatedFields[] = [];
    for (const poi of pois) {
      //get poi actions
      const poiActions = getState().action.actions.filter(
        (storeAction) => storeAction.poiUuid === poi.uuid
      );

      //calculate total time
      let totalDurationLower = 0;
      let totalDurationUpper = 0;
      let actionCount = 0;
      poiActions.forEach((action) => {
        totalDurationLower += action.durationLower;
        totalDurationUpper += action.durationUpper;
        actionCount++;
      });

      //generate report messages
      const newReportItems: ReportItem[] = [];

      // check if no actions
      if (poiActions.length === 0) {
        newReportItems.push({
          message: "POI has no actions",
          type: "warning",
        } as ReportItem);
      }

      const newCalculatedFields: PoiCalculatedFields = {
        uuid: poi.uuid,
        reportItems: newReportItems,
        totalTime: {
          durationLower: totalDurationLower,
          durationUpper: totalDurationUpper,
        },
        actionCount,
      };
      allCalculatedFields.push(newCalculatedFields);
    }
    dispatch(setPoiCalculatedFields({ calculatedFields: allCalculatedFields }));
  }
);

export const thunkSavePoi = appCreateAsyncThunk<{
  poi: POI;
}>("poiSave", async ({ poi }, { dispatch, getState }) => {
  const poiActions = getState().action.actions.filter((action) => action.poiUuid === poi.uuid);
  const poiActionsFromDb = getState().action.actionsFromDb.filter(
    (action) => action.poiUuid === poi.uuid
  );

  //save poi to db
  const poiUpsertResponse = await InternalAPI.upsertPOI(poi);

  if (poiUpsertResponse.status === "success") {
    // upsert the changed POI to the store
    dispatch(upsertPoi(poiUpsertResponse.data));
    // update the POI in the store with a  fresh copy of POIs from DB
    const poiData = await InternalAPI.getPOIs(getState().mission.mission?.id);
    if (poiData.data) {
      dispatch(setPoisFromDb(poiData.data));
    }
  } else {
    throw new Error("Error upserting POI: " + poiUpsertResponse.message);
  }

  // find out if the actions in this poi have been modified and need to be persisted
  const actionsModified = !deepEqual(poiActions, poiActionsFromDb);
  if (actionsModified) {
    //upsert Actions to db
    const upsertedPoiActions: Action[] = [];
    for (const actionToUpsert of poiActions) {
      const actionUpsertResponse = await httpClient_action.upsertAction(actionToUpsert);
      if (actionUpsertResponse.status !== "success") {
        throw new Error("Error upserting poi actions " + actionUpsertResponse.message);
      } else {
        upsertedPoiActions.push(actionUpsertResponse.data);
      }
    }
    // upsert the changed Action (with new updated dates) to the store
    dispatch(upsertActions(upsertedPoiActions));

    // clear the store copy of the db
    dispatch(deleteActionsFromDbByUuid(poiActionsFromDb.map((a) => a.uuid)));
    // filter out deleted actions using local state
    const deletedStationActions: Action[] = poiActionsFromDb.filter((actionDb) => {
      const found = poiActions.some((poiAction) => {
        return poiAction.uuid === actionDb.uuid;
      });
      return !found;
    });
    // take array of deleted actions and delete them in the db
    for (const deletedAction of deletedStationActions) {
      const actionDeleteResponse = await httpClient_action.deleteAction(
        deletedAction.uuid,
        getState().mission.mission.id
      );
      if (actionDeleteResponse.status !== "success") {
        throw new Error("Error deleting poi actions " + actionDeleteResponse.message);
      }
    }

    // update the store copy of the db with a fresh copy from the DB
    const actionData = await httpClient_action.getActions({
      missionId: getState().mission.mission?.id,
      poiUuid: poi.uuid,
    });
    if (actionData.data?.length > 0) {
      dispatch(upsertActionsFromDb(actionData.data));
    }
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
    dispatch(upsertPoi(poiFromDb));
    dispatch(upsertActions(poiActionsFromDb));

    //delete newly added actions that user doesn't want to save
    const addedActionsToDelete: Action[] = poiActions.filter(
      // only delete actions that don't exist in the db
      (action) => poiActionsFromDb.findIndex((actionDb) => actionDb.uuid === action.uuid) === -1
    );
    dispatch(deleteActionsByUuid(addedActionsToDelete.map((a) => a.uuid)));
  } else {
    // if selected poi isn't in the db, delete it from the store
    dispatch(obliteratePoi({ poiUuid: poi.uuid }));
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
    const missionId = getState().mission.mission.id;
    // delete actions from the db via internal api call
    for (const actionToDelete of poiActions) {
      const actionDeleteResponse: WrappedResponse<number> = await httpClient_action.deleteAction(
        actionToDelete.uuid,
        missionId
      );
      if (actionDeleteResponse.status !== "success") {
        throw new Error("Error deleting actions for poi " + actionDeleteResponse.message);
      }
    }
    // delete actions from the store
    dispatch(deleteActionsByUuid(poiActions.map((a) => a.uuid)));
    // update store copy of the db with a fresh copy of actions for this mission from the db
    const actionData = await httpClient_action.getActions({ missionId: selectedMissionId });
    if (actionData.data) {
      dispatch(setActionsFromDb(actionData.data));
    }

    // delete the POI from the DB via internal API call
    const deleteResponse = await InternalAPI.deletePOI(poi.uuid, missionId);
    if (deleteResponse.status === "success") {
      // remove the corresponding POI from the store
      dispatch(deletePoiByUuid(poi.uuid));
      dispatch(setSelectedPoiUuid(null));

      // get fresh copy of POIs from DB
      const poiData = await InternalAPI.getPOIs(selectedMissionId);
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
  dispatch(setRightPanelOpen(false));
});

export const thunkCreatePoi = appCreateAsyncThunk<void>(
  "poiCreate",
  async (_, { dispatch, getState }) => {
    const randomName = generateUniqueName({
      dictName: "animals",
      existingNames: getState().poi.pois.map((item: POI) => item.name),
    });

    const blankPoi: POI = {
      ownerId: getState().user.ironSessionData?.user.id,
      missionId: getState().mission.mission?.id,
      uuid: uuidv4(),
      name: randomName,
      description: "",
      priorityOverride: 0,
      radius: 5,
      location: null,
      elevation: null,
      icon: "1F534",
      tags: [],
      status: "Candidate",
    };
    dispatch(upsertPoi(blankPoi));
    // turn on edit mode for the new POI
    dispatch(setPoiEditMode({ poiUuid: blankPoi.uuid, editMode: true }));
    // select the newly created POI
    dispatch(setSelectedPoiUuid(blankPoi.uuid));
    // open right panel
    dispatch(setRightPanelOpen(true));
    // set the selected tab to the POI's info tab
    dispatch(setSelectedPOIRightNavItem("info_panel"));
  }
);

export const thunkDuplicatePoi = appCreateAsyncThunk<{ poi: POI }>(
  "poiDuplicate",
  async ({ poi }, { dispatch, getState }) => {
    if (!poi) return;
    //duplicate poi
    const newPoi: POI = _.cloneDeep(poi);
    newPoi.uuid = uuidv4();
    newPoi.name = makeUniqueStringCopy(
      poi.name,
      getState().poi.pois.map((item) => item.name)
    );

    //duplicate actions
    const poiActions = getState().action.actions.filter((action) => action.poiUuid === poi?.uuid);

    const newActionOrderUuids = [];
    //if there's an order, preserve it.
    if (poi.actionOrderUuids) {
      for (const actionUuid of poi.actionOrderUuids) {
        const action = poiActions.find((a) => a.uuid === actionUuid);
        const thunkRes = await dispatch(
          thunkDuplicateAction({ action: action, poiUuid: newPoi.uuid })
        );
        if (thunkRes.payload) {
          newActionOrderUuids.push(thunkRes.payload as String);
        }
      }
    } else {
      for (const action of poiActions) {
        const thunkRes = await dispatch(
          thunkDuplicateAction({ action: action, poiUuid: newPoi.uuid })
        );
        if (thunkRes.payload) {
          newActionOrderUuids.push(thunkRes.payload as String);
        }
      }
    }
    newPoi.actionOrderUuids = newActionOrderUuids; //save new order
    dispatch(duplicatePoi(newPoi));

    // open right panel
    dispatch(setRightPanelOpen(true));
    // set the selected tab to the POI's info tab
    dispatch(setSelectedPOIRightNavItem("info_panel"));
  }
);
