import { populateStore } from "store/processing/populateStore";
import { useNavigate, useParams } from "react-router";
import { useEffect, useState } from "react";
import { refEqual } from "utils/useAppSelector";
import styles from "components/admin/admin.module.css";
import { Checkbox } from "components/interface/form/globalFields";
import { isLoggedIn } from "http-client/login";
import { dumpMission } from "http-client/mission";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkMakeExportString } from "store/thunk/thunkMission";
import { setAllSliceStores } from "store/crossActions";
import Header from "components/interface/header";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowAltCircleLeft } from "@fortawesome/free-regular-svg-icons";
import { useMissionDocSelector } from "utils/useDocSelector";
import { useRepo } from "@automerge/automerge-repo-react-hooks";

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

  const missionName = useMissionDocSelector((doc) => doc.name, refEqual);

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
    <>
      <div className={styles.pageStyle}>
        <div className={styles.header}>
          <Header />
        </div>
        <div className={styles.bodyContent}>
          <div className={styles.missionBack}>
            <FontAwesomeIcon
              icon={faArrowAltCircleLeft}
              size="xl"
              onClick={() => {
                navigate("/admin/missions");
              }}
            />
          </div>
          <h1>Export</h1>
          <div style={{ marginBottom: "5px" }}>Mission: {missionName}</div>
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
                const makeExportStringAsync = async () => {
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
                };
                makeExportStringAsync();
              }}
            >
              Export as JSON to Text Field
            </button>
            <button
              onClick={() => {
                const makeExportStringAsync = async () => {
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
          <h4>Dump Entire Database To JSON</h4>
          <p>
            This will create a JSON file that represents the raw content of the database for the
            selected mission. The JSON file will include all entities related to the mission.
            <br /> Note that there is no "import" functionality for this data.
          </p>
          <button
            className={styles.duplicateButton}
            type="button"
            onClick={async () => {
              try {
                const response = await dumpMission(intMissionId);
                if (response.status === "success" && response.data) {
                  // Create and download the file
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
            Dump
          </button>
        </div>
      </div>
    </>
  );
};

export default ExportPage;
