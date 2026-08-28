import {
  selectEva,
  setOnlyShowRunningRex,
  upsertExpandedEvaUuids,
  setSelectedEvaRightNavItem,
  setSelectedEvaUuid,
  deleteExpandedEvaUuids,
  setEvaDropdownUIState,
  setSelectedEvaSequenceItemUuid,
} from "store/eva";
import cloneDeep from "lodash/cloneDeep";
import appCreateAsyncThunk from "./thunkUtil";
import { generateUniqueName } from "utils/names/unique-name";
import { thunkSelectEVASequenceItem } from "store/thunk/crossThunk";
import { thunkFetchElevation } from "./thunkElevation";
import { thunkSetRightPanelIsOpenIfAuto } from "./thunkInterface";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { thunkAddRemoveFolderItem } from "./thunkFolder";
import { setSelectedPosEntryUuid, setSelectedRexUuid } from "store/rex";
import { setRightPanelIsOpen } from "store/interface";
import { getMissionDocHandle } from "client/automergeDocHandles";
import {
  applyDeleteTraverses,
  applyUpsertTraverse,
  applyTraverseUpdatesStage,
} from "operations/apply/apply-traverse";
import {
  applyDuplicateEvaStage,
  applyUpsertEva,
  applyDeleteEvaStage,
  applyUpdateEvaByField,
  applySwapEvaSequenceItems,
  applySpliceEvaSequence,
  applyInsertEvaSequenceItems,
  applyEvaXgressChangeStage,
} from "operations/apply/apply-eva";
import { stageDuplicateEva } from "operations/stage/stage-eva";
import { stageDeleteEva } from "operations/stage/stage-eva";
import { stageEvaXgressChange } from "operations/stage/stage-eva-xgress";
import { stageDuplicateStation } from "operations/stage/stage-station";
import { stageTraverseUpdate } from "operations/stage/stage-traverse";
import {
  canMoveStation,
  getIngressIndex,
  getXgressTraverseUuid,
} from "operations/helpers/evaSequence";
import { generateLanderXgressStation } from "store/storeUtils/station";
import {
  applyDuplicateStationStage,
  applyDeleteStations,
  applyUpsertStation,
} from "operations/apply/apply-station";
import { applyDeleteActions } from "operations/apply/apply-action";
import { setStationCircleUIStates } from "store/station";

export const thunkDocDeleteEva = appCreateAsyncThunk<{
  evaUuid: string;
  forRex: boolean; // Should only be used when deleting an eva that belongs to a rex
}>("evaDelete", async ({ evaUuid, forRex }, { dispatch, getState }) => {
  if (!evaUuid) return;
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;
  const mission = missionDocHandle.doc();
  const eva = mission?.evas?.[evaUuid];
  if (!eva) return;

  // Pre-effect: Deselect the EVA before mutating to prevent race errors when the
  // timeline tries to render prematurely before we're done deleting all the parts.
  if (getState().eva.selectedEvaUuid === evaUuid) dispatch(setSelectedEvaUuid(null));

  // Step 1: Build the deletion stage synchronously from the doc snapshot.
  // When forRex=false, this also collects all dependent REX UUIDs and their EVAs.
  const stagedEvaData = stageDeleteEva(mission, { evaUuid, forRex });
  if (!stagedEvaData) return;

  // Step 2: Delete everything in a single .change()
  missionDocHandle.change((m: Mission) => applyDeleteEvaStage(m, stagedEvaData));

  // Step 3: UI side-effects
  // Remove folder items for the deleted EVAs
  const allDeletedEvaUuids = [evaUuid, ...stagedEvaData.dependentRexEvaUuids];
  for (const deletedEvaUuid of allDeletedEvaUuids) {
    dispatch(thunkAddRemoveFolderItem({ itemUuid: deletedEvaUuid, folderUuid: null }));
  }
  dispatch(deleteExpandedEvaUuids(allDeletedEvaUuids));
  dispatch(thunkSetRightPanelIsOpenIfAuto(false));
});

export const thunkDocCreateEva = appCreateAsyncThunk<void>(
  "evaCreate",
  async (_, { getState, dispatch }) => {
    const missionDocHandle = getMissionDocHandle();
    if (!missionDocHandle) return;
    const mission = missionDocHandle.doc();

    // Step 1: Build the new EVA and traverse objects synchronously
    const existingEvaNames = Object.values(mission?.evas ?? {}).map((e) => e.name);
    const randomName = generateUniqueName({
      dictName: "colors",
      existingNames: existingEvaNames,
    });

    const ownerId = getState().user?.appUser?.id ?? null;
    const blankEva: Eva = generateBlankEVA({
      missionId: mission.id,
      name: randomName,
      traverseRate: mission.traverseRate,
      duration: mission.defaultEvaDuration,
      ownerId,
    });

    // Create an empty traverse and pre-build its path (lander → lander)
    const newTraverse: Traverse = generateBlankTraverse({ missionId: blankEva.missionId });

    // Add new xgress stations at the lander
    const egressStation = generateLanderXgressStation(mission, {
      xgressType: "egress",
      ownerId: ownerId ?? undefined,
    });
    const ingressStation = generateLanderXgressStation(mission, {
      xgressType: "ingress",
      ownerId: ownerId ?? undefined,
    });

    blankEva.sequence.push(
      { type: "station", uuid: egressStation.uuid },
      { type: "traverse", uuid: newTraverse.uuid },
      { type: "station", uuid: ingressStation.uuid }
    );

    // The default lander→lander path has zero-length segments
    const landerLocation = mission.landerLocation;
    const traversePath: AEGISPoint[] = [cloneDeep(landerLocation), cloneDeep(landerLocation)];
    const traversePathSegmentDistances: number[] = [0];

    // Fetch elevation for the lander→lander path before the .change()
    const elevationResponse = await dispatch(
      thunkFetchElevation({
        path: traversePath,
        pathSegmentDistances: traversePathSegmentDistances,
        uuid: newTraverse.uuid,
      })
    );
    const elevationProfile =
      elevationResponse.meta.requestStatus === "fulfilled"
        ? (elevationResponse.payload as number[][])
        : null;

    // Build the fully-populated traverse
    const populatedTraverse: Traverse = {
      ...newTraverse,
      name: `${egressStation.name} to ${ingressStation.name}`,
      path: traversePath,
      pathSegmentDistances: traversePathSegmentDistances,
      pathSegmentElevations: elevationProfile,
    };

    // Step 2: Upsert the EVA, its two lander stations, and the fully-populated
    // traverse in a single .change()
    missionDocHandle.change((m: Mission) => {
      applyUpsertStation(m, egressStation);
      applyUpsertStation(m, ingressStation);
      applyUpsertEva(m, blankEva);
      applyUpsertTraverse(m, populatedTraverse);
    });

    // Step 3: UI side-effects
    dispatch(selectEva({ uuid: blankEva.uuid }));
    dispatch(thunkSetRightPanelIsOpenIfAuto(true));
    dispatch(thunkSelectEVASequenceItem({ sequenceItemUuid: null }));
  }
);

/**
 * Duplicate an EVA. Automatically saves it to automerge.
 */
export const thunkDocDuplicateEva = appCreateAsyncThunk<
  {
    evaUuid: string;
    includeStations: boolean;
    isRexEva: boolean; // Set to true if this eva is being duplicated for creating a rex
  },
  { uuid: string; refUuid: string },
  false
>("evaDuplicate", async ({ evaUuid, includeStations, isRexEva }, { dispatch }) => {
  if (!evaUuid) return;
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;
  const mission = missionDocHandle.doc();
  if (!mission?.evas?.[evaUuid]) return;

  // Step 1: Build the full duplication stage from the mission
  const stagedEvaData = stageDuplicateEva(mission, {
    sourceEvaUuid: evaUuid,
    isRexEva,
    includeStations,
  });
  if (!stagedEvaData) return;

  // Step 2: Apply the entire stage (EVA + all stations + traverses + actions) atomically
  missionDocHandle.change((m: Mission) => applyDuplicateEvaStage(m, stagedEvaData));

  // Step 3: UI side-effects
  if (!isRexEva) {
    dispatch(selectEva({ uuid: stagedEvaData.newEvaUuid }));
    dispatch(thunkSetRightPanelIsOpenIfAuto(true));
    dispatch(setSelectedEvaSequenceItemUuid(null));
  }
  return { uuid: stagedEvaData.newEvaUuid, refUuid: stagedEvaData.newEva.refUuid };
});

export const thunkDocAddStationToEva = appCreateAsyncThunk<{ evaUuid: string }>(
  "evaAddStation",
  async ({ evaUuid }, { dispatch }) => {
    const missionDocHandle = getMissionDocHandle();
    if (!missionDocHandle) return;
    const eva = missionDocHandle.doc()?.evas?.[evaUuid];
    if (!eva) return;

    // Step 1: Build the blank traverse object to add after the new station
    const newTraverse = generateBlankTraverse({ missionId: eva.missionId });

    // Insert new station just before the ingress station at the end.
    // The traverse to the ingress station now points to the new station.
    const ingressIndex = getIngressIndex(eva.sequence);
    if (ingressIndex === -1) return;

    // Step 2: Upsert traverse and insert the station+traverse before ingress
    missionDocHandle.change((m: Mission) => {
      applyUpsertTraverse(m, newTraverse);
      applyInsertEvaSequenceItems(m, {
        evaUuid,
        insertAt: ingressIndex,
        items: [
          { type: "station", uuid: "" },
          { type: "traverse", uuid: newTraverse.uuid },
        ],
      });
    });

    // Step 3: UI side-effects
    dispatch(upsertExpandedEvaUuids([eva.uuid]));
  }
);

/**
 * Delete a station and a connecting traverse from the eva.
 *
 * Keep the traverse before, drop the station and the traverse
 * after, and re-snap the before-traverse to the next station along.
 */
export const thunkDocDeleteStationFromEva = appCreateAsyncThunk<{
  evaSequence: EvaSequenceItem[];
  sequenceIndex: number;
  evaUuid: string;
  isRexEva: boolean;
}>("evaDeleteStation", async ({ evaSequence, sequenceIndex, evaUuid, isRexEva }, { dispatch }) => {
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;
  const mission = missionDocHandle.doc();

  // Step 1: Determine which traverse to delete, which to update, and splice start
  const traverseUuidToUpdate: string | null = evaSequence[sequenceIndex - 1]?.uuid ?? null;
  const traverseUuidToDelete: string = evaSequence[sequenceIndex + 1].uuid;
  const spliceStart: number = sequenceIndex;

  // Compute what the sequence will look like after the splice (for endpoint lookup)
  const newEvaSequence = evaSequence.filter((_, i) => i !== spliceStart && i !== spliceStart + 1);

  // Gather station/action uuids to delete (for REX EVA)
  const stationUuidToDelete = isRexEva ? evaSequence[sequenceIndex].uuid : null;
  const stationActionUuidsToDelete: string[] = stationUuidToDelete
    ? Object.values(mission.actions ?? {})
        .filter((a) => a.stationUuid === stationUuidToDelete)
        .map((a) => a.uuid)
    : [];

  // Gather traverse action uuids to delete
  const traverseActionUuidsToDelete: string[] = Object.values(mission.actions ?? {})
    .filter((a) => a.traverseUuid === traverseUuidToDelete)
    .map((a) => a.uuid);

  // Fetch elevation for the adjacent traverse (if any)
  const adjacentTraverseUpdate: TraverseUpdateStageData | null = traverseUuidToUpdate
    ? await stageTraverseUpdate(mission, dispatch, {
        traverseUuid: traverseUuidToUpdate,
        renameTraverse: true,
        overrides: { evaSequence: newEvaSequence },
      })
    : null;

  // Step 2: Apply everything in a single .change()
  missionDocHandle.change((m: Mission) => {
    applyDeleteActions(m, [...traverseActionUuidsToDelete, ...stationActionUuidsToDelete]);
    applyDeleteTraverses(m, [traverseUuidToDelete]);
    if (stationUuidToDelete) {
      applyDeleteStations(m, [stationUuidToDelete]);
    }
    applySpliceEvaSequence(m, { evaUuid, start: spliceStart, deleteCount: 2 });
    if (adjacentTraverseUpdate) {
      applyTraverseUpdatesStage(m, [adjacentTraverseUpdate]);
    }
  });

  // Step 3: No UI side-effects
});

export const thunkDocChangeStationInEva = appCreateAsyncThunk<{
  sequenceIndex: number;
  newStationUuid: string;
  oldStationUuid?: string;
  evaUuid: string;
  isRexEva: boolean;
}>(
  "evaChangeStation",
  async (
    { sequenceIndex, newStationUuid, oldStationUuid, evaUuid, isRexEva },
    { dispatch, getState }
  ) => {
    const missionDocHandle = getMissionDocHandle();
    if (!missionDocHandle) return;
    const mission = missionDocHandle.doc();

    // Step 1:
    // Build the station duplication staged data if its a REX EVA
    const stagedStationData = isRexEva
      ? stageDuplicateStation(mission, { sourceStationUuid: newStationUuid, preserveRefUuid: true })
      : undefined;

    const stationUuidToUse = stagedStationData ? stagedStationData.newStationUuid : newStationUuid;

    // Gather old station action uuids to delete (for REX EVA)
    const oldStationActionUuidsToDelete: string[] =
      isRexEva && oldStationUuid
        ? Object.values(mission.actions ?? {})
            .filter((a) => a.stationUuid === oldStationUuid)
            .map((a) => a.uuid)
        : [];

    // Compute what the sequence will look like after the change (for traverse endpoint lookup)
    const eva = mission.evas?.[evaUuid];
    if (!eva) return;

    const updatedSequence = [...(eva.sequence as EvaSequenceItem[])];
    updatedSequence[sequenceIndex] = { type: "station", uuid: stationUuidToUse };

    // Find adjacent traverse uuids
    const traverseUuidsToUpdate: string[] = [];
    const traverseBeforeUuid = updatedSequence[sequenceIndex - 1]?.uuid;
    if (traverseBeforeUuid && mission.traverses?.[traverseBeforeUuid]) {
      traverseUuidsToUpdate.push(traverseBeforeUuid);
    }
    const traverseAfterUuid = updatedSequence[sequenceIndex + 1]?.uuid;
    if (traverseAfterUuid && mission.traverses?.[traverseAfterUuid]) {
      traverseUuidsToUpdate.push(traverseAfterUuid);
    }

    // Fetch elevations for adjacent traverses in parallel
    const newStationLocation = mission.stations?.[newStationUuid]?.location;
    const newStationName = mission.stations?.[newStationUuid]?.name ?? "";

    const traverseUpdates: (TraverseUpdateStageData | null)[] = await Promise.all(
      traverseUuidsToUpdate.map((traverseUuid) =>
        stageTraverseUpdate(mission, dispatch, {
          traverseUuid,
          renameTraverse: true,
          overrides: {
            evaSequence: updatedSequence,
            stationOverride: {
              uuid: stationUuidToUse,
              location: newStationLocation,
              name: newStationName,
            },
          },
        })
      )
    );

    const validTraverseUpdates = traverseUpdates.filter(Boolean) as TraverseUpdateStageData[];

    // Step 2: Apply everything in a single .change()
    missionDocHandle.change((m: Mission) => {
      if (stagedStationData) {
        applyDuplicateStationStage(m, stagedStationData);
      }
      if (isRexEva && oldStationUuid) {
        applyDeleteActions(m, oldStationActionUuidsToDelete);
        applyDeleteStations(m, [oldStationUuid]);
      }
      applyUpdateEvaByField(m, {
        evaUuid,
        fieldName: "sequence",
        index: sequenceIndex,
        value: { type: "station", uuid: stationUuidToUse },
      });
      applyTraverseUpdatesStage(m, validTraverseUpdates);
    });

    // Step 3: UI side-effects
    // If this is a REX EVA, initialize the stationCirclesUIStates for the newly duplicated station
    if (isRexEva && stagedStationData) {
      const sourceCircleUIStates =
        cloneDeep(getState().station.stationCirclesUIStates[newStationUuid]) ?? {};
      dispatch(
        setStationCircleUIStates({
          stationUuid: stagedStationData.newStationUuid,
          circleUIStates: sourceCircleUIStates,
        })
      );
    }
  }
);

export const thunkDocReorderStationInEva = appCreateAsyncThunk<{
  direction: "up" | "down";
  evaSequence: EvaSequenceItem[];
  stationIndex: number;
  evaUuid: string;
}>("evaReorderStation", async ({ direction, evaSequence, stationIndex, evaUuid }, { dispatch }) => {
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;
  const mission = missionDocHandle.doc();

  // Step 1: Determine which station indices to swap and which traverses to update
  //
  // The egress/ingress positions are pinned, so refuse any swap that would move a
  // station into or out of them.
  if (!canMoveStation(evaSequence, stationIndex, direction)) return;

  let stationIndexToSwap: number;
  let traverseUuidsToUpdate: string[];

  if (direction === "up") {
    stationIndexToSwap = stationIndex - 2;
    traverseUuidsToUpdate = [
      evaSequence[stationIndex + 1]?.uuid, // traverse after
      evaSequence[stationIndex - 1]?.uuid, // traverse in-between
      evaSequence[stationIndex - 3]?.uuid, // traverse before
    ].filter(Boolean);
  } else {
    stationIndexToSwap = stationIndex + 2;
    traverseUuidsToUpdate = [
      evaSequence[stationIndex - 1]?.uuid, // traverse before
      evaSequence[stationIndex + 1]?.uuid, // traverse in-between
      evaSequence[stationIndex + 3]?.uuid, // traverse after
    ].filter(Boolean);
  }

  // Compute the new sequence after the swap (for correct endpoint lookup)
  const newEvaSequence: EvaSequenceItem[] = [...evaSequence];
  const temp = newEvaSequence[stationIndexToSwap];
  newEvaSequence[stationIndexToSwap] = newEvaSequence[stationIndex];
  newEvaSequence[stationIndex] = temp;

  // Build paths and fetch elevations for all affected traverses in parallel
  const traverseStagedData: (TraverseUpdateStageData | null)[] = await Promise.all(
    traverseUuidsToUpdate.map((traverseUuid) =>
      stageTraverseUpdate(mission, dispatch, {
        traverseUuid,
        renameTraverse: true,
        overrides: { evaSequence: newEvaSequence },
      })
    )
  );

  const validTraverseUpdates = traverseStagedData.filter(Boolean) as TraverseUpdateStageData[];

  // Step 2: Apply sequence swap + all traverse updates in a single .change()
  missionDocHandle.change((m: Mission) => {
    applySwapEvaSequenceItems(m, { evaUuid, indexA: stationIndexToSwap, indexB: stationIndex });
    applyTraverseUpdatesStage(m, validTraverseUpdates);
  });

  // Step 3: No additional UI side-effects
});

/**
 * Change an EVA's egress or ingress station
 *
 * This may creates or deletes the stations when dealing with lander stations
 * or REX EVA stations.
 * Re-snaps the boundary traverse.
 */
export const thunkDocChangeIngressEgress = appCreateAsyncThunk<{
  type: "ingress" | "egress";
  evaUuid: string;
  newStationUuidOrLander: string; // Either a uuid of a station or "lander"
  isRexEva: boolean;
}>(
  "evaChangeIngressEgress",
  async ({ type, evaUuid, newStationUuidOrLander, isRexEva }, { dispatch, getState }) => {
    const missionDocHandle = getMissionDocHandle();
    if (!missionDocHandle) return;
    const mission = missionDocHandle.doc();

    // Step 1: Plan the swap (which station enters the position, which one leaves)
    const stageData = stageEvaXgressChange(mission, {
      evaUuid,
      xgressType: type,
      newStationUuidOrLander,
      isRexEva,
      ownerId: getState().user?.appUser?.id ?? undefined,
    });
    if (!stageData) return;

    // Re-snap the boundary traverse against the new sequence
    const boundaryTraverseUuid = getXgressTraverseUuid(stageData.newSequence, type);

    // The incoming station may not be in the doc yet (only staged) if it was duplicated.
    // Grab the incoming station to pass to the traverse update stage.
    // Only one of these will be populated due to the logic in stageEvaXgressChange
    const incomingStation =
      stageData.newLanderStation ?? // New lander copy
      stageData.stationStage?.newStation ?? // New station copy (rex eva)
      mission.stations?.[stageData.newStationUuid]; // Existing station (as-planned eva)

    const stagedTraverseData: TraverseUpdateStageData | null = boundaryTraverseUuid
      ? await stageTraverseUpdate(mission, dispatch, {
          traverseUuid: boundaryTraverseUuid,
          renameTraverse: true,
          overrides: {
            evaSequence: stageData.newSequence,
            stationOverride: incomingStation
              ? {
                  uuid: stageData.newStationUuid,
                  location: incomingStation.location,
                  name: incomingStation.name,
                }
              : undefined,
          },
        })
      : null;

    // Step 2: Apply everything in a single .change()
    missionDocHandle.change((m: Mission) => {
      applyEvaXgressChangeStage(m, stageData);
      if (stagedTraverseData) {
        applyTraverseUpdatesStage(m, [stagedTraverseData]);
      }
    });

    // Step 3: UI side-effects
    // If a new station was created, it needs its circle UI state seeded from the
    // station it was copied from.
    if (stageData.stationStage) {
      const sourceCircleUIStates =
        cloneDeep(getState().station.stationCirclesUIStates[newStationUuidOrLander]) ?? {};
      dispatch(
        setStationCircleUIStates({
          stationUuid: stageData.stationStage.newStationUuid,
          circleUIStates: sourceCircleUIStates,
        })
      );
    }
  }
);

// Called when the dropdown next to an eva is changed between as-planned and executions
export const thunkUIChangeEvaDropdown = appCreateAsyncThunk<{
  dropdownEvaUuid: string;
  asPlanedEvaUuid: string;
}>("evaChangeDropdown", async ({ dropdownEvaUuid, asPlanedEvaUuid }, { dispatch, getState }) => {
  // No Step 1/2: this thunk makes no .change() call.
  // Step 3: UI side-effects only — update selection and panel state
  dispatch(setSelectedEvaSequenceItemUuid(null));
  dispatch(setSelectedEvaUuid(dropdownEvaUuid));
  dispatch(setSelectedPosEntryUuid(null));
  dispatch(setRightPanelIsOpen(true));
  dispatch(
    setEvaDropdownUIState({
      asPlannedEvaUuid: asPlanedEvaUuid,
      dropdownEvaUuid: dropdownEvaUuid,
    })
  );
  const rexEva = Object.values(getMissionDocHandle()?.doc()?.rexes ?? {}).find(
    (r) => r.evaUuid === dropdownEvaUuid
  );
  if (rexEva) {
    dispatch(setSelectedRexUuid(rexEva.uuid));
  } else {
    dispatch(setSelectedRexUuid(null));
    dispatch(setSelectedPosEntryUuid(null));
    // If we were on a rex tab, switch to the eva info panel
    if (getState().eva.selectedEvaRightNavItem.toLowerCase().startsWith("rex")) {
      dispatch(setSelectedEvaRightNavItem("info_panel"));
    }
  }
});

// Sets onlyShowRunningRex, but also updates all the selections and UI states
export const thunkUISetOnlyShowRunningRexEva = appCreateAsyncThunk<{ show: boolean }>(
  "evaSetOnlyShowRunningRexEva",
  async ({ show }, { dispatch }) => {
    // No Step 1/2: this thunk makes no .change() call.
    // Step 3: UI side-effects only — update show-running-rex toggle and selection
    dispatch(setOnlyShowRunningRex(show));
    // If the toggle is on, we need to update selection to only the running rex
    if (show) {
      // Select the running REX and EVA
      const runningRex = Object.values(getMissionDocHandle()?.doc()?.rexes ?? {}).find(
        (r) => r.isRunning
      );
      if (!runningRex) return;
      dispatch(setSelectedEvaUuid(runningRex.evaUuid));
      dispatch(setSelectedRexUuid(runningRex.uuid));
    }
  }
);
