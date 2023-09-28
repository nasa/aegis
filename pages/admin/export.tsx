import PopulateStore from "components/interface/page/populateStore";
import _ from "lodash";
import { NextPage } from "next";
import { useRouter } from "next/router";
import { FunctionComponent, useEffect, useState } from "react";
import { shallowEqual, useAppSelector } from "utils/useAppSelector";

import { Checkbox } from "components/interface/form/globalFields";
import { isLoggedIn } from "http-client/login";
import { getMissions } from "http-client/mission";
import {
  makeExportActions,
  makeExportPois,
  makeExportStations,
  makeExportTraverses,
  makeExportEvas,
} from "utils/export";
import * as httpClient_log from "http-client/log";
const jsonKeysSort = require("json-keys-sort");

const ExportPage: NextPage = () => {
  const router = useRouter();
  const { missionId } = router.query;
  const intMissionId = missionId ? parseInt(missionId as string) : null;

  const missionStore = useAppSelector((state) => state.mission, shallowEqual);
  const poiStore = useAppSelector((state) => state.poi, shallowEqual);
  const stationStore = useAppSelector((state) => state.station, shallowEqual);
  const actionStore = useAppSelector((state) => state.action, shallowEqual);
  const traverseStore = useAppSelector((state) => state.traverse, shallowEqual);
  const evaStore = useAppSelector((state) => state.eva, shallowEqual);
  const stmStore = useAppSelector((state) => state.stm, shallowEqual);

  const [exportedData, setExportedData] = useState<ExportedData>(null);
  const [selectedOutput, setSelectedOutput] = useState("");

  const [selectEvas, setSelectEvas] = useState(true);
  const [selectMission, setSelectMission] = useState(false);
  const [selectPois, setSelectPois] = useState(false);
  const [selectStations, setSelectStations] = useState(false);
  const [selectActions, setSelectActions] = useState(false);
  const [selectTraverses, setSelectTraverses] = useState(false);

  //on load check login and mission id
  useEffect(() => {
    (async () => {
      const response = await isLoggedIn();
      if (response.status === "success") {
        const user = response.data.user;
        if (!(user.isAdmin || user.isSuperAdmin)) {
          router.push("/admin"); //Redirect to homepage
        }
      } else {
        router.push("/admin");
      }

      const missions = (await getMissions()).data;
      if (!missions.find((m) => m.id === intMissionId)) router.push("/admin");
    })();
  }, [router, intMissionId]);

  useEffect(() => {
    if (
      !missionStore.mission ||
      poiStore.pois.length === 0 ||
      stationStore.stations.length === 0 ||
      actionStore.actions.length === 0 ||
      traverseStore.traverses.length === 0 ||
      evaStore.evas.length === 0 ||
      stmStore.objectives.length === 0 ||
      stmStore.goals.length === 0 ||
      stmStore.investigations.length === 0
    )
      return;

    /**
     * Actions
     */
    const actions: ExportAction[] = makeExportActions({
      actions: actionStore.actions,
      stations: stationStore.stations,
      pois: poiStore.pois,
      stmStore,
      mission: missionStore.mission,
    });

    /**
     * POIs
     */
    const pois: ExportPOI[] = makeExportPois({
      poiStore,
      actions,
      missionStore,
    });

    /**
     * Stations
     */
    const stations: ExportStation[] = makeExportStations({
      stationStore,
      actions,
      missionStore,
      pois,
    });

    /**
     * Traverses
     */
    const traverses: ExportTraverse[] = makeExportTraverses({
      traverses: traverseStore.traverses,
      calculatedFields: traverseStore.calculatedFields,
    });

    /**
     * EVAs
     */
    const evas: ExportEva[] = makeExportEvas({
      evas: evaStore.evas,
      evaCalculatedFields: evaStore.calculatedFields,
      stations,
      traverses,
      missionStore,
    });

    /**
     * Finish
     */
    const exportedData: ExportedData = {
      mission: missionStore.mission,
      pois,
      stations,
      actions,
      traverses,
      evas,
    };

    setExportedData(exportedData);
  }, [missionStore, poiStore, stationStore, actionStore, traverseStore, evaStore, stmStore]);

  const generateOutput = () => {
    let selectedExportedData = {};
    if (selectEvas)
      selectedExportedData = { ...selectedExportedData, evas: { ...exportedData.evas } };
    if (selectMission)
      selectedExportedData = { ...selectedExportedData, mission: { ...exportedData.mission } };
    if (selectPois)
      selectedExportedData = { ...selectedExportedData, pois: { ...exportedData.pois } };
    if (selectStations)
      selectedExportedData = { ...selectedExportedData, stations: { ...exportedData.stations } };
    if (selectActions)
      selectedExportedData = { ...selectedExportedData, actions: { ...exportedData.actions } };
    if (selectTraverses)
      selectedExportedData = { ...selectedExportedData, traverses: { ...exportedData.traverses } };

    // convert object to readble string
    const sortedJson = jsonKeysSort.sort(selectedExportedData);
    const dataStr = JSON.stringify(sortedJson, null, 2);

    return dataStr;
  };

  if (!intMissionId) return <div>No missionId provided</div>;

  return (
    <>
      <div>
        <h1>Export</h1>
        <div style={{ marginBottom: "5px" }}>Mission: {missionStore.mission?.name}</div>
        <div style={{ userSelect: "none" }}>
          <div>Select parts of mission data to export:</div>
          <Checkbox
            label="All EVAs (including stations with associated actions and traverses)"
            checked={selectEvas}
            onChange={() => setSelectEvas(!selectEvas)}
          />

          <Checkbox
            label="All POIs (including associated actions)"
            checked={selectPois}
            onChange={() => setSelectPois(!selectPois)}
            uniqueId="export-pois"
          />
          <Checkbox
            label="All Stations (including associated actions)"
            checked={selectStations}
            onChange={() => setSelectStations(!selectStations)}
            uniqueId="export-stations"
          />
          <Checkbox
            label="All Actions (including associated STMs)"
            checked={selectActions}
            onChange={() => setSelectActions(!selectActions)}
            uniqueId="export-actions"
          />
          <Checkbox
            label="All Traverses"
            checked={selectTraverses}
            onChange={() => setSelectTraverses(!selectTraverses)}
            uniqueId="export-traverses"
          />
          <Checkbox
            label="Mission Details"
            checked={selectMission}
            onChange={() => setSelectMission(!selectMission)}
            uniqueId="export-mission"
          />
          <button
            onClick={() => {
              const output = generateOutput();
              setSelectedOutput(output);
            }}
          >
            Export as JSON to Text Field
          </button>
          <button
            onClick={() => {
              const output = generateOutput();
              setSelectedOutput(output);
              const element = document.createElement("a");
              const file = new Blob([output], { type: "text/json" });
              element.href = URL.createObjectURL(file);
              let filename = `${missionStore.mission?.name}_`;
              if (selectEvas) filename += "evas_";
              if (selectMission) filename += "mission_";
              if (selectPois) filename += "pois_";
              if (selectStations) filename += "stations_";
              if (selectActions) filename += "actions_";
              if (selectTraverses) filename += "traverses_";
              filename += "export.json";
              element.download = filename;
              document.body.appendChild(element); // Required for this to work in FireFox
              element.click();
            }}
          >
            Export as JSON File
          </button>
        </div>
        <div style={{ fontSize: "0.8em" }}>
          <textarea
            style={{ width: "100%", height: "200px" }}
            value={selectedOutput}
            readOnly={true}
          />
        </div>
        <ExporLogs missionId={intMissionId} missionName={missionStore.mission?.name} />
      </div>

      <PopulateStore missionId={intMissionId} hasPermissions={true} />
    </>
  );
};

export default ExportPage;

const ExporLogs: FunctionComponent<{ missionId: number; missionName: string }> = ({
  missionId,
  missionName,
}) => {
  const [exportOutput, setExportOutput] = useState("");

  const getLogs = async (): Promise<Log[]> => {
    const response = await httpClient_log.getLogs(missionId);
    if (response.status === "success") {
      // convert payloadJson to object
      const logsConverted = response.data.map((log) => {
        return {
          ...log,
          payloadJson: JSON.parse(log.payloadJson),
        };
      });
      return logsConverted;
    }
  };

  return (
    <div>
      <h1>Export Real-time Execution Logs</h1>
      <div style={{ marginBottom: "5px" }}></div>
      <div style={{ userSelect: "none" }}>
        <button
          onClick={() => {
            (async () => {
              const logs = await getLogs();
              setExportOutput(JSON.stringify(logs, null, 2));
            })();
          }}
        >
          Export Logs as JSON to Text Field
        </button>
        <button
          onClick={() => {
            (async () => {
              const logs = await getLogs();
              const element = document.createElement("a");
              const file = new Blob([JSON.stringify(logs, null, 2)], { type: "text/json" });
              element.href = URL.createObjectURL(file);
              const filename = `${missionName}_rex_logs_export.json`;
              element.download = filename;
              document.body.appendChild(element); // Required for this to work in FireFox
              element.click();
            })();
          }}
        >
          Export Logs as JSON to File
        </button>
        <button
          onClick={() => {
            (async () => {
              if (
                confirm(
                  "Are you sure you want to delete all Real-time execution logs for this mission?"
                )
              ) {
                const response = await httpClient_log.deleteLogs(missionId);
                if (response.status === "success") {
                  alert("Logs deleted");
                  setExportOutput("");
                }
              }
            })();
          }}
        >
          Delete Logs for this Mission
        </button>
      </div>
      <div style={{ fontSize: "0.8em" }}>
        <textarea style={{ width: "100%", height: "200px" }} value={exportOutput} readOnly={true} />
      </div>
    </div>
  );
};
