import { deletePoiByUuid, setPoiCalculatedFields, upsertPoiFromDb } from "store/poi";
import appCreateAsyncThunk from "./thunkUtil";
import { thunkGetElevation } from "./thunkElevation";
import * as InternalAPI from "http-client/poi";
import * as httpClient_action from "http-client/action";
import { upsertActions, deleteActionsByUuid, setActionsFromDb } from "store/action";
import { obliteratePoi, saveNewPoi } from "store/cross-slice";
import { setPoiEditMode, setPoisFromDb, setSelectedPoiUuid, upsertPoi } from "store/poi";
import { setRightPanelOpen } from "store/interface";
import { generateUniqueName } from "utils/names/unique-name";
import { v4 as uuidv4 } from "uuid";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import { thunkCancelMarkerMapDirective } from "./thunkMap";
import _ from "lodash";
import { thunkDuplicateAction, thunkSaveActions } from "./thunkAction";
import { roundDateToSecond } from "utils/formatting";
import { isModified } from "utils/component-helpers";

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
        (storeAction) => storeAction.poiUuid === poi.uuid && storeAction.enabled
      );

      //calculate total time
      let totalDurationLower = 0;
      let totalDurationUpper = 0;
      let totalEv1DurationLower = 0;
      let totalEv1DurationUpper = 0;
      let totalEv2DurationLower = 0;
      let totalEv2DurationUpper = 0;
      let totalUnassignedDurationLower = 0;
      let totalUnassignedDurationUpper = 0;
      let totalDwellTimeLower = 0;
      let totalDwellTimeUpper = 0;
      let actionCount = 0;
      poiActions.forEach((action) => {
        totalDurationLower += action.durationLower;
        totalDurationUpper += action.durationUpper;
        if (action.crewAssigned && action.crewAssigned.includes("EV1")) {
          totalEv1DurationLower += action.durationLower;
          totalEv1DurationUpper += action.durationUpper;
        }
        if (action.crewAssigned && action.crewAssigned.includes("EV2")) {
          totalEv2DurationLower += action.durationLower;
          totalEv2DurationUpper += action.durationUpper;
        }
        if (!action.crewAssigned || action.crewAssigned.length === 0) {
          totalUnassignedDurationLower += action.durationLower;
          totalUnassignedDurationUpper += action.durationUpper;
        }
        totalDwellTimeLower =
          totalEv1DurationLower > totalEv2DurationLower
            ? totalEv1DurationLower
            : totalEv2DurationLower;

        totalDwellTimeUpper =
          totalEv1DurationUpper > totalEv2DurationUpper
            ? totalEv1DurationUpper
            : totalEv2DurationUpper;
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
        totalEv1Time: {
          durationLower: totalEv1DurationLower,
          durationUpper: totalEv1DurationUpper,
        },
        totalEv2Time: {
          durationLower: totalEv2DurationLower,
          durationUpper: totalEv2DurationUpper,
        },
        totalUnassignedTime: {
          durationLower: totalUnassignedDurationLower,
          durationUpper: totalUnassignedDurationUpper,
        },
        totalDwellTime: {
          durationLower: totalDwellTimeLower,
          durationUpper: totalDwellTimeUpper,
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
  const poiUpsertResponse = await InternalAPI.upsertPOI(
    {
      ...poi,
      updatedAt: roundDateToSecond(new Date()).toISOString(),
    },
    getState().interface.socketStatus.socketId
  );

  if (poiUpsertResponse.status === "success") {
    // upsert the changed POI to the store
    dispatch(upsertPoi(poiUpsertResponse.data, true));
    // update the POI in the store with a  fresh copy of POIs from DB
    dispatch(upsertPoiFromDb(poiUpsertResponse.data));
  } else {
    throw new Error("Error upserting POI: " + poiUpsertResponse.message);
  }

  // find out if the actions in this poi have been modified and need to be persisted
  const actionsModified = isModified(poiActions, poiActionsFromDb);
  if (actionsModified) {
    dispatch(
      thunkSaveActions({ actions: poiActions, actionsFromDb: poiActionsFromDb, poiUuid: poi.uuid })
    );
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
    const deleteResponse = await InternalAPI.deletePOI(
      poi.uuid,
      missionId,
      getState().interface.socketStatus.socketId
    );
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
      ownerId: null,
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
      updatedAt: null,
      createdAt: roundDateToSecond(new Date()).toISOString(),
    };
    dispatch(saveNewPoi(blankPoi));
  }
);

export const thunkDuplicatePoi = appCreateAsyncThunk<{ poi: POI }>(
  "poiDuplicate",
  async ({ poi }, { dispatch, getState }) => {
    if (!poi) return;
    //duplicate poi
    const newPoi: POI = _.cloneDeep(poi);
    newPoi.uuid = uuidv4();
    newPoi.updatedAt = null;
    newPoi.createdAt = roundDateToSecond(new Date()).toISOString();
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
          newActionOrderUuids.push(thunkRes.payload as string);
        }
      }
    } else {
      for (const action of poiActions) {
        const thunkRes = await dispatch(
          thunkDuplicateAction({ action: action, poiUuid: newPoi.uuid })
        );
        if (thunkRes.payload) {
          newActionOrderUuids.push(thunkRes.payload as string);
        }
      }
    }
    newPoi.actionOrderUuids = newActionOrderUuids; //save new order
    dispatch(saveNewPoi(newPoi));
  }
);
