import { updateMapDirective } from "store/map";
import appCreateAsyncThunk from "./thunkUtil";

export const thunkCancelMarkerMapDirective = appCreateAsyncThunk<{ uuid: string }>(
  "mapCancelMarkerMapDirective",
  async ({ uuid }, { dispatch, getState }) => {
    const thisMapDirective =
      getState().map.mapDirective?.uuid === uuid ? getState().map.mapDirective : null;

    if (!thisMapDirective) return;

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

/**
 * Thunk used to verify map action. This was created so that components do not
 * have to subscribe to the entire mapDirective state in the store and cause
 * un-necessary re-renders.
 *
 * If another mapAction is underway, fire an alert and return false
 */
export const thunkVerifyNoActiveMapAction = appCreateAsyncThunk<void, boolean, false>(
  "verifyNoActiveMapAction",
  async (_, { getState }) => {
    const mapDirective = getState().map.mapDirective;

    if (mapDirective && mapDirective.mapAction !== null) {
      alert(
        "Another map action is underway. Please cancel or complete that map action before starting a new one."
      );
      return false;
    } else {
      return true;
    }
  }
);
