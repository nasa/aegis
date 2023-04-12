import { setPoiEditMode, setPoisFromDb, upsertPoi } from "store/poi";
import appCreateAsyncThunk from "../thunkUtil";
import * as InternalAPI from "http-client/internal-api";
import * as httpClient_action from "http-client/action";
import { deleteActionsFromDb, upsertActions, upsertActionsFromDb } from "store/action";
import deepEqual from "lodash/isEqual";

export const thunkSavePoi = appCreateAsyncThunk<{
  selectedPoi: POI;
  poiActions: Action[];
  poiActionsFromDb: Action[];
  selectedPoiUuid: string;
}>(
  "thunk/PoiSave",
  async (
    { selectedPoi, poiActions, poiActionsFromDb, selectedPoiUuid },
    { dispatch, getState }
  ) => {
    const selectedMissionId = getState().mission.mission?.id;

    const poiUpsertResponse = await InternalAPI.setPOI(selectedPoi);

    if (poiUpsertResponse.status === "success") {
      // upsert the changed POI to the store
      dispatch(upsertPoi(poiUpsertResponse.data));
      // update the POI in the store with a  fresh copy of POIs from DB
      const poiData = await InternalAPI.getPOIs(selectedMissionId);
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
      dispatch(deleteActionsFromDb(poiActionsFromDb));
      // filter out deleted actions using local state
      const deletedStationActions: Action[] = poiActionsFromDb.filter((actionDb) => {
        const found = poiActions.some((poiAction) => {
          return poiAction.uuid === actionDb.uuid;
        });
        return !found;
      });
      // take array of deleted actions and delete them in the db
      for (const deletedAction of deletedStationActions) {
        const actionDeleteResponse = await httpClient_action.deleteAction(deletedAction.uuid);
        if (actionDeleteResponse.status !== "success") {
          throw new Error("Error deleting poi actions " + actionDeleteResponse.message);
        }
      }

      // update the store copy of the db with a fresh copy from the DB
      const actionData = await httpClient_action.getActions({
        poiUuid: selectedPoi.uuid,
      });
      if (actionData.data?.length > 0) {
        dispatch(upsertActionsFromDb(actionData.data));
      }
    }

    dispatch(setPoiEditMode({ poiUuid: selectedPoiUuid, editMode: false }));
  }
);
