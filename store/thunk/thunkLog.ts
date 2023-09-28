import appCreateAsyncThunk from "./thunkUtil";
import _ from "lodash";
import {
  makeExportActions,
  makeExportEvas,
  makeExportPois,
  makeExportStations,
  makeExportTraverses,
} from "utils/export";
import * as httpClient_Log from "http-client/log";
import { v4 as uuidv4 } from "uuid";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";

/**
 * Export a full log of a REX. This is the only logging function that comes from the client due to wanting calculated values etc.
 * The other logging functions are server-side only in the API endpoints directly.
 */
export const thunkLogRexFull = appCreateAsyncThunk<{
  rexUuid: string;
  directive: "start" | "stop";
}>("logRexFull", async ({ rexUuid, directive }, { getState }) => {
  const exportRex = _.cloneDeep(
    getState().rex.rexes.find((rex) => rex.uuid === rexUuid)
  ) as ExportRex;

  // package up EVA and children

  const eva = getState().eva.evas.find((eva) => eva.uuid === exportRex.selectedRexEvaUuid);

  if (!eva) {
    const log: Log = {
      uuid: uuidv4(),
      missionId: getState().mission.mission.id,
      type: directive === "start" ? "fullRexStart" : "fullRexStop",
      payloadJson: JSON.stringify({ noEvaSelected: true }),
      createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
    };
    httpClient_Log.upsertLog(log);
    return;
  }

  const stationsInEva: Station[] = [];
  eva.sequence.forEach((item) => {
    if (item.type === "station") {
      stationsInEva.push(getState().station.stations.find((station) => station.uuid === item.uuid));
    }
  });

  const traversesInEva: Traverse[] = [];
  eva.sequence.forEach((item) => {
    if (item.type === "traverse") {
      traversesInEva.push(
        getState().traverse.traverses.find((traverse) => traverse.uuid === item.uuid)
      );
    }
  });

  const actionsInEva: Action[] = _.flatten(
    stationsInEva.map((station) => {
      return getState().action.actions.filter((action) => action.stationUuid === station.uuid);
    })
  );

  // build up export object
  /**
   * Actions
   */
  const exportActions: ExportAction[] = makeExportActions({
    actions: actionsInEva,
    mission: getState().mission.mission,
    pois: getState().poi.pois,
    stations: getState().station.stations,
    stmStore: getState().stm,
  });

  /**
   * POIs
   */
  const exportedPois: ExportPOI[] = makeExportPois({
    poiStore: getState().poi,
    actions: exportActions,
    missionStore: getState().mission,
  });

  /**
   * Stations
   */
  const exportedStations: ExportStation[] = makeExportStations({
    stationStore: getState().station,
    actions: exportActions,
    missionStore: getState().mission,
    pois: exportedPois,
  });

  /**
   * Traverses
   */
  const exportedTraverses: ExportTraverse[] = makeExportTraverses({
    traverses: traversesInEva,
    calculatedFields: getState().traverse.calculatedFields,
  });

  /**
   * EVAs
   */
  const exportedEvas: ExportEva[] = makeExportEvas({
    evas: [eva],
    evaCalculatedFields: getState().eva.calculatedFields,
    stations: exportedStations,
    traverses: exportedTraverses,
    missionStore: getState().mission,
  });

  exportRex.evaReadable = exportedEvas[0];

  // persist export to the log database
  const log: Log = {
    uuid: uuidv4(),
    missionId: getState().mission.mission.id,
    type: directive === "start" ? "fullRexStart" : "fullRexStop",
    payloadJson: JSON.stringify(exportRex),
    createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
  };

  httpClient_Log.upsertLog(log);
});
