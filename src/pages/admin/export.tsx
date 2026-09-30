import { populateStore } from "store/processing/populateStore";
import { Link, useNavigate, useParams } from "react-router";
import { useEffect, useState } from "react";
import { refEqual } from "utils/useAppSelector";

import { isLoggedIn } from "http-client/login";
import { dumpMission } from "http-client/mission";
import { useAppDispatch } from "utils/useAppDispatch";
import { setAllSliceStores } from "store/crossActions";
import { useMissionDocSelector } from "utils/useDocSelector";
import { useRepo } from "@automerge/automerge-repo-react-hooks";
import adminCommon from "./adminCommon.module.css";
import { makeExportString } from "utils/export";

type RouteParams = {
  id: string;
};

const ExportPage: React.FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const automergeRepo = useRepo();

  const params = useParams<RouteParams>();
  const slug = params.id;
  const intMissionId = parseInt(slug);

  const missionName = useMissionDocSelector((mission) => mission.name, refEqual);
  const mission = useMissionDocSelector((mission) => mission, refEqual);

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
        const user = response.data;
        if (!(user.isAdmin || user.isSuperAdmin)) {
          navigate("/"); //Redirect to homepage
        }
      } else {
        navigate("/");
      }
    })();
  }, [navigate]);

  useEffect(() => {
    (async () => {
      const wholeStoreState = await populateStore({
        missionId: intMissionId,
        runAudit: false,
        automergeRepo,
      });
      /**
       * dispatch a single action to populate the stores across all slices using the wholeStoreState
       */
      dispatch(setAllSliceStores(wholeStoreState));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin/missions" className={adminCommon.backLink}>
          â† Missions
        </Link>
        <h1 className={adminCommon.pageTitle}>Export Mission</h1>
        {missionName && (
          <div className={adminCommon.missionSubheader}>
            <span className={adminCommon.missionSubheaderLabel}>Mission</span>
            <span className={adminCommon.missionSubheaderName}>{missionName}</span>
          </div>
        )}

        <section className={adminCommon.section}>
          <h2>Export</h2>
          <div className={adminCommon.details}>
            <p className={adminCommon.descriptionText}>Select parts of mission data to export:</p>
            <div className={adminCommon.checkboxGroup} style={{ userSelect: "none" }}>
              <label className={adminCommon.checkboxItem}>
                <input
                  type="checkbox"
                  id="export-all-evas"
                  checked={selectEvas}
                  onChange={() => setSelectEvas(!selectEvas)}
                />
                All EVAs (including stations with associated actions and traverses)
              </label>
              <label className={adminCommon.checkboxItem}>
                <input
                  type="checkbox"
                  id="export-pois"
                  checked={selectPois}
                  onChange={() => setSelectPois(!selectPois)}
                />
                All POIs (including associated actions)
              </label>
              <label className={adminCommon.checkboxItem}>
                <input
                  type="checkbox"
                  id="export-stations"
                  checked={selectStations}
                  onChange={() => setSelectStations(!selectStations)}
                />
                All Stations (including associated actions)
              </label>
              <label className={adminCommon.checkboxItem}>
                <input
                  type="checkbox"
                  id="export-actions"
                  checked={selectActions}
                  onChange={() => setSelectActions(!selectActions)}
                />
                All Actions (including associated STMs)
              </label>
              <label className={adminCommon.checkboxItem}>
                <input
                  type="checkbox"
                  id="export-traverses"
                  checked={selectTraverses}
                  onChange={() => setSelectTraverses(!selectTraverses)}
                />
                All Traverses
              </label>
              <label className={adminCommon.checkboxItem}>
                <input
                  type="checkbox"
                  id="export-mission"
                  checked={selectMission}
                  onChange={() => setSelectMission(!selectMission)}
                />
                Mission Details
              </label>
              <label className={adminCommon.checkboxItem}>
                <input
                  type="checkbox"
                  id="export-rexes"
                  checked={selectRexes}
                  onChange={() => setSelectRexes(!selectRexes)}
                />
                All Real-time Execution Items (REXes)
              </label>
            </div>
            <div className={adminCommon.formActions}>
              <button
                className={adminCommon.button}
                onClick={() => {
                  const makeExportStringAsync = async () => {
                    const output = makeExportString({
                      mission,
                      selectEvas,
                      selectMission,
                      selectPois,
                      selectStations,
                      selectActions,
                      selectTraverses,
                      selectRexes,
                    });
                    setSelectedOutput(output);
                  };
                  makeExportStringAsync();
                }}
              >
                Export JSON to Text Field
              </button>
              <button
                className={adminCommon.button}
                onClick={() => {
                  const makeExportStringAsync = async () => {
                    const output = makeExportString({
                      mission,
                      selectEvas,
                      selectMission,
                      selectPois,
                      selectStations,
                      selectActions,
                      selectTraverses,
                      selectRexes,
                    });
                    setSelectedOutput(output);

                    const element = document.createElement("a");
                    const file = new Blob([output], { type: "text/json" });
                    element.href = URL.createObjectURL(file);
                    let filename = `${missionName}_`;
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
                  };
                  makeExportStringAsync();
                }}
              >
                Export JSON to File
              </button>
            </div>
            <textarea className={adminCommon.logTextarea} value={selectedOutput} readOnly={true} />
          </div>
        </section>

        <section className={adminCommon.section}>
          <h2>Database Dump</h2>
          <div className={adminCommon.details}>
            <p className={adminCommon.descriptionText}>
              This will create a JSON file that represents the raw content of the database for the
              selected mission. The JSON file will include all entities related to the mission.
              <br /> Note that there is no &quot;import&quot; functionality for this data.
            </p>
            <div className={adminCommon.formActions}>
              <button
                className={adminCommon.buttonPrimary}
                type="button"
                onClick={async () => {
                  try {
                    const response = await dumpMission(intMissionId);
                    if (response.status === "success" && response.data) {
                      const jsonString = JSON.stringify(response.data, null, 2);
                      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
                      const filename = `mission_${intMissionId}_dump_${timestamp}.json`;

                      const element = document.createElement("a");
                      const file = new Blob([jsonString], { type: "application/json" });
                      element.href = URL.createObjectURL(file);
                      element.download = filename;
                      document.body.appendChild(element);
                      element.click();
                      document.body.removeChild(element);
                    } else {
                      alert(`Error: ${response.message || "Unknown error occurred"}`);
                    }
                  } catch (error) {
                    console.error("Dump failed:", error);
                    alert("Error dumping mission. Please try again.");
                  }
                }}
              >
                Dump Mission to JSON File
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

export default ExportPage;
