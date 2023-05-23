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
