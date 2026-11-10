import appCreateAsyncThunk from "./thunkUtil";
import { v4 as uuidv4 } from "uuid";
import { getAccurateNow, petSecondsAt } from "utils/formatting";
import {
  clearPosEntryInEdit,
  setExpandedPosEntryUuid,
  setPosEntryInEdit,
  setPosEntryInEditElevation,
  setPosEntryInEditLocation,
  setSelectedPosEntryUuid,
} from "store/rex";
import { setHoverUuidsForPosEntry } from "store/hover";
import { updateMapDirective } from "store/map";
import { getMissionDocHandle } from "client/automergeDocHandles";
import { generateBlankPosEntry } from "store/storeUtils/rex";
import {
  applyCreatePosEntry,
  applyDeletePosEntry,
  applyDeletePosType,
  applyUpdatePosEntry,
} from "operations/apply/apply-rex";
import {
  getChangedPosEntryFields,
  getMostRecentPosEntry,
  getPosEntryEditValues,
  validatePosEntryEditValues,
} from "utils/posEntries";
import { cancelPendingMapDirective, thunkUpdateMapDirective } from "./thunkMap";
import { thunkFetchPointElevation } from "./thunkTerrainProfile";

// Elevation fetches still in flight, keyed by pos entry uuid. Save waits for them to settle.
const pendingElevationFetches = new Map<string, Promise<void>>();

/** The source a new entry starts with: the latest entry's, else "Task", else the first. */
function getDefaultPosSourceUuid(rex: Rex, latest: PosEntry | null): string | null {
  const sources = rex.posSources ?? [];
  if (latest && sources.some((s) => s.uuid === latest.posSourceUuid)) return latest.posSourceUuid;
  return (sources.find((s) => s.name === "Task") ?? sources[0])?.uuid ?? null;
}

/** End an active or scheduled position map directive without touching the in-edit session. */
export const thunkCancelPosEntryMapDirective = appCreateAsyncThunk<void>(
  "posEntry/cancelMapDirective",
  async (__, { dispatch, getState }) => {
    cancelPendingMapDirective();
    if (getState().map.mapDirective?.mapItemType === "posEntry") {
      dispatch(updateMapDirective(null));
    }
  }
);

/** Discard the in-edit session and any map directive. Nothing was written, so nothing is rolled back. */
export const thunkCancelPosEntryEdit = appCreateAsyncThunk<void>(
  "posEntry/cancelEdit",
  async (__, { dispatch }) => {
    dispatch(clearPosEntryInEdit({ keepExpanded: true }));
    await dispatch(thunkCancelPosEntryMapDirective());
  }
);

/** Start Place on Map (unplaced draft) or Edit Pos. (placed draft) for the open session. */
export const thunkStartPosEntryMapDirective = appCreateAsyncThunk<void>(
  "posEntry/startMapDirective",
  async (__, { dispatch, getState }) => {
    const inEdit = getState().rex.posEntryInEdit;
    if (!inEdit) return;
    await dispatch(
      thunkUpdateMapDirective({
        mapItemType: "posEntry",
        uuid: inEdit.uuid,
        mapAction: inEdit.values.location ? "editMarker" : "createMarker",
      })
    );
  }
);

/**
 * Open a new entry for the selected REX at its current PET, prefilled from the most recent
 * entry's types, source, radius, and color, and start placing it on the map.
 */
export const thunkAddPosEntry = appCreateAsyncThunk<void>(
  "posEntry/add",
  async (__, { dispatch, getState }) => {
    if (getState().rex.posEntryInEdit?.isNew) return;
    const rexUuid = getState().rex.selectedRexUuid;
    const rex = rexUuid ? getMissionDocHandle()?.doc()?.rexes?.[rexUuid] : null;
    if (!rex) return;
    if (getState().rex.posEntryInEdit) await dispatch(thunkCancelPosEntryEdit());
    const latest = getMostRecentPosEntry(rex.posEntries ?? []);
    const uuid = uuidv4();
    dispatch(setSelectedPosEntryUuid(uuid));
    dispatch(
      setPosEntryInEdit({
        uuid,
        rexUuid: rex.uuid,
        isNew: true,
        values: {
          location: null,
          elevation: null,
          petSeconds: petSecondsAt(rex, getAccurateNow().getTime()),
          posTypeUuids: (latest?.posTypeUuids ?? []).filter((typeUuid) =>
            rex.posTypes?.some((type) => type.uuid === typeUuid)
          ),
          posSourceUuid: getDefaultPosSourceUuid(rex, latest),
          uncertaintyMeters: latest?.uncertaintyMeters ?? 0,
          color: latest?.color ?? null,
        },
        base: null,
        elevationPending: false,
      })
    );
    await dispatch(thunkStartPosEntryMapDirective());
  }
);

/** Open the editor on an existing entry of the selected REX, selecting and expanding its row. */
export const thunkEditPosEntry = appCreateAsyncThunk<{ posEntryUuid: string }>(
  "posEntry/edit",
  async ({ posEntryUuid }, { dispatch, getState }) => {
    const rexUuid = getState().rex.selectedRexUuid;
    const rex = rexUuid ? getMissionDocHandle()?.doc()?.rexes?.[rexUuid] : null;
    const entry = rex?.posEntries?.find((item) => item.uuid === posEntryUuid);
    if (!entry) return;
    await dispatch(thunkCancelPosEntryMapDirective());
    dispatch(setSelectedPosEntryUuid(posEntryUuid));
    dispatch(
      setPosEntryInEdit({
        uuid: posEntryUuid,
        rexUuid: rex.uuid,
        isNew: false,
        values: getPosEntryEditValues(entry),
        base: getPosEntryEditValues(entry),
        elevationPending: false,
      })
    );
  }
);

/**
 * Accept or clear an in-edit location from a map click, a completed drag, or coordinate entry,
 * and fetch its elevation. The position stays in the draft until Save.
 */
export const thunkSetPosEntryEditLocation = appCreateAsyncThunk<{
  uuid: string;
  location: AEGISPoint | null;
}>("posEntry/setEditLocation", async ({ uuid, location }, { dispatch, getState }) => {
  const inEdit = getState().rex.posEntryInEdit;
  if (!inEdit || inEdit.uuid !== uuid) return;
  const mission = getMissionDocHandle()?.doc();
  if (!mission) return;
  if (location && (!Number.isFinite(location.lat) || !Number.isFinite(location.lng))) return;

  const point = location ? { lat: location.lat, lng: location.lng } : null;
  const hasDem = !!point && !!mission.demFilePath;
  dispatch(setPosEntryInEditLocation({ uuid, location: point, elevationPending: hasDem }));
  const fetchElevation = (async () => {
    if (!hasDem || !point) return;
    const result = await dispatch(thunkFetchPointElevation({ point, uuid }));
    const elevation =
      result.meta.requestStatus === "fulfilled" ? ((result.payload as number) ?? null) : null;
    dispatch(setPosEntryInEditElevation({ uuid, location: point, elevation }));
  })();
  pendingElevationFetches.set(uuid, fetchElevation);
  try {
    await fetchElevation;
  } finally {
    if (pendingElevationFetches.get(uuid) === fetchElevation) pendingElevationFetches.delete(uuid);
  }
});

/**
 * Save the open edit session in one document change. Throws when the values are invalid, and
 * cancels the session when its REX or entry was deleted underneath it.
 * @returns true when saved.
 */
export const thunkSavePosEntryEdit = appCreateAsyncThunk<void, boolean>(
  "posEntry/saveEdit",
  async (__, { dispatch, getState }) => {
    const uuid = getState().rex.posEntryInEdit?.uuid;
    if (!uuid) return false;

    // Wait for the latest elevation fetch; a newer location may start another one meanwhile.
    while (pendingElevationFetches.has(uuid)) await pendingElevationFetches.get(uuid);

    const inEdit = getState().rex.posEntryInEdit;
    if (!inEdit || inEdit.uuid !== uuid) return false;
    const missionDocHandle = getMissionDocHandle();
    const rex = missionDocHandle?.doc()?.rexes?.[inEdit.rexUuid];
    if (!missionDocHandle || !rex) {
      await dispatch(thunkCancelPosEntryEdit());
      return false;
    }
    const values = inEdit.values;
    const invalid = validatePosEntryEditValues(values, rex);
    if (invalid) throw new Error(invalid);
    const current = rex.posEntries?.find((entry) => entry.uuid === uuid);

    if (inEdit.isNew) {
      if (!current) {
        const now = getAccurateNow().getTime();
        const posEntry = generateBlankPosEntry({
          ...values,
          uuid,
          location: { lat: values.location.lat, lng: values.location.lng },
          posTypeUuids: [...values.posTypeUuids],
          createdAt: now,
          updatedAt: now,
        });
        missionDocHandle.change((m: Mission) =>
          applyCreatePosEntry(m, { rexUuid: inEdit.rexUuid, posEntry })
        );
      }
    } else {
      if (!current) {
        // The entry was deleted underneath the edit; discard the session.
        await dispatch(thunkCancelPosEntryEdit());
        return false;
      }
      const changes = getChangedPosEntryFields(inEdit.base, values);
      if (Object.keys(changes).length > 0) {
        missionDocHandle.change((m: Mission) =>
          applyUpdatePosEntry(m, { rexUuid: inEdit.rexUuid, posEntryUuid: uuid, changes })
        );
      }
    }

    await dispatch(thunkCancelPosEntryMapDirective());
    dispatch(clearPosEntryInEdit({ keepExpanded: true }));
    dispatch(setSelectedPosEntryUuid(uuid));
    return true;
  }
);

/** Delete a position entry of the selected REX and clear everything that referenced it. */
export const thunkDeletePosEntry = appCreateAsyncThunk<{ posEntryUuid: string }>(
  "posEntry/delete",
  async ({ posEntryUuid }, { dispatch, getState }) => {
    const state = getState();
    if (!state.user.missionPerms?.permissions.edit) return;
    const rexUuid = state.rex.selectedRexUuid;
    if (!rexUuid) return;
    if (state.rex.posEntryInEdit?.uuid === posEntryUuid) await dispatch(thunkCancelPosEntryEdit());
    if (getState().rex.selectedPosEntryUuid === posEntryUuid) {
      dispatch(setSelectedPosEntryUuid(null));
    }
    if (getState().rex.expandedPosEntryUuid === posEntryUuid) {
      dispatch(setExpandedPosEntryUuid(null));
    }
    if (getState().hover.posEntryItemUuid === posEntryUuid) {
      dispatch(setHoverUuidsForPosEntry(null));
    }
    getMissionDocHandle()?.change((m: Mission) =>
      applyDeletePosEntry(m, { rexUuid, posEntryUuid })
    );
  }
);

export const thunkDocCreatePosType = appCreateAsyncThunk<void>(
  "createPosType",
  async (__, { getState }) => {
    const blankPosType: PosType = {
      uuid: uuidv4(),
      abbr: "1",
      name: "EV1",
      icon: "1f468-200d-1f680", //crew
      pathColor: "#ff0000",
    };

    // Step 1: Build the blank PosType and read the selected REX UUID from state.
    const selectedRexUuid = getState().rex.selectedRexUuid;
    const missionDocHandle = getMissionDocHandle();
    if (!missionDocHandle) return;

    // Step 2: Add the new PosType to the Automerge doc.
    missionDocHandle.change((m: Mission) => {
      const rex = m.rexes[selectedRexUuid];
      if (!rex) return;
      // Do a full array reassignment due to an automerge bug where the push/splice updating to the maestro socket.
      // Existing pos types are serialized through JSON first to fully detach them from the live
      // Automerge proxy — spreading proxy objects directly back into the doc throws
      // "Cannot create a reference to an existing document object".
      const existingPosTypes: PosType[] = JSON.parse(JSON.stringify(rex.posTypes ?? []));
      rex.posTypes = [...existingPosTypes, blankPosType];
      rex.updatedAt = getAccurateNow().getTime();
    });

    // No Step 3: this thunk has no UI side-effects of its own.
  }
);

export const thunkDocDeletePosType = appCreateAsyncThunk<
  { rexUuid: string; posTypeUuid: string },
  void,
  string
>("deletePosType", async ({ rexUuid, posTypeUuid }, { rejectWithValue }) => {
  const doc = getMissionDocHandle()?.doc();
  if (!doc) return;
  const rex = doc.rexes?.[rexUuid];
  if (!rex) return;

  // Step 1: Validate that the PosType is not referenced by any existing pos entries.
  const posEntriesUsingPosType = rex.posEntries?.filter((posEntry) =>
    posEntry.posTypeUuids.includes(posTypeUuid)
  );
  if (posEntriesUsingPosType?.length > 0) {
    return rejectWithValue(
      "This Position Item Type is being used by one or more Position Entries. Please delete those Position Entries before deleting this Position Item Type."
    );
  }

  // Step 2: PosType is safe to delete — remove it from the Automerge doc.
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;
  missionDocHandle.change((m: Mission) => applyDeletePosType(m, { rexUuid, posTypeUuid }));

  // No Step 3: this thunk has no UI side-effects of its own.
});
