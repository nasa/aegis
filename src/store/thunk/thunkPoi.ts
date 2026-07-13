import { selectPoi } from "store/poi";
import appCreateAsyncThunk from "./thunkUtil";
import { thunkFetchElevation } from "./thunkElevation";
import { setSelectedPoiUuid } from "store/poi";
import { v4 as uuidv4 } from "uuid";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import { thunkCancelMarkerMapDirective } from "./thunkMap";
import cloneDeep from "lodash/cloneDeep";
import { getAccurateNow } from "utils/formatting";
import { thunkSetRightPanelIsOpenIfAuto } from "./thunkInterface";
import { thunkAddRemoveFolderItem } from "./thunkFolder";
import { getMissionDocHandle } from "client/automergeDocHandles";
import { applyDeleteActions, applyDuplicateActions } from "client/automerge/apply/apply-action";
import { applyDeletePois, applyUpsertPoi } from "client/automerge/apply/apply-poi";
import { generateUniqueName } from "utils/names/unique-name";
import { generateBlankPoi } from "store/storeUtils/poi";

export const thunkDocUpdatePoiLocation = appCreateAsyncThunk<{
  location: AEGISPoint;
  poiUuid: string;
}>("updatePoiLocation", async ({ location, poiUuid }, { dispatch }) => {
  // Step 1: Fetch elevation for the new location
  const elevationRes = await dispatch(
    thunkFetchElevation({
      path: [location],
      pathSegmentDistances: [0],
      uuid: poiUuid,
    })
  );
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;
  let elevation = null;
  if (elevationRes.meta.requestStatus === "fulfilled") {
    elevation = elevationRes.payload as number;
  }
  // Step 2: Apply all field updates (location + elevation + updatedAt)
  missionDocHandle.change((m: Mission) => {
    const poi = m.pois[poiUuid];
    if (!poi) return;
    poi.location = cloneDeep(location);
    poi.elevation = elevation;
    poi.updatedAt = getAccurateNow().getTime();
  });

  // No Step 3: this thunk has no UI side-effects of its own.
});

export const thunkDocDeletePoi = appCreateAsyncThunk<{
  poiUuid: string;
}>("poiDelete", async ({ poiUuid }, { dispatch }) => {
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;
  const mission = missionDocHandle.doc();

  // Step 1: Read the doc synchronously to derive all data needed
  const poiActions = Object.values(mission?.actions ?? {}).filter(
    (action) => action.poiUuid === poiUuid
  );
  const actionUuidsToDelete = poiActions.map((a) => a.uuid);
  const stationsWithThisPoi = Object.values(mission?.stations ?? {}).filter((s) =>
    s.poiUuids?.includes(poiUuid)
  );

  // Step 2: Apply all deletions atomically in a single .change()
  missionDocHandle.change((m: Mission) => {
    // Strip poi reference from all stations (in-place splice so automerge
    // sees a single-element removal, not a full array replacement).
    for (const s of stationsWithThisPoi) {
      const station = m.stations[s.uuid];
      if (!station) continue;
      const idx = station.poiUuids?.findIndex((uuid) => uuid === poiUuid);
      if (idx !== undefined && idx >= 0) {
        station.poiUuids.splice(idx, 1);
      }
    }
    applyDeleteActions(m, actionUuidsToDelete);
    applyDeletePois(m, [poiUuid]);
  });

  // Step 3: UI side-effects
  dispatch(setSelectedPoiUuid(null));
  dispatch(
    // remove from folder
    thunkAddRemoveFolderItem({
      itemUuid: poiUuid,
      folderUuid: null,
    })
  );
  dispatch(thunkCancelMarkerMapDirective()); // if we're in the middle of a map action, cancel it
  dispatch(thunkSetRightPanelIsOpenIfAuto(false)); // close right panel
});

export const thunkDocCreatePoi = appCreateAsyncThunk<void>(
  "poiCreate",
  async (_, { getState, dispatch }) => {
    const missionDocHandle = getMissionDocHandle();
    if (!missionDocHandle) return;
    const mission = missionDocHandle.doc();

    // Step 1: Build the new POI object synchronously from the current doc
    const existingPois = Object.values(missionDocHandle.doc()?.pois ?? {});
    const randomName = generateUniqueName({
      dictName: "animals",
      existingNames: existingPois.map((item: POI) => item.name),
    });
    const blankPoi = generateBlankPoi({
      missionId: mission.id,
      name: randomName,
      ownerId: getState().user?.appUser?.id ?? null,
    });

    // Step 2: Insert the new POI into the Automerge doc
    missionDocHandle.change((m: Mission) => applyUpsertPoi(m, blankPoi));

    // Step 3: UI side-effects
    dispatch(selectPoi({ uuid: blankPoi.uuid }));
    dispatch(thunkSetRightPanelIsOpenIfAuto(true));
  }
);

export const thunkDocDuplicatePoi = appCreateAsyncThunk<{ poiUuid: string }>(
  "poiDuplicate",
  async ({ poiUuid }, { dispatch }) => {
    if (!poiUuid) return;

    const missionDocHandle = getMissionDocHandle();
    if (!missionDocHandle) return;
    const mission = missionDocHandle.doc();
    const poi = mission?.pois?.[poiUuid];
    if (!poi) return;

    // Step 1: Build the full duplication plan synchronously from the doc
    const existingPois = Object.values(mission?.pois ?? {});
    const newPoi: POI = cloneDeep(poi);
    newPoi.uuid = uuidv4();
    newPoi.updatedAt = getAccurateNow().getTime();
    newPoi.createdAt = getAccurateNow().getTime();
    newPoi.name = makeUniqueStringCopy(
      poi.name,
      existingPois.map((item) => item.name)
    );
    newPoi.actionOrderUuids = [];

    const poiActions = Object.values(mission?.actions ?? {})
      .filter((action) => action.poiUuid === poi?.uuid)
      .sort(
        (a, b) =>
          poi.actionOrderUuids.findIndex((o) => o === a.uuid) -
          poi.actionOrderUuids.findIndex((o) => o === b.uuid)
      );

    // Step 2: Apply the entire duplication atomically in a single .change()
    missionDocHandle.change((m: Mission) => {
      applyUpsertPoi(m, newPoi);
      applyDuplicateActions(m, {
        actions: poiActions,
        poiUuid: newPoi.uuid,
        promotingFromPoi: false,
        preserveRefUuid: false,
      });
    });

    // Step 3: UI side-effects
    dispatch(selectPoi({ uuid: newPoi.uuid }));
    dispatch(thunkSetRightPanelIsOpenIfAuto(true));
  }
);
