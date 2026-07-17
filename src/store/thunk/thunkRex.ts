import appCreateAsyncThunk from "./thunkUtil";
import { setSelectedRexUuid, setSelectedPosEntryUuid } from "store/rex";

import { getMissionDocHandle } from "client/automergeDocHandles";
import {
  setEvaDropdownUIState,
  setSelectedEvaUuid,
  setOnlyShowRunningRex,
  setSelectedEvaSequenceItemUuid,
} from "store/eva";
import { thunkSetRightPanelIsOpenIfAuto } from "./thunkInterface";
import { setSectionSelected } from "store/interface";
import { setStationCircleUIStates } from "store/station";
import {
  applyCreateRexStage,
  applyDeleteRexStage,
  applyUpdateRexByField,
  applyUpsertRexEntryItem,
} from "operations/apply/apply-rex";
import { stageCreateRex, stageDeleteRex } from "operations/stage/stage-rex";
import { v4 as uuidv4 } from "uuid";
import { getAccurateNow } from "utils/formatting";
import cloneDeep from "lodash/cloneDeep";

/**
 * Creates a new rex via duplication and saves everything to automerge.
 * Returns the newly created eva uuid.
 */
export const thunkDocCreateRex = appCreateAsyncThunk<
  { asPlannedEvaUuid: string },
  string | null,
  false
>("rexCreate", async ({ asPlannedEvaUuid }, { getState, dispatch }) => {
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return null;
  const mission = missionDocHandle.doc();
  if (!mission) return null;

  // Step 1: Build the full REX creation stage from the doc
  const ownerId = getState().user?.appUser?.id ?? null;
  const rexStagedData = stageCreateRex(mission, { asPlannedEvaUuid, ownerId });
  if (!rexStagedData) {
    throw new Error(`Error creating Rexes. Cannot duplicate EVA ${asPlannedEvaUuid}`);
  }

  // Step 2: Apply the entire stage (REX + duplicated EVA tree) atomically
  missionDocHandle.change((m: Mission) => applyCreateRexStage(m, rexStagedData));

  // Step 3: UI side-effects
  dispatch(setSelectedRexUuid(rexStagedData.newRexUuid));
  dispatch(setSelectedEvaUuid(rexStagedData.evaStage.newEvaUuid));
  dispatch(setSelectedEvaSequenceItemUuid(null));
  dispatch(thunkSetRightPanelIsOpenIfAuto(true));
  dispatch(
    setEvaDropdownUIState({ asPlannedEvaUuid, dropdownEvaUuid: rexStagedData.evaStage.newEvaUuid })
  );

  // Initialize stationCirclesUIStates
  // Get all of the new stations staged data that was added
  const { stationStages, ingressStationStage, egressStationStage } = rexStagedData.evaStage;
  const allNewStationStages = [...stationStages];
  if (ingressStationStage) allNewStationStages.push(ingressStationStage);
  if (egressStationStage) allNewStationStages.push(egressStationStage);
  // Initialize the stationCirclesUIStates for each new station
  for (const stationStage of allNewStationStages) {
    const sourceCircleUIStates =
      cloneDeep(getState().station.stationCirclesUIStates[stationStage.oldStationUuid]) ?? {};
    dispatch(
      setStationCircleUIStates({
        stationUuid: stationStage.newStationUuid,
        circleUIStates: sourceCircleUIStates,
      })
    );
  }

  return rexStagedData.evaStage.newEvaUuid;
});

export const thunkDocDeleteRex = appCreateAsyncThunk<{ rexUuid: string }>(
  "rexDelete",
  async ({ rexUuid }, { dispatch, getState }) => {
    if (!rexUuid) return;
    const missionDocHandle = getMissionDocHandle();
    if (!missionDocHandle) return;
    const mission = missionDocHandle.doc();
    const rex = mission?.rexes?.[rexUuid];
    if (!rex) return;

    // Step 1: Build the full deletion stage from the doc
    if (rex.isRunning && getState().eva.showRunningRexOnly) {
      dispatch(setOnlyShowRunningRex(false));
    }
    const allRexEvasUuids = Object.values(mission?.rexes ?? {}).map((r) => r.evaUuid);
    const eva = mission?.evas?.[rex.evaUuid];
    const asPlannedEvaUuid = Object.values(mission?.evas ?? {}).find(
      (e) => e.refUuid === eva?.refUuid && !allRexEvasUuids.includes(e.uuid)
    )?.uuid;
    const stage = stageDeleteRex(mission, { rexUuid });

    // Step 2: Apply the entire deletion (REX + EVA tree) atomically
    if (stage) {
      missionDocHandle.change((m: Mission) => applyDeleteRexStage(m, stage));
    }

    // Step 3: UI side-effects
    dispatch(
      setEvaDropdownUIState({
        asPlannedEvaUuid: asPlannedEvaUuid,
        dropdownEvaUuid: null,
      })
    );
    dispatch(setSelectedEvaUuid(asPlannedEvaUuid));
    dispatch(setSelectedPosEntryUuid(null));
    dispatch(setSelectedRexUuid(null));
  }
);

export const thunkUIJumpToRunningRex = appCreateAsyncThunk<void>(
  "jumpToRunningRex",
  async (_, { dispatch }) => {
    // No Step 1/2: this thunk makes no .change() call.
    // Step 3: UI side-effects only — navigate to the running REX and update selection
    const runningRex = Object.values(getMissionDocHandle()?.doc()?.rexes ?? {}).find(
      (rex) => rex.isRunning
    );
    if (!runningRex) return;
    dispatch(setSectionSelected("evas"));
    dispatch(setSelectedPosEntryUuid(null));
    dispatch(setSelectedEvaSequenceItemUuid(null));
    dispatch(setOnlyShowRunningRex(true));
    dispatch(setSelectedEvaUuid(runningRex.evaUuid));
    dispatch(setSelectedRexUuid(runningRex.uuid));
  }
);

export const thunkDocAddRexStatusEntry = appCreateAsyncThunk<{
  entryType: "station" | "traverse" | "action" | "xgress";
  uuid: string;
  rexStatus: RexStatus;
}>("addRexStatusEntry", async ({ entryType, uuid, rexStatus }) => {
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;
  const doc = missionDocHandle.doc();
  if (!doc) return;
  // Step 1: Read the running REX and existing entry data from the doc.
  const runningRex = Object.values(doc.rexes ?? {}).find((rex) => rex.isRunning);
  if (!runningRex) return;

  // Step 2: Apply the entry update for the given entry type.
  if (entryType === "station") {
    missionDocHandle.change((m: Mission) =>
      applyUpsertRexEntryItem(m, {
        rexUuid: runningRex.uuid,
        mapField: "stationEntries",
        itemUuid: uuid,
        value: { rexStatus },
      })
    );
  } else if (entryType === "traverse") {
    missionDocHandle.change((m: Mission) =>
      applyUpsertRexEntryItem(m, {
        rexUuid: runningRex.uuid,
        mapField: "traverseEntries",
        itemUuid: uuid,
        value: { rexStatus },
      })
    );
  } else if (entryType === "action") {
    const existingEntry = runningRex.actionEntries?.[uuid];
    missionDocHandle.change((m: Mission) =>
      applyUpsertRexEntryItem(m, {
        rexUuid: runningRex.uuid,
        mapField: "actionEntries",
        itemUuid: uuid,
        value: existingEntry
          ? { ...existingEntry, rexStatus }
          : {
              rexStatus,
              mass: null,
              markerId: null,
              containerId: null,
              secondaryContainerId: null,
            },
      })
    );
  } else if (entryType === "xgress") {
    missionDocHandle.change((m: Mission) =>
      applyUpsertRexEntryItem(m, {
        rexUuid: runningRex.uuid,
        mapField: "xgressEntries",
        itemUuid: uuid,
        value: { rexStatus },
      })
    );
  }

  // No Step 3: this thunk has no UI side-effects of its own.
});

export const thunkDocAddRexActionMass = appCreateAsyncThunk<{ uuid: string; mass: number }>(
  "addRexActionMass",
  async ({ uuid, mass }) => {
    const missionDocHandle = getMissionDocHandle();
    if (!missionDocHandle) return;
    const doc = missionDocHandle.doc();
    if (!doc) return;
    // Step 1: Read the running REX and the existing action entry from the doc.
    const runningRex = Object.values(doc.rexes ?? {}).find((rex) => rex.isRunning);
    if (!runningRex) return;
    const existingEntry = runningRex.actionEntries?.[uuid];

    // Step 2: Apply the mass update to the action entry.
    missionDocHandle.change((m: Mission) =>
      applyUpsertRexEntryItem(m, {
        rexUuid: runningRex.uuid,
        mapField: "actionEntries",
        itemUuid: uuid,
        value: existingEntry
          ? { ...existingEntry, mass }
          : {
              rexStatus: null,
              mass,
              markerId: null,
              containerId: null,
              secondaryContainerId: null,
            },
      })
    );

    // No Step 3: this thunk has no UI side-effects of its own.
  }
);

export const thunkDocAddCollectionId = appCreateAsyncThunk<{
  uuid: string;
  id: string;
  collectionType: "marker" | "container" | "secondaryContainer";
}>("addCollectionId", async ({ uuid, id, collectionType }) => {
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;
  const doc = missionDocHandle.doc();
  if (!doc) return;
  // Step 1: Read the running REX and the existing action entry from the doc.
  const runningRex = Object.values(doc.rexes ?? {}).find((rex) => rex.isRunning);
  if (!runningRex) return;
  const existingEntry = runningRex.actionEntries?.[uuid];

  // Step 2: Apply the collection ID update to the action entry.
  missionDocHandle.change((m: Mission) =>
    applyUpsertRexEntryItem(m, {
      rexUuid: runningRex.uuid,
      mapField: "actionEntries",
      itemUuid: uuid,
      value: existingEntry
        ? {
            ...existingEntry,
            markerId: collectionType === "marker" ? id : existingEntry.markerId,
            containerId: collectionType === "container" ? id : existingEntry.containerId,
            secondaryContainerId:
              collectionType === "secondaryContainer" ? id : existingEntry.secondaryContainerId,
          }
        : {
            rexStatus: null,
            mass: null,
            markerId: collectionType === "marker" ? id : null,
            containerId: collectionType === "container" ? id : null,
            secondaryContainerId: collectionType === "secondaryContainer" ? id : null,
          },
    })
  );

  // No Step 3: this thunk has no UI side-effects of its own.
});

export const thunkDocCreateInitialPosEntries = appCreateAsyncThunk<{ rexUuid: string }>(
  "createInitialPosEntries",
  async ({ rexUuid }) => {
    const missionDocHandle = getMissionDocHandle();
    if (!missionDocHandle) return;
    const doc = missionDocHandle.doc();
    if (!doc) return;

    // Step 1: Build the new pos entries from the running REX's pos sources and types.
    const rex = doc.rexes?.[rexUuid];
    const rexEva = doc.evas?.[rex.evaUuid];
    const posEntryLocation: AEGISPoint =
      rexEva?.egressLocationUuid === "lander"
        ? doc.landerLocation
        : doc.stations?.[rexEva?.egressLocationUuid]?.location;

    const newPosEntries: PosEntry[] = [];
    for (const posSource of rex?.posSources ?? []) {
      const newPosEntry: PosEntry = {
        uuid: uuidv4(),
        location: posEntryLocation,
        elevation: null,
        petSeconds: 0,
        posTypeUuids: rex.posTypes.map((posType) => posType.uuid),
        posSourceUuid: posSource.uuid,
        createdAt: getAccurateNow().getTime(),
        updatedAt: getAccurateNow().getTime(),
      };
      newPosEntries.push(newPosEntry);
    }

    const existingPosEntries = cloneDeep(rex.posEntries ?? []);
    const mergedPosEntries = [...existingPosEntries, ...newPosEntries];

    // Step 2: Apply the merged pos entries to the running REX.
    missionDocHandle.change((m: Mission) =>
      applyUpdateRexByField(m, {
        rexUuid: rex.uuid,
        fieldName: "posEntries",
        value: mergedPosEntries,
        preserveUpdatedAt: true,
      })
    );

    // No Step 3: this thunk has no UI side-effects of its own.
  }
);
