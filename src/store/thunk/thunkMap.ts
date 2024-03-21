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

// TODO: this approach might work once map directive is a queue
// export const thunkCancelAnyActiveMapAction = appCreateAsyncThunk<void, void, false>(
//   "cancelAnyActiveMapAction",
//   async (__, { dispatch, getState }) => {
//     const mapDirective = getState().map.mapDirective;

//     if (mapDirective && mapDirective.mapAction !== null) {
//       // cancel the active map action
//       if (mapDirective.mapAction === "createMarker") {
//         dispatch(
//           updateMapDirective({
//             ...mapDirective,
//             mapAction: "cancelCreateMarker",
//           })
//         );
//       } else if (mapDirective.mapAction === "editMarker") {
//         dispatch(
//           updateMapDirective({
//             ...mapDirective,
//             mapAction: "cancelEditMarker",
//           })
//         );
//       } else if (mapDirective.mapAction === "editPolyline") {
//         dispatch(
//           updateMapDirective({
//             ...mapDirective,
//             mapAction:
//               mapDirective.mapItemType === "measurement"
//                 ? "saveEditPolyline"
//                 : "cancelEditPolyline",
//           })
//         );
//       }
//     }
//   }
// );

export const thunkUpdateMapDirective = appCreateAsyncThunk<MapDirective, void, false>(
  "updateMapDirective",
  async (mapDirective, { dispatch }) => {
    //TODO: turn mapDirective into a queue so that cancel actions can happen while other actions are underway
    // await dispatch(thunkCancelAnyActiveMapAction());
    setTimeout(() => {
      dispatch(updateMapDirective(mapDirective));
    }, 200);
  }
);
