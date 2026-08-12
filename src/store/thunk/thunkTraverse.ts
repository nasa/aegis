import { stageTraverseUpdate } from "operations/stage/stage-traverse";
import { getTraverseEndpoints } from "operations/helpers/getTraverseEndpoints";
import appCreateAsyncThunk from "./thunkUtil";
import { thunkUpdateMapDirective } from "./thunkMap";
import { getMissionDocHandle } from "client/automergeDocHandles";
import { applyDeleteActions } from "operations/apply/apply-action";
import {
  applyDeleteTraverses,
  applyUpdateTraverseByField,
  applyUpsertTraverse,
  applyTraverseUpdatesStage,
} from "operations/apply/apply-traverse";

/**
 * Updates the traverse path, distances, elevation, and
 *  snaps ends to surrounding stations
 * This is used on polyline edit drag-end among other areas
 *
 * Optional provide a custom new path to use instead of the traverse's current path.
 * Optional to specify if the traverse name should also be updated
 * Optional to specify a specific eva sequence to pull the to/from end points
 *    if none is specified, the current selected EVA is used
 *
 * Returns the path (could be updated if we had to snap endpoints)
 *  or false if the thunk rejects
 */
export const thunkDocUpdateTraverse = appCreateAsyncThunk<
  {
    traverseUuid: string;
    path?: AEGISPoint[];
    renameTraverse?: boolean;
    evaSequence?: EvaSequenceItem[];
  },
  AEGISPoint[],
  false
>(
  "fullUpdateTraverse",
  async ({ traverseUuid, path, renameTraverse = false, evaSequence }, { dispatch }) => {
    // Step 1: Build the updated traverse path, distances, and elevation
    const mission = getMissionDocHandle()?.doc();
    if (!mission) return;
    const stageData = await stageTraverseUpdate(mission, dispatch, {
      traverseUuid,
      renameTraverse,
      overrides: { path, evaSequence },
    });
    if (!stageData) return;

    // Step 2: Upsert the fully-built traverse in a single atomic .change()
    // We need the full Traverse shape, so spread the existing traverse and
    // overlay the stage data fields
    const traverse = getMissionDocHandle()?.doc()?.traverses?.[traverseUuid];
    if (!traverse) return;
    const newTraverse: Traverse = {
      ...traverse,
      name: stageData.newName ?? traverse.name,
      path: stageData.newPath,
      pathSegmentDistances: stageData.newPathSegmentDistances,
      pathSegmentElevations: stageData.newPathSegmentElevations,
      updatedAt: stageData.updatedAt,
    };
    getMissionDocHandle()?.change((m: Mission) => applyUpsertTraverse(m, newTraverse));

    // No Step 3: this thunk has no UI side-effects of its own.
    return stageData.newPath;
  }
);

/**
 * Reset traverse to a single segment from start/end station locations
 */
export const thunkDocResetTraverse = appCreateAsyncThunk<{
  traverseUuid: string;
}>("resetTraverse", async ({ traverseUuid }, { dispatch, getState }) => {
  // Step 1: Derive the straight-line reset path (egress→ingress endpoints) from the doc
  const mission = getMissionDocHandle()?.doc();
  const selectedEva = mission?.evas?.[getState().eva.selectedEvaUuid];

  const { locationBefore, locationAfter } = getTraverseEndpoints(
    traverseUuid,
    selectedEva,
    mission.stations,
    mission.landerLocation
  );
  const newPath = [locationBefore, locationAfter];

  // Step 2 (delegated): This thunk makes no .change() call directly — it delegates
  // the elevation fetch and atomic .change() to thunkDocUpdateTraverse.
  await dispatch(
    thunkDocUpdateTraverse({
      path: newPath,
      traverseUuid,
      evaSequence: selectedEva.sequence,
      renameTraverse: true,
    })
  );

  // No Step 3: this thunk has no UI side-effects of its own.
});

/**
 * Full update for traverses attached to a given station.
 * Optional: only update for a single EVA, or if none is provided update all EVAs
 */
export const thunkDocUpdateTraversesAroundStation = appCreateAsyncThunk<{
  stationUuid: string;
  evaUuid?: string;
}>("updateTraversesAroundStation", async ({ stationUuid, evaUuid }, { dispatch }) => {
  // Step 1: Identify all traverses adjacent to the station across all relevant EVAs
  const mission = getMissionDocHandle()?.doc();
  if (!mission) return;
  const allTraverses = mission.traverses ?? {};
  const allEvas = Object.values(mission?.evas ?? {});
  const evas = evaUuid ? [mission?.evas?.[evaUuid]] : allEvas;

  // Collect traverses to update with their context for naming
  type TraverseToUpdate = {
    traverseUuid: string;
    evaSequence: EvaSequenceItem[];
    renameTraverse: boolean;
  };
  const traversesToUpdate: TraverseToUpdate[] = [];

  for (const eva of evas) {
    if (!eva) continue;
    for (let i = 0; i < eva.sequence.length; i++) {
      if (eva.sequence[i].uuid === stationUuid) {
        const traverseBefore = allTraverses[eva.sequence[i - 1]?.uuid];
        if (traverseBefore) {
          traversesToUpdate.push({
            traverseUuid: traverseBefore.uuid,
            evaSequence: eva.sequence as EvaSequenceItem[],
            renameTraverse: true,
          });
        }
        const traverseAfter = allTraverses[eva.sequence[i + 1]?.uuid];
        if (traverseAfter) {
          traversesToUpdate.push({
            traverseUuid: traverseAfter.uuid,
            evaSequence: eva.sequence as EvaSequenceItem[],
            renameTraverse: true,
          });
        }
        break;
      }
    }
  }

  if (traversesToUpdate.length === 0) return;

  // Build updated path + fetch elevations for all traverses in parallel
  const traverseUpdates: (TraverseUpdateStageData | null)[] = await Promise.all(
    traversesToUpdate.map(({ traverseUuid, evaSequence, renameTraverse }) =>
      stageTraverseUpdate(mission, dispatch, {
        traverseUuid,
        renameTraverse,
        overrides: { evaSequence },
      })
    )
  );

  const validUpdates = traverseUpdates.filter(Boolean) as TraverseUpdateStageData[];
  if (validUpdates.length === 0) return;

  // Step 2: Apply all traverse updates in a single .change()
  getMissionDocHandle()?.change((m: Mission) => applyTraverseUpdatesStage(m, validUpdates));

  // No Step 3: this thunk has no UI side-effects of its own.
});

/**
 * Save the traverse (update name and exit edit mode)
 */
export const thunkDocSaveTraverse = appCreateAsyncThunk<{ traverseUuid: string }>(
  "traverseSave",
  async ({ traverseUuid }, { dispatch, getState }) => {
    if (!traverseUuid) return;

    // Step 1: Derive the correct traverse name from surrounding stations in the doc snapshot
    const mission = getMissionDocHandle()?.doc();
    const traverse = mission?.traverses?.[traverseUuid];
    if (!traverse) return;

    const selectedEva = mission?.evas?.[getState().eva.selectedEvaUuid];
    const { nameBefore, nameAfter } = getTraverseEndpoints(
      traverseUuid,
      selectedEva,
      mission.stations,
      mission.landerLocation
    );

    // Step 2: Apply the single .change() directly (only if name changed)
    const newName = `${nameBefore} to ${nameAfter}`;
    if (traverse.name !== newName) {
      getMissionDocHandle()?.change((m: Mission) =>
        applyUpdateTraverseByField(m, {
          traverseUuid,
          fieldName: "name",
          value: newName,
          preserveUpdatedAt: true,
        })
      );
    }

    // Step 3: UI side-effects — trigger map polyline save if an edit is in progress
    const traverseMapDirective =
      getState().map.mapDirective?.uuid === traverseUuid ? getState().map.mapDirective : null;
    if (traverseMapDirective?.mapAction === "editPolyline") {
      dispatch(
        thunkUpdateMapDirective({
          ...traverseMapDirective,
          mapAction: "saveEditPolyline",
        })
      );
    }
  }
);

export const thunkUICancelTraverse = appCreateAsyncThunk<{ traverseUuid: string }>(
  "traverseCancel",
  async ({ traverseUuid }, { dispatch, getState }) => {
    // No Step 1/2: this thunk makes no .change() call.
    // Step 3: UI side-effects — cancel map polyline edit if one is in progress
    const traverseMapDirective =
      getState().map.mapDirective?.uuid === traverseUuid ? getState().map.mapDirective : null;
    if (traverseMapDirective?.mapAction === "editPolyline") {
      dispatch(
        thunkUpdateMapDirective({
          ...traverseMapDirective,
          mapAction: "cancelEditPolyline",
        })
      );
    }
  }
);

export const thunkDocDeleteTraverses = appCreateAsyncThunk<{ traverseUuids: string[] }>(
  "traversesDelete",
  async ({ traverseUuids }, { dispatch, getState }) => {
    if (!traverseUuids || traverseUuids.length === 0) return;

    // Step 1: Collect all child action uuids to delete from the doc,
    // and cancel any active map edit for affected traverses (UI pre-effect).
    const traverseActionUuidsToDelete: string[] = [];
    for (const traverseUuid of traverseUuids) {
      // first, if there's an active traverse map edit action for any of these traverses, cancel it
      const traverseMapDirective =
        getState().map.mapDirective?.uuid === traverseUuid ? getState().map.mapDirective : null;
      if (traverseMapDirective?.mapAction === "editPolyline") {
        dispatch(
          thunkUpdateMapDirective({
            ...traverseMapDirective,
            mapAction: "cancelEditPolyline",
          })
        );
      }

      // delete traverse actions from store and db
      const traverseActions = Object.values(getMissionDocHandle()?.doc()?.actions ?? {}).filter(
        (action) => action.traverseUuid === traverseUuid
      );
      traverseActionUuidsToDelete.push(...traverseActions.map((a) => a.uuid));
    }

    // Step 2: Delete child actions and traverses atomically in a single .change()
    const missionDocHandle = getMissionDocHandle();
    if (!missionDocHandle) return;
    missionDocHandle.change((m: Mission) => {
      applyDeleteActions(m, traverseActionUuidsToDelete);
      applyDeleteTraverses(m, traverseUuids);
    });

    // No Step 3: UI map-edit cancellation was handled in Step 1 above as a pre-effect.
  }
);
