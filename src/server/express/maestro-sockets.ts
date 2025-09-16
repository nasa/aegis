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
import { getActionRefUuids } from "server/express/routes/action";
import { getStationRefUuids } from "server/express/routes/station";
import { getTraverseRefUuids } from "server/express/routes/traverse";
import { getEVARefUuids } from "server/express/routes/eva";

export const emitMaestroStoreUpsert = async (storeUpsert: StoreUpsert): Promise<void> => {
  const io = globalValues.socketio;
  if (!io) return; // no socket.io initialized
  const maestroPayload: StoreUpsertForMaestro = {
    ...storeUpsert,
    type: storeUpsert.type as StoreTypeForMaestro,
    data: null,
  };
  if (storeUpsert.type === "mission") {
    // nothing needs translated here, just send the mission as is
    maestroPayload.data = storeUpsert.data as Mission[];
    io.to("maestro").emit("storeUpsertForMaestro", maestroPayload);
  } else if (storeUpsert.type === "action") {
    const allData = await getAll(storeUpsert.missionId);
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
      allData,
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
        allData,
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
        allData,
        exportActions: false,
      });
      io.to("maestro").emit("storeUpsertForMaestro", {
        ...maestroPayload, // get socket, mission, and lastEditEvent from the original payload
        type: "traverse",
        data: exportedActionTraverses,
      });
    }
  } else if (storeUpsert.type === "station") {
    const allData = await getAll(storeUpsert.missionId);
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
      allData,
      exportActions: false,
    });
    maestroPayload.data = exportedStationData;
    io.to("maestro").emit("storeUpsertForMaestro", maestroPayload);
  } else if (storeUpsert.type === "traverse") {
    const allData = await getAll(storeUpsert.missionId);
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
      allData,
      exportActions: false,
    });
    maestroPayload.data = exportedTraverses;
    io.to("maestro").emit("storeUpsertForMaestro", maestroPayload);
  } else if (storeUpsert.type === "eva") {
    const allData = await getAll(storeUpsert.missionId);
    const evaData = storeUpsert.data as Eva[];
    const evasForMaestro = makeExportEvas({
      evas: evaData,
      allData,
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

export const emitMaestroStoreDelete = async (storeDelete: StoreDelete): Promise<void> => {
  const io = globalValues.socketio;
  if (!io) return; // no socket.io initialized
  const maestroPayload: StoreDeleteForMaestro = {
    ...storeDelete,
    type: storeDelete.type as StoreTypeForMaestro,
    refUuids: null,
  };
  if (storeDelete.type === "mission") {
    // nothing needs translated here, just send the mission as is
  } else if (storeDelete.type === "action") {
    const actionRefUuids = await getActionRefUuids(storeDelete.uuids);
    maestroPayload.refUuids = actionRefUuids;
  } else if (storeDelete.type === "station") {
    const stationRefUuids = await getStationRefUuids(storeDelete.uuids);
    maestroPayload.refUuids = stationRefUuids;
  } else if (storeDelete.type === "traverse") {
    const traverseRefUuids = await getTraverseRefUuids(storeDelete.uuids);
    maestroPayload.refUuids = traverseRefUuids;
  } else if (storeDelete.type === "eva") {
    const evaRefUuids = await getEVARefUuids(storeDelete.uuids);
    maestroPayload.refUuids = evaRefUuids;
  } else if (storeDelete.type === "rex") {
    // nothing needs translated here, just send the rex as is
  } else {
    throw new Error(`Unknown store delete type in emitMaestroStoreDelete: ${storeDelete.type}`);
  }
  io.to("maestro").emit("storeDeleteForMaestro", maestroPayload);
};
