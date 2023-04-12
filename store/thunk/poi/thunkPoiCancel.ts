import { deletePoi, setPoiEditMode, setSelectedPoiUuid, upsertPoi } from "store/poi";
import appCreateAsyncThunk from "../thunkUtil";
import { deleteActions, upsertActions } from "store/action";
import { updateMapDirective } from "store/map";
import { setRightPanelOpen } from "store/interface";

export const thunkPoiCancel = appCreateAsyncThunk<{
  selectedPoi: POI;
  selectedPoiFromDb: POI;
  poiActions: Action[];
  poiActionsFromDb: Action[];
  selectedPoiUuid: string;
}>(
  "thunk/PoiCancel",
  async (
    { selectedPoi, selectedPoiFromDb, poiActions, poiActionsFromDb, selectedPoiUuid },
    { dispatch, getState }
  ) => {
    const mapDirective = getState().map.mapDirective;
    const thisMapDirective = mapDirective?.uuid === selectedPoi?.uuid ? mapDirective : null;

    if (selectedPoiFromDb) {
      // if selected poi is in the db, replace it with the one from the db (undoing any changes)
      dispatch(upsertPoi(selectedPoiFromDb));
      dispatch(upsertActions(poiActionsFromDb));

      //delete newly added actions that user doesn't want to save
      const addedActionsToDelete: Action[] = poiActions.filter(
        // only delete actions that don't exist in the db
        (action) => poiActionsFromDb.findIndex((actionDb) => actionDb.uuid === action.uuid) === -1
      );
      dispatch(deleteActions(addedActionsToDelete));
    } else {
      // if selected poi isn't in the db, delete it from the store
      dispatch(deletePoi(selectedPoi));
      dispatch(setSelectedPoiUuid(null));
      dispatch(deleteActions(poiActions));
      dispatch(setRightPanelOpen(false));
    }
    dispatch(setPoiEditMode({ poiUuid: selectedPoiUuid, editMode: false }));

    // if there's an active create or edit action, cancel it
    if (thisMapDirective?.mapAction === "createMarker") {
      dispatch(
        updateMapDirective({
          ...thisMapDirective,
          mapAction: "cancelCreateMarker",
        })
      );
    } else if (thisMapDirective?.mapAction === "editMarker") {
      dispatch(
        updateMapDirective({
          ...thisMapDirective,
          mapAction: "cancelEditMarker",
        })
      );
    }
  }
);
