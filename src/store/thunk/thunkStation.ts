import appCreateAsyncThunk from "./thunkUtil";
import {
  setSelectedStationUuid,
  setStationCircleUIStates,
  selectStation,
  setAllStationCirclesUIStates,
} from "store/station";
import { getDistanceBetweenTwoCoordinates, getTotalDistance } from "utils/mapping/geoMath";
import { getTraverseEndpoints } from "operations/helpers/getTraverseEndpoints";
import { isLanderXgressStation } from "operations/helpers/evaSequence";
import { thunkFetchElevation } from "./thunkElevation";
import isEqual from "lodash/isEqual";
import cloneDeep from "lodash/cloneDeep";
import { generateUniqueName } from "utils/names/unique-name";
import { thunkCancelMarkerMapDirective } from "./thunkMap";
import { applyDeleteActions } from "operations/apply/apply-action";
import {
  applyDeleteStations,
  applyUpsertStation,
  applyUpdateAllStationCircleControls,
  applyStationLocationUpdateStage,
  applyDuplicateStationStage,
} from "operations/apply/apply-station";
import { stageDuplicateStation } from "operations/stage/stage-station";
import { getAccurateNow } from "utils/formatting";
import { thunkSetRightPanelIsOpenIfAuto } from "./thunkInterface";
import { generateBlankStation } from "store/storeUtils/station";
import { thunkAddRemoveFolderItem } from "./thunkFolder";
import { defaultSublayerStyle } from "store/storeUtils/sublayer";
import { getMissionDocHandle } from "client/automergeDocHandles";

export const thunkDocUpdateStationLocation = appCreateAsyncThunk<{
  location: AEGISPoint;
  stationUuid: string;
}>("updateStationLocation", async ({ location, stationUuid }, { dispatch }) => {
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;
  const mission = missionDocHandle.doc();
  const station = mission.stations?.[stationUuid];
  if (!station) return;

  // ── Step 1: Build walkback path, collect all adjacent traverses, fetch all elevations in parallel, and build the stage ──
  const landerLocation = mission.landerLocation;
  const rawWalkbackPath = station.walkbackPath;

  let newWalkbackPath: AEGISPoint[];
  if (!rawWalkbackPath || rawWalkbackPath.length === 0) {
    newWalkbackPath = cloneDeep([location, landerLocation]);
  } else {
    newWalkbackPath = cloneDeep(rawWalkbackPath);
    // Snap start to new station location, end to lander
    newWalkbackPath[0] = location;
    newWalkbackPath[newWalkbackPath.length - 1] = landerLocation;
  }

  const walkbackSegmentDistances: number[] = [];
  for (let i = 1; i < newWalkbackPath.length; i++) {
    walkbackSegmentDistances.push(
      getTotalDistance([newWalkbackPath[i - 1], newWalkbackPath[i]], mission.planetRadius)
    );
  }

  // ── Collect all adjacent traverses to update ──────────
  // EVA sequence traverses adjacent to this station
  type TraverseToUpdate = {
    traverseUuid: string;
    evaSequence: EvaSequenceItem[];
    renameTraverse: boolean;
  };
  const traversesToUpdate: TraverseToUpdate[] = [];
  const hasBeenChecked = new Set<string>();

  const allEvas = Object.values(mission.evas ?? {});
  for (const eva of allEvas) {
    // EVA sequence traverses immediately before/after this station
    for (let i = 0; i < eva.sequence.length; i++) {
      if (eva.sequence[i].uuid === stationUuid && eva.sequence[i].type === "station") {
        const traverseBefore = mission.traverses?.[eva.sequence[i - 1]?.uuid];
        if (traverseBefore && !hasBeenChecked.has(traverseBefore.uuid)) {
          hasBeenChecked.add(traverseBefore.uuid);
          traversesToUpdate.push({
            traverseUuid: traverseBefore.uuid,
            evaSequence: eva.sequence as EvaSequenceItem[],
            renameTraverse: true,
          });
        }
        const traverseAfter = mission.traverses?.[eva.sequence[i + 1]?.uuid];
        if (traverseAfter && !hasBeenChecked.has(traverseAfter.uuid)) {
          hasBeenChecked.add(traverseAfter.uuid);
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

  // ── Helper to build the updated traverse path ──────────
  // Given a traverse UUID and its EVA sequence, returns the updated path with
  // endpoints snapped to their neighboring stations/lander (accounting for the
  // station's pending new location), the recalculated per-segment distances, and
  // the human-readable names of the locations on either side of the traverse
  // (used to rename it as "<before> to <after>").
  const buildTraversePath = (
    traverseUuid: string,
    evaSequence: EvaSequenceItem[],
    mission: Mission
  ): { path: AEGISPoint[]; distances: number[]; nameBefore: string; nameAfter: string } => {
    const traverse = mission?.traverses?.[traverseUuid];
    const eva = Object.values(mission?.evas ?? {}).find((e) =>
      e.sequence.some((s) => s.uuid === traverseUuid)
    );
    if (!traverse || !eva) {
      return {
        path: [mission.landerLocation, mission.landerLocation],
        distances: [0],
        nameBefore: "",
        nameAfter: "",
      };
    }

    const path: AEGISPoint[] =
      traverse.path && traverse.path.length > 0
        ? cloneDeep(traverse.path)
        : [mission.landerLocation, mission.landerLocation];

    const { locationBefore, locationAfter, nameBefore, nameAfter } = getTraverseEndpoints(
      traverseUuid,
      { ...eva, sequence: evaSequence },
      mission.stations,
      mission.landerLocation,
      { uuid: stationUuid, location, name: station.name ?? "" }
    );

    if (locationBefore && !isEqual(path.at(0), locationBefore)) path[0] = locationBefore;
    if (locationAfter && !isEqual(path.at(-1), locationAfter))
      path[path.length - 1] = locationAfter;

    const distances: number[] = [];
    for (let i = 1; i < path.length; i++) {
      distances.push(getTotalDistance([path[i - 1], path[i]], mission.planetRadius));
    }
    return { path, distances, nameBefore, nameAfter };
  };

  // ── Fetch ALL elevations in parallel ───────────────────
  const recalculatedTraversePaths = traversesToUpdate.map(({ traverseUuid, evaSequence }) =>
    buildTraversePath(traverseUuid, evaSequence, mission)
  );

  const [stationElevResult, walkbackElevResult, ...traverseElevResults] = await Promise.all([
    // Station elevation
    dispatch(
      thunkFetchElevation({ path: [location], pathSegmentDistances: [0], uuid: stationUuid })
    ),
    // Walkback elevation
    dispatch(
      thunkFetchElevation({
        path: newWalkbackPath,
        pathSegmentDistances: walkbackSegmentDistances,
        uuid: `${stationUuid}_walkback`,
      })
    ),
    // Get traverse elevations
    ...traversesToUpdate.map(({ traverseUuid }, idx) => {
      const { path, distances } = recalculatedTraversePaths[idx];
      return dispatch(
        thunkFetchElevation({ path, pathSegmentDistances: distances, uuid: traverseUuid })
      );
    }),
  ]);

  // ── Build the stage ────────────────────────────────────
  const newElevation =
    stationElevResult.meta.requestStatus === "fulfilled"
      ? (stationElevResult.payload as number)
      : null;

  const newWalkbackElevations =
    walkbackElevResult.meta.requestStatus === "fulfilled"
      ? (walkbackElevResult.payload as number[][])
      : null;

  const stagedTraverseData: TraverseUpdateStageData[] = traversesToUpdate.map(
    ({ traverseUuid, renameTraverse }, idx) => {
      const { path, distances, nameBefore, nameAfter } = recalculatedTraversePaths[idx];
      const elevResult = traverseElevResults[idx];
      return {
        traverseUuid,
        newPath: path,
        newPathSegmentDistances: distances,
        newPathSegmentElevations:
          elevResult.meta.requestStatus === "fulfilled" ? (elevResult.payload as number[][]) : null,
        newName: renameTraverse ? `${nameBefore} to ${nameAfter}` : undefined,
        updatedAt: getAccurateNow().getTime(),
      } satisfies TraverseUpdateStageData;
    }
  );

  const stagedStationData: StationLocationUpdateStageData = {
    stationUuid,
    newLocation: location,
    newElevation,
    newWalkbackPath,
    newWalkbackPathSegmentDistances: walkbackSegmentDistances,
    newWalkbackPathSegmentElevations: newWalkbackElevations,
    traverseUpdates: stagedTraverseData,
  };

  // ── Step 2: Apply everything atomically in a single .change() ──────────────
  missionDocHandle.change((m: Mission) => applyStationLocationUpdateStage(m, stagedStationData));

  // No Step 3: this thunk has no UI side-effects of its own.
});

/**
 * Updates the walkback path, distances, elevation, and
 *  snaps ends to surrounding stations
 * This is used on polyline edit drag-end.
 *
 * Returns the path (could be updated if we had to snap endpoints)
 *  or false if the thunk rejects
 */
export const thunkDocUpdateWalkback = appCreateAsyncThunk<
  {
    path: AEGISPoint[];
    stationUuid: string;
  },
  AEGISPoint[],
  false
>("fullUpdateWalkback", async ({ path, stationUuid }, { dispatch }) => {
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;
  const mission = missionDocHandle.doc();

  // Step 1: Build the updated walkback path and fetch elevation
  // Calculate path distances
  let newPath: AEGISPoint[];
  if (!path || path.length === 0) {
    newPath = [mission.landerLocation, mission.landerLocation];
  } else {
    newPath = cloneDeep(path);
  }

  const station = mission.stations?.[stationUuid];
  const landerLocation = mission.landerLocation;
  // Set starting station
  if (station && !isEqual(newPath.at(0), station.location)) {
    newPath[0] = station.location;
  }
  // Set ending lander
  if (landerLocation && !isEqual(newPath.at(-1), landerLocation)) {
    newPath[newPath.length - 1] = landerLocation;
  }

  // Calculate new path distances
  const pathSegmentDistances: number[] = [];
  for (let i = 1; i < newPath.length; i++) {
    pathSegmentDistances.push(getTotalDistance([newPath[i - 1], newPath[i]], mission.planetRadius));
  }

  // Get elevation traverse
  let newElevationProfile = null;
  const elevationResponse = await dispatch(
    thunkFetchElevation({
      path: newPath,
      pathSegmentDistances: pathSegmentDistances,
      uuid: stationUuid,
    })
  );
  if (elevationResponse.meta.requestStatus === "fulfilled") {
    newElevationProfile = elevationResponse.payload as number[][];
  }

  // Step 2: Apply single change to automerge
  // Save walkback to automerge
  missionDocHandle.change((m: Mission) => {
    const s = m.stations[stationUuid];
    if (!s) return;
    s.walkbackPath = cloneDeep(newPath);
    s.walkbackPathSegmentDistances = pathSegmentDistances;
    s.walkbackPathSegmentElevations = newElevationProfile;
  });

  // No Step 3: this thunk has no UI side-effects of its own.
  return newPath;
});

/**
 * Reset the start and end points of walkback to station and lander
 * Updates path, distance, elevation
 */
export const thunkDocResetWalkback = appCreateAsyncThunk<{
  stationUuid: string;
}>("resetWalkback", async ({ stationUuid }, { dispatch }) => {
  // Step 1: Build the reset path and fetch elevation
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;
  const mission = missionDocHandle.doc();

  const station = mission.stations?.[stationUuid];
  const landerLocation = mission.landerLocation;

  const newPath = cloneDeep([station.location, landerLocation]);

  // Get new distances
  const newPathSegmentDistances = [
    getDistanceBetweenTwoCoordinates(newPath[0], newPath[1], mission.planetRadius),
  ];

  // Get elevation
  let newElevationProfile = null;
  const elevationResponse = await dispatch(
    thunkFetchElevation({
      path: newPath,
      pathSegmentDistances: newPathSegmentDistances,
      uuid: stationUuid,
    })
  );
  if (elevationResponse.meta.requestStatus === "fulfilled") {
    newElevationProfile = elevationResponse.payload as number[][];
  }

  // Step 2: Write the reset walkback path, distances, and elevation atomically
  missionDocHandle.change((m: Mission) => {
    const s = m.stations[stationUuid];
    if (!s) return;
    s.walkbackPath = newPath;
    s.walkbackPathSegmentDistances = newPathSegmentDistances;
    s.walkbackPathSegmentElevations = newElevationProfile;
  });

  // No Step 3: this thunk has no UI side-effects of its own.
});

/**
 * Deletes stations and their actions from automerge
 */
export const thunkDocDeleteStations = appCreateAsyncThunk<
  {
    stationUuids: string[];
    skipValidation?: boolean;
  },
  void,
  string
>(
  "stationsDelete",
  async ({ stationUuids, skipValidation = false }, { dispatch, rejectWithValue }) => {
    if (!stationUuids || stationUuids.length === 0) return;
    const missionDocHandle = getMissionDocHandle();
    if (!missionDocHandle) return;
    const mission = missionDocHandle.doc();

    // Step 1: Validate, gather all child action uuids from the doc snapshot,
    // and pre-fire non-automerge folder removal side-effects.

    // Cannot directly delete an xgress station. Xgress stations are deleted in
    // the REX/EVA delete rather than here.
    const landerXgressUuids = stationUuids.filter((uuid) =>
      isLanderXgressStation(mission?.stations?.[uuid])
    );
    if (landerXgressUuids.length > 0) {
      const message =
        "Cannot delete an EVA's egress or ingress location directly.\nStation not deleted.\n" +
        "Change the EVA's egress/ingress location instead.";
      alert(message);
      return rejectWithValue(message);
    }

    if (!skipValidation) {
      const allStations = mission?.stations ?? {};

      for (const eva of Object.values(mission?.evas ?? {})) {
        // check if this station is in the eva sequence
        if (eva.sequence.length > 0) {
          const sequenceItem = eva.sequence.find((sequenceItem) =>
            stationUuids.includes(sequenceItem.uuid)
          );
          if (sequenceItem) {
            const stationName = allStations[sequenceItem.uuid]?.name;
            const message = `Cannot delete a station that is being used by an EVA.\nStation not deleted.\nEVA ${eva.name} is using this station ${stationName}`;
            alert(message);
            return rejectWithValue(message);
          }
        }
      }
    }

    dispatch(thunkCancelMarkerMapDirective());

    const stationActionUuidsToDelete: string[] = [];
    for (const stationUuid of stationUuids) {
      // Update folders
      dispatch(
        thunkAddRemoveFolderItem({
          itemUuid: stationUuid,
          folderUuid: null,
        })
      );

      // Gather all the actions to delete
      const stationActions = Object.values(mission?.actions ?? {}).filter(
        (action) => action.stationUuid === stationUuid
      );
      stationActionUuidsToDelete.push(...stationActions.map((a) => a.uuid));
    }

    // Step 2: Delete child actions and stations atomically in a single .change()
    missionDocHandle.change((m: Mission) => {
      applyDeleteActions(m, stationActionUuidsToDelete);
      applyDeleteStations(m, stationUuids);
    });

    // Step 3: UI side-effects
    dispatch(setSelectedStationUuid(null));
    dispatch(thunkSetRightPanelIsOpenIfAuto(false));
  }
);

export const thunkDocCreateStation = appCreateAsyncThunk<void>(
  "stationCreate",
  async (_, { getState, dispatch }) => {
    const missionDocHandle = getMissionDocHandle();
    if (!missionDocHandle) return;
    const mission = missionDocHandle.doc();

    // Step 1: Build the new station object
    const existingStationNames = Object.values(mission?.stations ?? {}).map((s) => s.name);
    const randomName = generateUniqueName({
      dictName: "lotr",
      existingNames: existingStationNames,
    });

    // build circle controls
    const blankMapCircleControls: MapCircleControls = {};
    const missionCircleDefinitions = mission.circleDefinitions;
    if (missionCircleDefinitions) {
      Object.entries(missionCircleDefinitions)?.forEach(([uuid]) => {
        blankMapCircleControls[uuid] = {
          uuid: uuid,
          visible: false,
          style: defaultSublayerStyle,
        };
      });
    }

    const blankStation = generateBlankStation({
      missionId: mission.id,
      name: randomName,
      mapCircleControls: blankMapCircleControls,
      ownerId: getState().user?.appUser?.id ?? null,
    });

    // Step 2: Insert the fully-built station into the Automerge doc
    missionDocHandle.change((m: Mission) => applyUpsertStation(m, blankStation));

    // Step 3: UI side-effects
    dispatch(selectStation({ uuid: blankStation.uuid }));
    dispatch(thunkSetRightPanelIsOpenIfAuto(true));

    // create station circles ui states entry
    const circleUIStates: CircleUIStates = {};
    if (mission.circleDefinitions) {
      Object.entries(mission.circleDefinitions)?.forEach(([uuid]) => {
        circleUIStates[uuid] = {
          slidersSelected: false,
        };
      });
    }
    dispatch(
      setStationCircleUIStates({
        stationUuid: blankStation.uuid,
        circleUIStates: circleUIStates,
      })
    );
  }
);

/**
 * Duplicate a station and automatically save it to automerge
 */
export const thunkDocDuplicateStation = appCreateAsyncThunk<
  { stationUuid: string; preserveRefUuid: boolean },
  Station,
  false
>("stationDuplicate", async ({ stationUuid, preserveRefUuid }, { dispatch, getState }) => {
  if (!stationUuid) return;
  const missionDocHandle = getMissionDocHandle();
  const mission = missionDocHandle?.doc();
  if (!mission?.stations?.[stationUuid]) return;

  // Step 1: Build the full duplication plan
  // preserveRefUuids only occurs when duplicating an EVA for a REX.
  const stationStagedData = stageDuplicateStation(mission, {
    sourceStationUuid: stationUuid,
    preserveRefUuid,
  });
  if (!stationStagedData) return;

  // Step 2: Apply the staged station + its child-action duplications atomically
  missionDocHandle.change((m: Mission) => applyDuplicateStationStage(m, stationStagedData));

  // Step 3: UI side-effects
  if (!preserveRefUuid) {
    dispatch(selectStation({ uuid: stationStagedData.newStationUuid }));
    dispatch(thunkSetRightPanelIsOpenIfAuto(true));
  }

  const newStationCircleUIStates: CircleUIStates = cloneDeep(
    getState().station.stationCirclesUIStates[stationUuid]
  );
  dispatch(
    setStationCircleUIStates({
      stationUuid: stationStagedData.newStationUuid,
      circleUIStates: newStationCircleUIStates,
    })
  );

  return stationStagedData.newStation;
});

// When mission is changed, update circle values in stations
export const thunkDocSyncStationsWithMission = appCreateAsyncThunk<void>(
  "stationSyncWithMission",
  async (_, { dispatch, getState }) => {
    const missionDocHandle = getMissionDocHandle();
    if (!missionDocHandle) return;
    const mission = missionDocHandle.doc();

    const newCirclesUIStates: CirclesUIStates = {};
    const allStationCircleControlUpdates: Record<string, MapCircleControls> = {};
    const allStations = Object.values(mission?.stations ?? {});

    // Step 1: Compute all new mapCircleControls and circleUIStates
    allStations.forEach((station) => {
      const oldStationCircleUIStates = getState().station.stationCirclesUIStates[station.uuid];
      const newStationCircleUIStates: CircleUIStates = cloneDeep(oldStationCircleUIStates) || {};
      const newMapCircleControls: MapCircleControls = cloneDeep(station.mapCircleControls) || {};

      Object.entries(mission.circleDefinitions || {})?.forEach(([uuid]) => {
        // Update circle UI states
        if (!newStationCircleUIStates[uuid]) {
          newStationCircleUIStates[uuid] = {
            slidersSelected: false,
          };
        }

        // Update station map circle controls
        if (!newMapCircleControls[uuid]) {
          newMapCircleControls[uuid] = {
            uuid,
            visible: false,
            style: defaultSublayerStyle,
          };
        }
      });

      // Remove any UI states circle definitions that were deleted
      for (const uuid of Object.keys(newStationCircleUIStates)) {
        const existsInMission = mission.circleDefinitions?.[uuid];
        if (!existsInMission) delete newStationCircleUIStates[uuid];
      }
      // Remove any station map circle controls that were deleted
      for (const uuid of Object.keys(newMapCircleControls)) {
        const existsInMission = mission.circleDefinitions?.[uuid];
        if (!existsInMission) delete newMapCircleControls[uuid];
      }

      newCirclesUIStates[station.uuid] = newStationCircleUIStates;
      allStationCircleControlUpdates[station.uuid] = newMapCircleControls;
    });

    // Step 2: Update all station mapCircleControls atomically
    missionDocHandle.change((m: Mission) =>
      applyUpdateAllStationCircleControls(m, allStationCircleControlUpdates)
    );

    // Step 3: UI side-effects
    dispatch(setAllStationCirclesUIStates({ circlesUIStates: newCirclesUIStates }));
  }
);
