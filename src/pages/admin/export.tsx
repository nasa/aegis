import { populateStore } from "store/processing/populateStore";
import _ from "lodash";
import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { deepEqual, useAppSelector } from "utils/useAppSelector";
import styles from "components/admin/admin.module.css";
import { Checkbox } from "components/interface/form/globalFields";
import { isLoggedIn } from "http-client/login";
import { getMissions } from "http-client/mission";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkMakeExportString } from "store/thunk/thunkMission";
import { setAllSliceStores } from "store/crossActions";
import Header from "components/interface/header";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowAltCircleLeft } from "@fortawesome/free-regular-svg-icons";

type RouteParams = {
  id: string;
};

const ExportPage: React.FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const params = useParams<RouteParams>();
  const slug = params.id;
  const intMissionId = parseInt(slug);

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
    const isLoggedInAsync = async () => {
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
    };
    isLoggedInAsync();
  }, [navigate, intMissionId]);

  useEffect(() => {
    const populateStoreAsync = async () => {
      const wholeStoreState = await populateStore({ missionId: intMissionId, runAudit: false });
      /**
       * dispatch a single action to populate the stores across all slices using the wholeStoreState
       */
      dispatch(setAllSliceStores(wholeStoreState));
    };
    populateStoreAsync();
    //eslint-disable-next-line
  }, []);

  if (!intMissionId) return <div>No missionId provided</div>;

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
        </div>
      </div>
    </>
  );
};

export default ExportPage;
