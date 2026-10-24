import { setTerrainPreview, clearTerrainPreview, terrainFingerprint } from "store/terrainProfiles";
import { stageTraverseUpdate } from "operations/stage/stage-traverse";
import { thunkFetchTerrainProfile } from "./thunkTerrainProfile";
import { getTraverseEndpoints } from "operations/helpers/getTraverseEndpoints";
import appCreateAsyncThunk from "./thunkUtil";
import { thunkUpdateMapDirective } from "./thunkMap";
import { getMissionDocHandle } from "client/automergeDocHandles";
import { applyDeleteActions } from "operations/apply/apply-action";
import {
  applyDeleteTraverses,
  applyUpdateTraverseByField,
  applyTraverseUpdatesStage,
} from "operations/apply/apply-traverse";
import { areTraverseProfileUpdatesCurrent } from "operations/helpers/traverseProfileRevision";
import { clientLogger } from "utils/logging/clientLogger";

/**
 * Updates the traverse path and distances, and
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
    preview?: boolean;
    evaSequence?: EvaSequenceItem[];
  },
  AEGISPoint[],
  false
>(
  "fullUpdateTraverse",
  async (
    { traverseUuid, path, renameTraverse = false, evaSequence, preview = false },
    { dispatch }
  ) => {
    // Step 1: Build the updated traverse path and distances
    const handle = getMissionDocHandle();
    const mission = handle?.doc();
    if (!mission) return;
    try {
      const stageData = stageTraverseUpdate(mission, {
        traverseUuid,
        renameTraverse,
        overrides: { path, evaSequence },
      });
      if (!stageData) return;

      // Previews fetch their own profile; committed profiles are derived after the commit.
      const profileResponse = preview
        ? await dispatch(
            thunkFetchTerrainProfile({
              path: stageData.newPath,
              pathSegmentDistances: stageData.newPathSegmentDistances,
              uuid: traverseUuid,
            })
          )
        : null;

      if (!areTraverseProfileUpdatesCurrent([stageData])) {
        clientLogger.debug({
          logId: "thunk-traverse",
          logValue: `thunkDocUpdateTraverse: superseded traverse profile for traverse ${traverseUuid}, skipping apply`,
        });
        return;
      }
      const currentMission = handle.doc();
      const currentTraverse = currentMission?.traverses?.[traverseUuid];
      if (getMissionDocHandle() !== handle || !currentTraverse) return;
      const sourceTraverse = mission.traverses[traverseUuid];
      if (
        preview &&
        terrainFingerprint(
          currentMission,
          currentTraverse.path ?? [],
          currentTraverse.pathSegmentDistances ?? []
        ) !==
          terrainFingerprint(
            mission,
            sourceTraverse.path ?? [],
            sourceTraverse.pathSegmentDistances ?? []
          )
      )
        return;

      if (preview) {
        const profile =
          profileResponse.meta.requestStatus === "fulfilled"
            ? (profileResponse.payload as TerrainProfile)
            : null;
        dispatch(
          setTerrainPreview({
            missionId: mission.id,
            uuid: traverseUuid,
            entry: {
              fingerprint: terrainFingerprint(
                mission,
                stageData.newPath,
                stageData.newPathSegmentDistances
              ),
              status: profile ? "ready" : "error",
              error: profile ? null : "Terrain profile unavailable",
              path: JSON.parse(JSON.stringify(stageData.newPath)),
              distances: stageData.newPathSegmentDistances,
              profile,
            },
          })
        );
      } else {
        handle.change((m: Mission) => applyTraverseUpdatesStage(m, [stageData]));
      }

      // No Step 3: this thunk has no UI side-effects of its own.
      return stageData.newPath;
    } finally {
      // A final update ends the drag whether or not it committed.
      if (!preview) dispatch(clearTerrainPreview({ missionId: mission.id, uuid: traverseUuid }));
    }
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
    selectedEva?.sequence,
    mission.stations
  );
  const newPath = [locationBefore, locationAfter];

  // Step 2 (delegated): This thunk makes no .change() call directly — it delegates
  // the atomic .change() to thunkDocUpdateTraverse.
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
}>("updateTraversesAroundStation", async ({ stationUuid, evaUuid }) => {
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

  // Build updated paths for all traverses
  const traverseUpdates: (TraverseUpdateStageData | null)[] = traversesToUpdate.map(
    ({ traverseUuid, evaSequence, renameTraverse }) =>
      stageTraverseUpdate(mission, {
        traverseUuid,
        renameTraverse,
        overrides: { evaSequence },
      })
  );

  const validUpdates = traverseUpdates.filter(Boolean) as TraverseUpdateStageData[];
  if (validUpdates.length === 0) return;

  // Abort the whole compound operation if any path was superseded; partial
  // topology/profile application would leave the EVA internally inconsistent.
  if (!areTraverseProfileUpdatesCurrent(validUpdates)) {
    clientLogger.debug({
      logId: "thunk-traverse",
      logValue: `thunkDocUpdateTraversesAroundStation: superseded traverse profile for station ${stationUuid}, skipping apply`,
    });
    return;
  }
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
      selectedEva?.sequence,
      mission.stations
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
