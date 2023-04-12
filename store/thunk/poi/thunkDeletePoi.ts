import { deletePoi, setPoiEditMode, setPoisFromDb, setSelectedPoiUuid } from "store/poi";
import * as InternalAPI from "http-client/internal-api";
import * as httpClient_action from "http-client/action";
import { deleteActions, setActionsFromDb } from "store/action";
import { setRightPanelOpen } from "store/interface";
import appCreateAsyncThunk from "../thunkUtil";

export const thunkDeletePoi = appCreateAsyncThunk<{
  selectedPoi: POI;
  selectedPoiFromDb: POI;
  poiActions: Action[];
  selectedPoiUuid: string;
}>(
  "thunk/DeletePoi",
  async (
    { selectedPoi, selectedPoiFromDb, poiActions, selectedPoiUuid },
    { dispatch, getState }
  ) => {
    const selectedMissionId = getState().mission.mission?.id;

    // if the selected poi is in poisFromDb then delete it from the db
    if (selectedPoiFromDb) {
      // delete actions from the db via internal api call
      for (const actionToDelete of poiActions) {
        const actionDeleteResponse: WrappedResponse<number> = await httpClient_action.deleteAction(
          actionToDelete.uuid
        );
        if (actionDeleteResponse.status !== "success") {
          throw new Error("Error deleting actions for poi " + actionDeleteResponse.message);
        }
      }
      // delete actions from the store
      dispatch(deleteActions(poiActions));
      // update store copy of the db with a fresh copy of actions for this mission from the db
      const actionData = await httpClient_action.getActions({ missionId: selectedMissionId });
      if (actionData.data) {
        dispatch(setActionsFromDb(actionData.data));
      }

      // delete the POI from the DB via internal API call
      const deleteResponse = await InternalAPI.deletePOI(selectedPoi.uuid);
      if (deleteResponse.status === "success") {
        // remove the corresponding POI from the store
        dispatch(deletePoi(selectedPoi));
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
      dispatch(deletePoi(selectedPoi));
      dispatch(setSelectedPoiUuid(null));
      dispatch(deleteActions(poiActions));
    }

    dispatch(setPoiEditMode({ poiUuid: selectedPoiUuid, editMode: false }));
    // close right panel
    dispatch(setRightPanelOpen(false));
  }
);
