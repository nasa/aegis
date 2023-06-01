import { NextPage } from "next";
import { ChangeEvent, Dispatch, SetStateAction, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { isAdmin, isLoggedIn } from "http-client/internal-api";
import { getMissions, deleteMission, upsertMission } from "http-client/mission";
import styles from "components/admin/admin.module.css";
import { createNewConfig } from "components/admin/helper";
import Header from "components/interface/header";
import { deleteFile } from "http-client/file";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowAltCircleLeft, faTimesCircle } from "@fortawesome/free-regular-svg-icons";
import { getLayers, upsertLayer } from "http-client/layer";
import MissionEditor from "components/admin/missionEditor";
import { isValidJson } from "utils/formatting";
import { Tooltip } from "react-tooltip";

const Mission: NextPage = () => {
  const router = useRouter();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [editMissionId, setEditMissionId] = useState<number>(); //track mission currently in edit
  const [mission, setMission] = useState<Mission>(); //current mission being edited
  const [admin, setAdmin] = useState<boolean>(false);
  const [showImportMission, setShowImportMission] = useState<boolean>(false);
  async function loadMissionsFromDB() {
    const missionList = (await getMissions()).data;
    setMissions(missionList);
  }

  const handleBack = () => {
    router.back();
  };

  useEffect(() => {
    if (editMissionId) {
      setMission(missions.find((mission) => mission.id === editMissionId));
    }
  }, [editMissionId, missions]);

  //on load check login and mission id
  useEffect(() => {
    (async () => {
      const response = await isLoggedIn(); //check user is logged in
      const adminResponse = await isAdmin(); //check user is admin
      if (response.status !== "success" || !adminResponse.data["admin"]) {
        await router.push("/"); //user is not logged in or an admin. Redirect to homepage
      } else {
        setAdmin(true);
      }

      await loadMissionsFromDB();
    })();
  }, [router]);

  function createNewMission() {
    setMission({
      id: null,
      name: "",
      config: createNewConfig(),
      landerLocation: null,
      traverseSpeed: 0,
    });
    setEditMissionId(null);
  }

  const ImportMission = () => {
    const [tempMission, setTempMission] = useState<string>("");
    const [progressBarWidth, setProgressBarWidth] = useState<number>(0);
    const [progressBarText, setProgressBarText] = useState<string>("");
    const [progressBarColor, setProgressBarColor] = useState<string>("#00ff00");

    async function updateTempMissionConfig(event: ChangeEvent<HTMLTextAreaElement>) {
      const { value } = event.target;
      await setTempMission(value);
    }

    async function handleMissionImport(): Promise<void> {
      //First upsert config into mission
      const tempMissionObj = JSON.parse(tempMission);
      const mmgisImport = typeof tempMissionObj.config === "undefined";
      //Make a copy of the layers array so we can delete it from the object
      let tempLayers;
      if (mmgisImport) {
        if (typeof tempMissionObj.msv.layers === "undefined") {
          tempLayers = tempMissionObj.layers;
        } else {
          tempLayers = tempMissionObj.msv.layers;
        }
        delete tempMissionObj.msv.layers;
      } else {
        tempLayers = tempMissionObj.config.layers;
      }

      let body;
      //We have to handle two different types of input, one from MMGIS and one from our own export
      if (mmgisImport) {
        //We can assume this is an MMGIS import
        body = {
          id: null,
          config: tempMissionObj,
          name: tempMissionObj.msv.mission,
          landerLocation: null,
          traverseSpeed: 0,
          landerElevationMeters: null,
        };
      } else {
        //We can assume this is an export from our own system
        body = {
          id: null,
          config: tempMissionObj.config,
          name: tempMissionObj.name,
          landerLocation: tempMissionObj.landerLocation,
          traverseSpeed: tempMissionObj.traverseSpeed,
          landerElevationMeters: tempMissionObj.landerElevationMeters,
        };
      }
      setProgressBarWidth(0);
      setProgressBarText("Importing Mission");
      setProgressBarColor("#00ff00");
      try {
        const newMission = await upsertMission(body);
        setProgressBarWidth(25);
        setProgressBarText("Importing Layers");
        setProgressBarColor("#00ff00");

        tempLayers.forEach((layer: any) => {
          // import the layer into the database
          const body = {
            uuid: null,
            missionId: newMission.data.id,
            layerConfig: layer,
            createdAt: null,
            updatedAt: null,
          };
          upsertLayer(body);
          setProgressBarWidth(50);
          setProgressBarText("Importing Layers");
          setProgressBarColor("#00ff00");
        });

        setProgressBarWidth(100);
        setProgressBarText("Import Finished!");
        setProgressBarColor("#00ff00");
      } catch (e) {
        console.log(e);
        setProgressBarWidth(100);
        setProgressBarText("Error Importing Mission");
        setProgressBarColor("#ff0000");
        return;
      }
      //Refresh Mission List
      await loadMissionsFromDB();
    }

    async function handleMissionExport(): Promise<void> {
      if (!mission) {
        setProgressBarText("No Mission to Export");
        return;
      }
      setProgressBarWidth(0);
      setProgressBarText("Exporting Mission");
      setProgressBarColor("#00ff00");
      // Add the layers to the mission config
      const missionConfig = mission.config;
      setProgressBarWidth(25);
      setProgressBarText("Importing Layers");
      setProgressBarColor("#00ff00");
      const layers = await getLayers(mission.id);

      missionConfig.layers = layers.data.map((layer) => layer.layerConfig);
      //delete uuid from sublayers in layers
      missionConfig.layers.forEach((layer) => {
        layer.sublayers.forEach((sublayer) => {
          delete sublayer.uuid;
        });
      });
      setTempMission(JSON.stringify(mission, null, 2));
      setProgressBarWidth(100);
      setProgressBarText("Export Finished!");
    }

    async function handleMissionDownload(): Promise<void> {
      // Determine if MMGIS or our own export
      if (!tempMission) {
        setProgressBarText("No Mission to Download");
        return;
      }
      const tempMissionObj = JSON.parse(tempMission);
      const mmgisExport = typeof tempMissionObj.config === "undefined";
      setProgressBarWidth(0);
      setProgressBarText("");
      setProgressBarColor("#00ff00");
      try {
        if (tempMission) {
          const tempMissionObj = await JSON.parse(tempMission);
          const element = document.createElement("a");
          const file = new Blob([tempMission], { type: "text/plain" });
          element.href = URL.createObjectURL(file);
          if (mmgisExport) {
            element.download = tempMissionObj.msv.mission + ".json";
          } else {
            element.download = tempMissionObj.name + ".json";
          }
          document.body.appendChild(element); // Required for this to work in FireFox
          element.click();
          //Set Progress Bar and Messages
          setProgressBarWidth(100);
          setProgressBarText("Download Finished!");
          setProgressBarColor("#00ff00");
        } else {
          setProgressBarText("Json Not Found, Hit Export First to Download");
        }
      } catch (e) {
        console.log(e);
        setProgressBarWidth(100);
        setProgressBarText("Error Downloading Mission");
        setProgressBarColor("#ff0000");
        return;
      }
    }

    return (
      <>
        {showImportMission && (
          <div className={styles.importMission}>
            <div className={styles.rightFlexCenter}>
              <div className={styles.configDiv}>
                <FontAwesomeIcon
                  icon={faTimesCircle}
                  size="lg"
                  className={styles.closeButton}
                  onClick={() => {
                    setShowImportMission(false);
                  }}
                />
                <label className={styles.title} htmlFor="configImport">
                  <span className={styles.label}>Import/Export Mission w/(json)</span>
                </label>

                <textarea
                  id="configImport"
                  className={styles.configImport}
                  value={tempMission}
                  onChange={updateTempMissionConfig}
                />
                <div className={styles.progressBarContainer}>
                  <div
                    className={styles.progressBar}
                    style={{ width: `${progressBarWidth}%`, backgroundColor: progressBarColor }}
                  >
                    <div
                      className={styles.progressBarFill}
                      style={{ width: `${progressBarWidth}%`, backgroundColor: progressBarColor }}
                    />
                  </div>
                  <div className={styles.progressBarText}>{progressBarText}</div>
                </div>
                <div className={styles.buttonContainer}>
                  <button
                    type="button"
                    className={styles.importButton}
                    onClick={() => {
                      if (isValidJson(tempMission)) {
                        setProgressBarText("Importing Mission");
                        handleMissionImport();
                      } else {
                        setProgressBarText("Invalid JSON");
                        setProgressBarColor("#ff0000");
                        setProgressBarWidth(100);
                      }
                    }}
                  >
                    Import Json
                  </button>
                  <button
                    className={styles.exportButton}
                    type="button"
                    onClick={() => {
                      handleMissionExport();
                    }}
                  >
                    Export Json
                  </button>
                  <button
                    type={"button"}
                    className={styles.downloadButton}
                    onClick={() => {
                      handleMissionDownload();
                    }}
                  >
                    Download Json
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <>
      {admin ? (
        <div className={styles.pageStyle}>
          <Tooltip id="aegis-tooltip" className={styles.tooltip} />
          <div className={styles.header}>
            <Header />
          </div>
          <div className={styles.bodyContent}>
            <div className={styles.missionBack}>
              <FontAwesomeIcon icon={faArrowAltCircleLeft} size="xl" onClick={handleBack} />
            </div>
            <h2>Missions</h2>
            <MissionList
              missions={missions}
              refreshMissionList={loadMissionsFromDB}
              setEditMissionId={setEditMissionId}
            />
            <button
              type="button"
              onClick={() => {
                createNewMission();
              }}
            >
              Add New Mission (Clear Form)
            </button>
            <button
              className={styles.importButton}
              type="button"
              onClick={() => {
                //Show import Mission Form
                setShowImportMission(!showImportMission);
              }}
            >
              {showImportMission ? "Close Import/Export" : "Open Import/Export"}
            </button>
            <ImportMission />
            <MissionEditor
              refreshMissionList={loadMissionsFromDB}
              mission={mission}
              setMission={setMission}
            />
          </div>
        </div>
      ) : (
        <></>
      )}
    </>
  );
};

//component to display the bulleted list of missions
const MissionList = (props: {
  missions: Mission[];
  refreshMissionList: () => {};
  setEditMissionId: Dispatch<SetStateAction<Number>>;
}) => {
  const router = useRouter();

  async function delMission(id: number) {
    if (confirm("Are you sure you want to delete mission " + id)) {
      const res: WrappedResponse<number> = await deleteMission(id);
      const fileDelete = await deleteFile(`missionFiles/${id.toString()}`);
      alert(
        `Delete ${res.status} - ${res.message} for missionID ${id}. File delete ${
          fileDelete ? "successful" : "failed"
        }`
      );
      props.refreshMissionList(); //reload mission listing in parent component.
    }
  }

  if (props.missions?.length > 0) {
    return (
      <ul>
        {props.missions.map((mission: Mission) => {
          return (
            <li key={mission.id}>
              <>
                {mission.name} (v{mission.version})<br />
                <button
                  type="button"
                  onClick={() => {
                    props.setEditMissionId(mission.id);
                  }}
                >
                  Edit Mission
                </button>
                &nbsp;
                <button
                  type="button"
                  onClick={() => {
                    router.push(`/admin/layers/${mission.id}`);
                  }}
                >
                  Edit Layers
                </button>
                &nbsp;
                <button
                  type="button"
                  onClick={() => {
                    router.push(`/admin/stm/${mission.id}`);
                  }}
                >
                  Edit STM
                </button>
                &nbsp;
                <button
                  className={styles.deleteButton}
                  type="button"
                  onClick={() => {
                    delMission(mission.id);
                  }}
                >
                  Delete Mission
                </button>
              </>
            </li>
          );
        })}
      </ul>
    );
  } else {
    return <div>No missions found</div>;
  }
};

//Add new mission components

export default Mission;
