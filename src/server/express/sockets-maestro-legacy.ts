/**
 * @deprecated
 * Legacy Maestro socket emit helpers that mirror the old `storeUpsertForMaestro` REST-based
 * pattern. The old Maegistro v1 release used rest endpoints with socket emits to send data to
 * Maestro. Those rest endpoints no longer exist and are now automerge document listeners that
 * feed both the new maestro socket namespace, and this old legacy format.
 * Once all legacy maestro clients are converted this file can be deleted.
 */
import { globalValues } from "server/express/global";
import { getAll } from "server/express/routes/all";
import {
  makeExportActions,
  makeExportEvas,
  makeExportRexes,
  makeExportStations,
  makeExportTraverses,
} from "../../utils/export";
import uniq from "lodash/uniq";
import { serverLogger } from "utils/logging/serverLogger";
import type { MaestroDiff, MaestroRelevantCollectionKey } from "./sockets-maestro-emitters";

// ─── Deprecated types ─────────────────────────────────────────────────────────

/**
 * @deprecated
 */
type AllDataForMaestro = {
  mission: Mission;
  pois: POI[];
  stations: Station[];
  actions: Action[];
  traverses: Traverse[];
  evas: Eva[];
  rexes: Rex[];
  level1s: STMLevel1[];
  level2s: STMLevel2[];
  level3s: STMLevel3[];
};

/**
 * @deprecated
 */
interface StoreUpsertLegacy {
  socketId: string;
  missionId: number;
  type: SocketStoreTypeLegacy;
  data: StoreDataLegacy[];
  lastEditEvent: EditEvent;
}

/**
 * @deprecated
 */
type SocketStoreTypeLegacy =
  | "preset"
  | "poi"
  | "station"
  | "eva"
  | "action"
  | "traverse"
  | "rex"
  | "stmRule"
  | "folder";

/**
 * @deprecated
 */
type StoreDataLegacy = POI | Preset | Station | Eva | Action | Traverse | Rex | STMRule | Folder;

// ─── Deprecated helper functions ──────────────────────────────────────────────

/**
 * @deprecated Helper function only used in the deprecated emitMaestroStoreUpsert
 */
const getAllAsExportData = async (missionId: number): Promise<AllDataForMaestro> => {
  const data = await getAll(missionId);
  return {
    ...data,
    pois: Object.values(data.mission?.pois ?? {}),
    stations: Object.values(data.mission?.stations ?? {}),
    actions: Object.values(data.mission?.actions ?? {}),
    traverses: Object.values(data.mission?.traverses ?? {}),
    evas: Object.values(data.mission?.evas ?? {}),
    rexes: Object.values(data.mission?.rexes ?? {}),
  };
};

/**
 * @deprecated This should be removed and the new maestro socket namespace should be used instead
 */
const emitMaestroStoreUpsert = async (storeUpsert: StoreUpsertLegacy): Promise<void> => {
  const io = globalValues.socketio;
  if (!io) return; // no socket.io initialized
  const maestroPayload: StoreUpsertForMaestro = {
    ...storeUpsert,
    type: storeUpsert.type as StoreTypeForMaestro,
    data: null,
  };
  if (storeUpsert.type === "action") {
    const allData = await getAllAsExportData(storeUpsert.missionId);
    const actionData = storeUpsert.data as Action[];
    // check action is in an eva
    const allEvaSequenceUuids = allData.evas.flatMap((eva) =>
      eva.sequence.map((seqItem) => seqItem.uuid)
    );
    const actionsForMaestro = actionData.filter(
      (action) =>
        allEvaSequenceUuids.includes(action.traverseUuid) ||
        allEvaSequenceUuids.includes(action.stationUuid)
    );

    // return if none of the actions are in an eva.
    if (actionsForMaestro.length === 0) return;

    const exportedActionData = makeExportActions({
      actions: actionsForMaestro,
      mission: allData.mission,
      missionGrid: null,
    });
    maestroPayload.data = exportedActionData;
    io.to("maestro").emit("storeUpsertForMaestro", maestroPayload);

    // get unique list of stations from the actions and emit updates for their new calculated fields
    // todo: this probably could be improved by only emitting if the change inside the action actually
    //    affects the station. ex: new action, or action duration that changes station duration
    const uniqueStationUuids = uniq(actionsForMaestro.map((action) => action.stationUuid));
    if (uniqueStationUuids.length > 0) {
      const exportedActionStations = makeExportStations({
        stations: allData.stations.filter((station) => uniqueStationUuids.includes(station.uuid)),
        missionGrid: null,
        mission: allData.mission,
        exportActions: false,
      });
      io.to("maestro").emit("storeUpsertForMaestro", {
        ...maestroPayload, // get socket, mission, and lastEditEvent from the original payload
        type: "station",
        data: exportedActionStations,
      });
    }
    // get unique list of traverses from the actions and emit updates for their new calculated fields
    const uniqueTraverseUuids = uniq(actionsForMaestro.map((action) => action.traverseUuid));
    if (uniqueTraverseUuids.length > 0) {
      const exportedActionTraverses = makeExportTraverses({
        traverses: allData.traverses.filter((traverse) =>
          uniqueTraverseUuids.includes(traverse.uuid)
        ),
        missionGrid: null, // not used
        mission: allData.mission,
        exportActions: false,
      });
      io.to("maestro").emit("storeUpsertForMaestro", {
        ...maestroPayload, // get socket, mission, and lastEditEvent from the original payload
        type: "traverse",
        data: exportedActionTraverses,
      });
    }
  } else if (storeUpsert.type === "station") {
    const allData = await getAllAsExportData(storeUpsert.missionId);
    const stationData = storeUpsert.data as Station[];
    // check if station is in an eva
    const allEvaStations = allData.evas.flatMap((eva) =>
      eva.sequence.filter((seqItem) => seqItem.type === "station").map((seqItem) => seqItem.uuid)
    );
    const stationsForMaestro = stationData.filter((station) =>
      allEvaStations.includes(station.uuid)
    );
    // return if none of the stations are in an eva
    if (stationsForMaestro.length === 0) return;

    const exportedStationData = makeExportStations({
      stations: stationsForMaestro,
      missionGrid: null,
      mission: allData.mission,
      exportActions: false,
    });
    maestroPayload.data = exportedStationData;
    io.to("maestro").emit("storeUpsertForMaestro", maestroPayload);
  } else if (storeUpsert.type === "traverse") {
    const allData = await getAllAsExportData(storeUpsert.missionId);
    const traverseData = storeUpsert.data as Traverse[];
    // Check if traverse is in an eva
    // Technically traverses are *always* in an eva, so always send it, with the one exception where
    //    a new station (and therefore a traverse is generated) is added to an EVA. The traverse gets
    //    auto saved to the db to prevent weird cancel behaviors, but the EVA sequence in the DB hasn't
    //    been updated yet. If thats the case, don't send to Maestro. Check for this case below.
    const allEvaTraverses = allData.evas.flatMap((eva) =>
      eva.sequence.filter((seqItem) => seqItem.type === "traverse").map((seqItem) => seqItem.uuid)
    );
    const traversesForMaestro = traverseData.filter((station) =>
      allEvaTraverses.includes(station.uuid)
    );
    // return if none of the traverses are in an eva
    if (traversesForMaestro.length === 0) return;

    const exportedTraverses: ExportTraverse[] = makeExportTraverses({
      traverses: storeUpsert.data as Traverse[],
      missionGrid: null, // not used
      mission: allData.mission,
      exportActions: false,
    });
    maestroPayload.data = exportedTraverses;
    io.to("maestro").emit("storeUpsertForMaestro", maestroPayload);
  } else if (storeUpsert.type === "eva") {
    const allData = await getAllAsExportData(storeUpsert.missionId);
    const evaData = storeUpsert.data as Eva[];
    const evasForMaestro = makeExportEvas({
      evas: evaData,
      mission: allData.mission,
      missionGrid: null, // not used
    });
    maestroPayload.data = evasForMaestro;
    io.to("maestro").emit("storeUpsertForMaestro", maestroPayload);
  } else if (storeUpsert.type === "rex") {
    // only emit if it's a maestro controlled rex
    const rexData = storeUpsert.data as Rex[];
    const rexesForMaestro = rexData.filter((rex) => rex.maestroControlled);
    // return if none of the rexes are maestro controlled
    if (rexesForMaestro.length === 0) return;

    const exportedRexData: ExportRex[] = makeExportRexes({
      rexes: rexesForMaestro,
    });
    maestroPayload.data = exportedRexData;
    io.to("maestro").emit("storeUpsertForMaestro", maestroPayload);
  } else {
    throw new Error(`Unknown store upsert type in emitMaestroStoreUpsert: ${storeUpsert.type}`);
  }
};

/**
 * @deprecated type used to support the previous data structure sent to Maestro
 * Map from a Maestro-relevant collection key (plural, e.g. "stations") to the
 * StoreUpsert type string (singular, e.g. "station"). Kept explicit rather than
 * derived (e.g. via `replace(/s$/, "")`) so renames stay refactor-safe.
 */
const KEY_TO_LEGACY_STORE_TYPE = {
  evas: "eva",
  stations: "station",
  traverses: "traverse",
  actions: "action",
  rexes: "rex",
} as const satisfies Record<MaestroRelevantCollectionKey, StoreTypeForMaestro>;

/**
 * @deprecated — mirrors the old emitStoreUpsert calls that used to be in API endpoints
 * Delete events are not emitted — this was never supported.
 */
export const emitMaestroStoreUpsertFromDiff = (missionId: number, diff: MaestroDiff): void => {
  const io = globalValues.socketio;
  if (!io) return;
  const maestroRoomSize = io.sockets.adapter.rooms.get("maestro")?.size ?? 0;
  if (maestroRoomSize === 0) return; // no legacy Maestro clients connected

  // Shared stub fields for the StoreUpsert.
  const storeUpsertBase = {
    socketId: "automerge",
    missionId,
    lastEditEvent: null as unknown as EditEvent,
  };

  // Per-collection upserts
  const collectionUpserts: { key: MaestroRelevantCollectionKey; data: StoreDataLegacy[] }[] = [
    { key: "evas", data: diff.evas.upserted },
    { key: "stations", data: diff.stations.upserted },
    { key: "traverses", data: diff.traverses.upserted },
    { key: "actions", data: diff.actions.upserted },
    { key: "rexes", data: diff.rexes.upserted },
  ];

  for (const { key, data } of collectionUpserts) {
    if (data.length === 0) continue;
    const type = KEY_TO_LEGACY_STORE_TYPE[key];
    const storeUpsert: StoreUpsertLegacy = { ...storeUpsertBase, type, data };
    emitMaestroStoreUpsert(storeUpsert).catch((error) => {
      serverLogger.error(
        {
          logId: "socket-maestro",
          logValue: `emitMaestroStoreUpsertFromDiff - Error emitting ${type} for mission ${missionId}`,
          missionId,
        },
        error instanceof Error ? error : new Error(String(error))
      );
    });
  }
};
