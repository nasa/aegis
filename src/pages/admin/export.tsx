import PopulateStore from "components/interface/page/populateStore";
import _ from "lodash";
import { useNavigate, useLocation } from "react-router-dom";
import { FunctionComponent, useEffect, useState } from "react";
import { deepEqual, useAppSelector } from "utils/useAppSelector";
import styles from "components/admin/admin.module.css";
import { Checkbox } from "components/interface/form/globalFields";
import { isLoggedIn } from "http-client/login";
import { getMissions } from "http-client/mission";

import * as httpClient_log from "http-client/log";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkMakeExportString } from "store/thunk/thunkMission";

const useQuery = () => {
  return new URLSearchParams(useLocation().search);
};

const ExportPage: React.FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const query = useQuery();
  const missionId = query.get("missionId");
  const intMissionId = missionId ? parseInt(missionId as string) : null;

  const missionStore = useAppSelector((state) => state.mission, deepEqual);
  const [selectedOutput, setSelectedOutput] = useState("");
  const [selectEvas, setSelectEvas] = useState(true);
  const [selectMission, setSelectMission] = useState(false);
  const [selectPois, setSelectPois] = useState(false);
  const [selectStations, setSelectStations] = useState(false);
  const [selectActions, setSelectActions] = useState(false);
  const [selectTraverses, setSelectTraverses] = useState(false);
  const [selectRexes, setSelectRexes] = useState(false);

  //on load check login and mission id
  useEffect(() => {
    (async () => {
      const response = await isLoggedIn();
      if (response.status === "success") {
        const user = response.data.user;
        if (!(user.isAdmin || user.isSuperAdmin)) {
          navigate("/admin"); //Redirect to homepage
        }
      } else {
        navigate("/admin");
      }

      const missions = (await getMissions()).data;
      if (!missions.find((m) => m.id === intMissionId)) navigate("/admin");
    })();
  }, [navigate, intMissionId]);

  if (!intMissionId) return <div>No missionId provided</div>;

  return (
    <>
      <div className={styles.pageStyle}>
        <h1>Export</h1>
        <div style={{ marginBottom: "5px" }}>Mission: {missionStore.mission?.name}</div>
        <div style={{ userSelect: "none" }}>
          <div>Select parts of mission data to export:</div>
          <Checkbox
            label="All EVAs (including stations with associated actions and traverses)"
            checked={selectEvas}
            onChange={() => setSelectEvas(!selectEvas)}
            uniqueId="export-all-evas"
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
          <Checkbox
            label="All Real-time Execution Items (REXes)"
            checked={selectRexes}
            onChange={() => setSelectRexes(!selectRexes)}
            uniqueId="export-rexes"
          />
          <button
            onClick={() => {
              (async () => {
                const output = await dispatch(
                  thunkMakeExportString({
                    selectEvas,
                    selectMission,
                    selectPois,
                    selectStations,
                    selectActions,
                    selectTraverses,
                    selectRexes,
                  })
                );
                setSelectedOutput(output.payload as string);
              })();
            }}
          >
            Export as JSON to Text Field
          </button>
          <button
            onClick={() => {
              (async () => {
                const output = await dispatch(
                  thunkMakeExportString({
                    selectEvas,
                    selectMission,
                    selectPois,
                    selectStations,
                    selectActions,
                    selectTraverses,
                    selectRexes,
                  })
                );
                setSelectedOutput(output.payload as string);

                const element = document.createElement("a");
                const file = new Blob([output.payload as string], { type: "text/json" });
                element.href = URL.createObjectURL(file);
                let filename = `${missionStore.mission?.name}_`;
                if (selectEvas) filename += "evas_";
                if (selectMission) filename += "mission_";
                if (selectPois) filename += "pois_";
                if (selectStations) filename += "stations_";
                if (selectActions) filename += "actions_";
                if (selectTraverses) filename += "traverses_";
                if (selectRexes) filename += "rexes_";
                filename += "export.json";
                element.download = filename;
                document.body.appendChild(element); // Required for this to work in FireFox
                element.click();
              })();
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
          payloadJson: log.payloadJson,
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
                const response = await httpClient_log.deleteAllLogs([missionId]);
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
