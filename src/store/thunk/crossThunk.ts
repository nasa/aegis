import appCreateAsyncThunk from "./thunkUtil";
import type { RootState } from "store";
import {
  evaSlice,
  upsertExpandedEvaUuids,
  setSelectedEvaRightNavItem,
  setSelectedEvaUuid,
} from "store/eva";
import { rexSlice } from "store/rex";
import { stationSlice } from "store/station";

import { obliterateState as actionObliterateState } from "store/action";
import { obliterateState as evaObliterateState } from "store/eva";
import { obliterateState as hoverObliterateState } from "store/hover";
import { obliterateState as interfaceObliterateState, setSectionSelected } from "store/interface";
import { expandActions } from "store/action";
import { obliterateState as mapObliterateState } from "store/map";
import { obliterateState as missionObliterateState } from "store/mission";
import { obliterateState as poiObliterateState } from "store/poi";
import { getMissionDocHandle } from "client/automergeDocHandles";
import { obliterateState as presetObliterateState } from "store/preset";
import { obliterateState as rexObliterateState } from "store/rex";
import { obliterateState as stationObliterateState } from "store/station";
import { obliterateState as stmObliterateState } from "store/stm";
import { obliterateState as reportObliterateState } from "store/report";
import { obliterateState as traverseObliterateState } from "store/traverse";
import { obliterateState as measurementObliterateState } from "store/measure";
import { clientLogger } from "utils/logging/clientLogger";

export const thunkSelectEVASequenceItem = appCreateAsyncThunk<{
  sequenceItemUuid: string;
}>("cross/selectEVASequenceItem", async ({ sequenceItemUuid }, { dispatch, getState }) => {
  // Dispatch action to set the selected EVA sequence item UUID
  dispatch(evaSlice.actions.setSelectedEvaSequenceItemUuid(sequenceItemUuid));

  if (!sequenceItemUuid) return; // Exit if sequenceItemUuid is null

  const state = getState() as RootState;
  const selectedEva = getMissionDocHandle()?.doc()?.evas?.[state.eva.selectedEvaUuid];
  const sequenceItem = selectedEva?.sequence.find((seqItem) => seqItem.uuid === sequenceItemUuid);

  if (sequenceItem?.type === "station") {
    dispatch(stationSlice.actions.setSelectedStationUuid(sequenceItemUuid));
  }
});

// Dispatch actions to reset each slice to its initial state
// This does not reset ALL slices (ex: user and connection)
export const thunkObliterateMissionSpecificData = appCreateAsyncThunk<void>(
  "cross/obliterateMissionSpecificData",
  async (__, { dispatch }) => {
    dispatch(actionObliterateState());
    dispatch(evaObliterateState());
    dispatch(hoverObliterateState());
    dispatch(interfaceObliterateState());
    dispatch(mapObliterateState());
    dispatch(missionObliterateState());
    dispatch(poiObliterateState());
    dispatch(presetObliterateState());
    dispatch(rexObliterateState());
    dispatch(stationObliterateState());
    dispatch(stmObliterateState());
    dispatch(reportObliterateState());
    dispatch(traverseObliterateState());
    dispatch(measurementObliterateState());
  }
);

export const thunkSelectEvaAction = appCreateAsyncThunk<{
  evaRefUuid: string;
  actionRefUuid: string;
  rexUuid: string | null;
}>("cross/selectEvaAction", async ({ evaRefUuid, actionRefUuid, rexUuid }, { dispatch }) => {
  // Skip if either UUID is not provided
  if (!evaRefUuid || !actionRefUuid) return;

  // Validate UUIDs format (basic validation)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(evaRefUuid) || !uuidRegex.test(actionRefUuid)) {
    clientLogger.warning({
      logId: "deepLink",
      logValue: "Invalid UUID format provided for EVA or action",
    });
    return;
  }
  if (rexUuid && !uuidRegex.test(rexUuid)) {
    clientLogger.warning({
      logId: "deepLink",
      logValue: "Invalid UUID format provided for REX",
    });
    return;
  }

  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;
  const mission = missionDocHandle.doc();
  const allEvas = Object.values(mission?.evas ?? {});
  const allRexes = Object.values(mission?.rexes ?? {});

  // Validate EVA exists in store
  const evaExists = allEvas.some((eva) => eva.refUuid === evaRefUuid);
  if (!evaExists) {
    clientLogger.warning({
      logId: "deepLink",
      logValue: `EVA with refUUID ${evaRefUuid} not found`,
    });
    return;
  }
  // Validate action exists
  const actionExists = Object.values(mission?.actions ?? {}).some(
    (action) => action.refUuid === actionRefUuid
  );
  if (!actionExists) {
    clientLogger.warning({
      logId: "deepLink",
      logValue: `Action with refUUID ${actionRefUuid} not found`,
    });
    return;
  }
  // Validate REX exists if provided
  if (rexUuid) {
    const rexExists = allRexes.some((rex) => rex.uuid === rexUuid);
    if (!rexExists) {
      clientLogger.warning({
        logId: "deepLink",
        logValue: `REX with UUID ${rexUuid} not found`,
      });
      return;
    }
  }

  // Go to eva section
  dispatch(setSectionSelected("evas"));
  let eva: Eva = null;
  if (rexUuid) {
    const evaUuid = mission.rexes[rexUuid]?.evaUuid;
    eva = mission.evas[evaUuid];

    // Also select the rex
    dispatch(rexSlice.actions.setSelectedRexUuid(rexUuid));
    // Get the as-planned EVA to set the dropdown state
    const allRexEvaUuids = allRexes.map((rex) => rex.evaUuid);
    const asPlannedEva = allEvas.find(
      (e) => e.refUuid === evaRefUuid && !allRexEvaUuids.includes(e.uuid)
    );
    dispatch(
      evaSlice.actions.setEvaDropdownUIState({
        asPlannedEvaUuid: asPlannedEva?.uuid,
        dropdownEvaUuid: evaUuid,
      })
    );
    // Expand the as-planned eva
    dispatch(upsertExpandedEvaUuids([asPlannedEva.uuid]));
  } else {
    // Get as-planned eva
    const allRexEvaUuids = allRexes.map((rex) => rex.evaUuid);
    eva = allEvas.find((e) => e.refUuid === evaRefUuid && !allRexEvaUuids.includes(e.uuid));
    // Expand the eva
    dispatch(upsertExpandedEvaUuids([eva.uuid]));
  }
  // Select the eva
  dispatch(setSelectedEvaUuid(eva.uuid));

  // Get the action uuid by checking it against the eva's sequence items
  const sequenceItemUuids = eva.sequence.map((stationSeqItem) => stationSeqItem.uuid);
  const action = Object.values(mission?.actions ?? {}).find(
    (action) =>
      action.refUuid === actionRefUuid &&
      (sequenceItemUuids.includes(action.stationUuid) ||
        sequenceItemUuids.includes(action.traverseUuid))
  );
  // Select the action panel and expand the specific action
  dispatch(setSelectedEvaRightNavItem("actions_panel"));
  dispatch(expandActions([action.uuid]));
});
