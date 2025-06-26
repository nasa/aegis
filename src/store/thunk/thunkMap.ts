import { updateMapDirective } from "store/map";
import appCreateAsyncThunk from "./thunkUtil";
import { setBottomSectionSelected, setSectionSelected } from "store/interface";
import { setSelectedPoiUuid } from "store/poi";
import { setSelectedStationUuid } from "store/station";
import { thunkSetBottomPanelIsOpenIfAuto, thunkSetRightPanelIsOpenIfAuto } from "./thunkInterface";
import { thunkSelectEVASequenceItem } from "./crossThunk";
import { setSelectedPosEntryUuid } from "store/rex";
import { setSelectedMeasurementUuid } from "store/measure";
import { setSelectedEvaSequenceItemUuid } from "store/eva";

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

/**
 * Handle map onclick for markers
 */
export const thunkMarkerOnClick = appCreateAsyncThunk<{
  markerUuid: string;
  mapItemType: MapItemType;
}>("thunkMarkerOnClick", async ({ markerUuid, mapItemType }, { dispatch, getState }) => {
  if (mapItemType === "station") {
    const runningRex = getState().rex.rexes.find((r) => r.isRunning);
    if (runningRex && getState().interface.sectionSelectedLabel === "evas") {
      const rexEvaStationUuids = getState()
        .eva.evas.find((e) => e.uuid === runningRex.evaUuid)
        ?.sequence.filter((s) => s.type === "station")
        .map((s) => s.uuid);
      if (rexEvaStationUuids.includes(markerUuid)) {
        // selected a station in the running rex
        dispatch(setSelectedEvaSequenceItemUuid(markerUuid));
        dispatch(setSelectedStationUuid(markerUuid));
      } else {
        // selected a station not included in the running rex
        dispatch(setSectionSelected("station"));
        dispatch(setSelectedStationUuid(markerUuid));
        dispatch(thunkSetRightPanelIsOpenIfAuto(true));
      }
    } else {
      // no rex running
      dispatch(setSectionSelected("station"));
      dispatch(setSelectedStationUuid(markerUuid));
      dispatch(thunkSetRightPanelIsOpenIfAuto(true));
    }
  } else if (mapItemType === "poi") {
    dispatch(setSectionSelected("poi"));
    dispatch(setSelectedPoiUuid(markerUuid));
    dispatch(thunkSetRightPanelIsOpenIfAuto(true));
  }
});

/**
 * Handle map onclick for polylines
 */
export const thunkPolylineOnClick = appCreateAsyncThunk<{
  polylineUuid: string;
  mapItemType: MapItemType;
}>("thunkPolylineOnClick", async ({ polylineUuid, mapItemType }, { dispatch, getState }) => {
  if (mapItemType === "traverse") {
    // do not go to the traverse section if this is a traverse in a running rex
    const runningRex = getState().rex.rexes.find((r) => r.isRunning);
    if (runningRex && getState().interface.sectionSelectedLabel === "evas") {
      const rexEvaTraverseUuids = getState()
        .eva.evas.find((e) => e.uuid === runningRex.evaUuid)
        ?.sequence.filter((s) => s.type === "traverse")
        .map((s) => s.uuid);
      if (rexEvaTraverseUuids.includes(polylineUuid)) {
        // selected a traverse in the running rex
        dispatch(thunkSelectEVASequenceItem({ sequenceItemUuid: polylineUuid }));
      } else {
        // selected a traverse not included in the running rex
        dispatch(setSectionSelected("evas"));
        dispatch(thunkSelectEVASequenceItem({ sequenceItemUuid: polylineUuid }));
        dispatch(setSelectedPosEntryUuid(null));
      }
    } else {
      // no rex running
      dispatch(setSectionSelected("evas"));
      dispatch(thunkSelectEVASequenceItem({ sequenceItemUuid: polylineUuid }));
      dispatch(setSelectedPosEntryUuid(null));
    }
  } else if (mapItemType === "measurement") {
    dispatch(thunkSetBottomPanelIsOpenIfAuto(true));
    dispatch(setBottomSectionSelected("measure"));
    dispatch(setSelectedMeasurementUuid(polylineUuid));
  }
});
