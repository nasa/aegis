import { NextPage } from "next";
import { Dispatch, SetStateAction, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { getMissions, deleteMission } from "http-client/mission";
import styles from "components/admin/admin.module.css";
import Header from "components/interface/header";
import { deleteFile } from "http-client/file";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowAltCircleLeft } from "@fortawesome/free-regular-svg-icons";
// import { getLayers, upsertLayer } from "http-client/layer";
import MissionEditor from "components/admin/missionEditor";
import { isLoggedIn } from "http-client/login";
// import { validators } from "components/interface/form/formValidators";
import { Tooltip } from "react-tooltip";
// import { v4 as uuidv4 } from "uuid";

const Mission: NextPage = () => {
  const router = useRouter();
  // const mustBeValidJSON = validators.mustBeValidJSON;
  const [missions, setMissions] = useState<Mission[]>([]);
  const [editMissionId, setEditMissionId] = useState<number>(); //track mission currently in edit
  const [mission, setMission] = useState<Mission>(); //current mission being edited
  // const [showImportMission, setShowImportMission] = useState<boolean>(false);
  const [user, setUser] = useState<User>(null);

  const loadMissionsFromDB = useCallback(async () => {
    const missionList = (await getMissions()).data;
    const newMissionList: Mission[] = [];

    for (const thisMission of missionList) {
      newMissionList.push(thisMission);
    }

    setMissions(newMissionList);
  }, []);

  const handleBack = () => {
    router.push("/admin");
  };

  useEffect(() => {
    if (editMissionId) {
      setMission(missions.find((mission) => mission.id === editMissionId));
    }
  }, [editMissionId, missions]);

  //on load check login and mission id
  useEffect(() => {
    async function adminCheck() {
      const response = await isLoggedIn();
      if (
        response.status === "success" &&
        (response.data.user.isAdmin || response.data.user.isSuperAdmin)
      ) {
        setUser(response.data.user);
        await loadMissionsFromDB();
      } else {
        await router.push("/");
      }
    }

    adminCheck().catch(() => {
      // Something went wrong. Eventually would like a logger here.
    });
  }, [router, loadMissionsFromDB]);

  function createNewMission() {
    const newMission: Mission = {
      id: null,
      version: 0,
      name: "",
      description: "",
      missionBanner: "",
      landerLocation: null,
      landerElevationMeters: 0,
      traverseSpeed: 2,
      sunAzimuth: 0,
      sunAzimuthVisible: false,
      earthAzimuth: 0,
      earthAzimuthVisible: false,
      defaultEvaDuration: 240,
      walkbackSpeed: 2,
      equipmentItems: [],
      geographicUnits: [],
      planetRadius: 1737400, // moon
      initialZoom: 14,
      demFilePath: "",
      demResolution: 0,
      projIsCustom: false,
      projEpsg: "",
      projProj4String: "",
      projBoundsMinX: 0,
      projBoundsMinY: 0,
      projBoundsMaxX: 0,
      projBoundsMaxY: 0,
      projOriginX: 0,
      projOriginY: 0,
      projResZoomLevel: 0,
      projResUnitsPerPixel: 0,
      landerRadii: [],
      actionTemplates: null,
    };

    setMission(newMission);
    setEditMissionId(null);
  }

  // const ImportMission = () => {
  //   const [tempMission, setTempMission] = useState<string>("");
  //   const [progressBarWidth, setProgressBarWidth] = useState<number>(0);
  //   const [progressBarText, setProgressBarText] = useState<string>("");
  //   const [progressBarColor, setProgressBarColor] = useState<string>("#00ff00");

  //   async function updateTempMissionConfig(event: ChangeEvent<HTMLTextAreaElement>) {
  //     const { value } = event.target;
  //     setTempMission(value);
  //   }

  //   async function handleMissionImport(): Promise<void> {
  //     //First upsert config into mission
  //     const tempMissionObj = JSON.parse(tempMission);
  //     const mmgisImport = typeof tempMissionObj.config === "undefined";
  //     //Make a copy of the layers array so we can delete it from the object
  //     let tempLayers: LayerConfig[];
  //     if (mmgisImport) {
  //       tempLayers = tempMissionObj.layers;
  //     } else {
  //       tempLayers = tempMissionObj.config.layers;
  //     }

  //     let body: Mission;
  //     //We have to handle two different types of input, one from MMGIS and one from our own export
  //     if (mmgisImport) {
  //       //We can assume this is an MMGIS import
  //       body = {
  //         id: null,
  //         version: 0,
  //         config: tempMissionObj,
  //         name: tempMissionObj.msv.mission,
  //         description: null,
  //         missionBanner: "",
  //         landerLocation: null,
  //         traverseSpeed: 0,
  //         walkbackSpeed: 0,
  //         landerElevationMeters: null,
  //         sunAzimuth: null,
  //         earthAzimuth: null,
  //         sunAzimuthVisible: false,
  //         earthAzimuthVisible: false,
  //         defaultEvaDuration: 240,
  //         equipmentItems: [],
  //         geographicUnits: [],
  //         planetRadius: 1737400, // moon
  //         initialZoom: 14,
  //         demFilePath: "",
  //         demResolution: 0,
  //         projIsCustom: false,
  //         projEpsg: "",
  //         projProj4String: "",
  //         projBoundsMinX: 0,
  //         projBoundsMinY: 0,
  //         projBoundsMaxX: 0,
  //         projBoundsMaxY: 0,
  //         projOriginX: 0,
  //         projOriginY: 0,
  //         projResZoomLevel: 0,
  //         projResUnitsPerPixel: 0,
  //       };
  //     } else {
  //       //We can assume this is an export from our own system
  //       body = {
  //         id: null,
  //         version: tempMissionObj.version,
  //         config: tempMissionObj.config,
  //         name: tempMissionObj.name,
  //         description: tempMissionObj.description,
  //         missionBanner: tempMissionObj.missionBanner,
  //         landerLocation: tempMissionObj.landerLocation,
  //         traverseSpeed: tempMissionObj.traverseSpeed,
  //         walkbackSpeed: tempMissionObj.walkbackSpeed,
  //         landerElevationMeters: tempMissionObj.landerElevationMeters,
  //         sunAzimuth: tempMissionObj.sunAzimuth,
  //         earthAzimuth: tempMissionObj.earthAzimuth,
  //         sunAzimuthVisible: tempMissionObj.sunAzimuthVisible,
  //         earthAzimuthVisible: tempMissionObj.earthAzimuthVisible,
  //         defaultEvaDuration: tempMissionObj.defaultEvaDuration,
  //         equipmentItems: tempMissionObj.equipmentItems,
  //         geographicUnits: tempMissionObj.geographicUnits,
  //         planetRadius: tempMissionObj.planetRadius,
  //         initialZoom: tempMissionObj.initialZoom,
  //         demFilePath: tempMissionObj.demFilePath,
  //         demResolution: tempMissionObj.demResolution,
  //         projIsCustom: tempMissionObj.projIsCustom,
  //         projEpsg: tempMissionObj.projEpsg,
  //         projProj4String: tempMissionObj.projProj4String,
  //         projBoundsMinX: tempMissionObj.projBoundsMinX,
  //         projBoundsMinY: tempMissionObj.projBoundsMinY,
  //         projBoundsMaxX: tempMissionObj.projBoundsMaxX,
  //         projBoundsMaxY: tempMissionObj.projBoundsMaxY,
  //         projOriginX: tempMissionObj.projOriginX,
  //         projOriginY: tempMissionObj.projOriginY,
  //         projResZoomLevel: tempMissionObj.projResZoomLevel,
  //         projResUnitsPerPixel: tempMissionObj.projResUnitsPerPixel,
  //       };
  //     }
  //     try {
  //       setProgressBarWidth(0);
  //       setProgressBarText("Importing Mission");
  //       const newMission = await upsertMission(body);

  //       setProgressBarWidth(25);
  //       setProgressBarText("Importing Layers");
  //       tempLayers.forEach((layer) => {
  //         // import the layers
  //         const body: Layer = {
  //           uuid: uuidv4(),
  //           missionId: newMission.data.id,
  //           layerConfig: layer,
  //           createdAt: null,
  //           updatedAt: null,
  //         };
  //         upsertLayer(body);
  //         setProgressBarWidth(50);
  //         setProgressBarText("Importing Layers");
  //       });

  //       setProgressBarWidth(100);
  //       setProgressBarText("Import Finished!");
  //     } catch (e) {
  //       console.log(e);
  //       setProgressBarWidth(100);
  //       setProgressBarText("Error Importing Mission");
  //       setProgressBarColor("#ff0000");
  //       return;
  //     }
  //     //Refresh Mission List
  //     await loadMissionsFromDB();
  //   }

  //   async function handleMissionExport(): Promise<void> {
  //     if (!mission) {
  //       setProgressBarText("No Mission to Export");
  //       return;
  //     }
  //     setProgressBarWidth(0);
  //     setProgressBarText("Exporting Mission");
  //     setProgressBarColor("#00ff00");
  //     // Add the layers to the mission config
  //     const missionConfig = mission.config;
  //     setProgressBarWidth(25);
  //     setProgressBarText("Importing Layers");
  //     setProgressBarColor("#00ff00");
  //     const layers = await getLayers(mission.id);

  //     missionConfig.layers = layers.data.map((layer) => layer.layerConfig);
  //     //delete uuid from sublayers in layers
  //     missionConfig.layers.forEach((layer) => {
  //       layer.sublayers.forEach((sublayer) => {
  //         delete sublayer.uuid;
  //       });
  //     });
  //     // Add Metadata to the mission config
  //     setProgressBarWidth(50);
  //     setProgressBarText("Creating Metadata");
  //     setProgressBarColor("#00ff00");
  //     mission._metadata = {
  //       name: mission.name,
  //       file_description: "Exported from AEGIS",
  //       file_owner: "AEGIS",
  //       public: true,
  //       hidden: false,
  //     };

  //     setTempMission(JSON.stringify(mission, null, 2));
  //     setProgressBarWidth(100);
  //     setProgressBarText("Export Finished!");
  //   }

  //   async function handleMissionDownload(): Promise<void> {
  //     // Determine if MMGIS or our own export
  //     if (!tempMission) {
  //       setProgressBarText("No Mission to Download");
  //       return;
  //     }
  //     const tempMissionObj = JSON.parse(tempMission);
  //     const mmgisExport = typeof tempMissionObj.config === "undefined";
  //     setProgressBarWidth(0);
  //     setProgressBarText("");
  //     setProgressBarColor("#00ff00");
  //     try {
  //       if (tempMission) {
  //         const tempMissionObj = await JSON.parse(tempMission);
  //         const element = document.createElement("a");
  //         const file = new Blob([tempMission], { type: "text/plain" });
  //         element.href = URL.createObjectURL(file);
  //         if (mmgisExport) {
  //           element.download = tempMissionObj.msv.mission + ".json";
  //         } else {
  //           element.download = tempMissionObj.name + ".json";
  //         }
  //         document.body.appendChild(element); // Required for this to work in FireFox
  //         element.click();
  //         //Set Progress Bar and Messages
  //         setProgressBarWidth(100);
  //         setProgressBarText("Download Finished!");
  //         setProgressBarColor("#00ff00");
  //       } else {
  //         setProgressBarText("Json Not Found, Hit Export First to Download");
  //       }
  //     } catch (e) {
  //       console.log(e);
  //       setProgressBarWidth(100);
  //       setProgressBarText("Error Downloading Mission");
  //       setProgressBarColor("#ff0000");
  //       return;
  //     }
  //   }

  //   return (
  //     <>
  //       {showImportMission && (
  //         <div className={styles.importMission}>
  //           <div className={styles.rightFlexCenter}>
  //             <div className={styles.configDiv}>
  //               <FontAwesomeIcon
  //                 icon={faTimesCircle}
  //                 size="lg"
  //                 className={styles.closeButton}
  //                 onClick={() => {
  //                   setShowImportMission(false);
  //                 }}
  //               />
  //               <label className={styles.title} htmlFor="configImport">
  //                 <span className={styles.label}>Import/Export Mission w/(json)</span>
  //               </label>

  //               <textarea
  //                 id="configImport"
  //                 className={styles.configImport}
  //                 value={tempMission}
  //                 onChange={updateTempMissionConfig}
  //               />
  //               <div className={styles.progressBarContainer}>
  //                 <div
  //                   className={styles.progressBar}
  //                   style={{ width: `${progressBarWidth}%`, backgroundColor: progressBarColor }}
  //                 >
  //                   <div
  //                     className={styles.progressBarFill}
  //                     style={{ width: `${progressBarWidth}%`, backgroundColor: progressBarColor }}
  //                   />
  //                 </div>
  //                 <div className={styles.progressBarText}>{progressBarText}</div>
  //               </div>
  //               <div className={styles.buttonContainer}>
  //                 <button
  //                   type="button"
  //                   className={styles.importButton}
  //                   onClick={() => {
  //                     if (tempMission.length && mustBeValidJSON(tempMission) === undefined) {
  //                       setProgressBarText("Importing Mission");
  //                       // handleMissionImport();
  //                     } else {
  //                       setProgressBarText("Invalid JSON");
  //                       setProgressBarColor("#ff0000");
  //                       setProgressBarWidth(100);
  //                     }
  //                   }}
  //                 >
  //                   Import Json
  //                 </button>
  //                 <button
  //                   className={styles.exportButton}
  //                   type="button"
  //                   onClick={() => {
  //                     // handleMissionExport();
  //                   }}
  //                 >
  //                   Export Json
  //                 </button>
  //                 <button
  //                   type={"button"}
  //                   className={styles.downloadButton}
  //                   onClick={() => {
  //                     // handleMissionDownload();
  //                   }}
  //                 >
  //                   Download Json
  //                 </button>
  //               </div>
  //             </div>
  //           </div>
  //         </div>
  //       )}
  //     </>
  //   );
  // };

  return (
    <>
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
            user={user}
            refreshMissionList={loadMissionsFromDB}
            setEditMissionId={setEditMissionId}
          />
          <button
            type="button"
            onClick={() => {
              createNewMission();
            }}
            disabled={user?.id !== 1}
          >
            Add New Mission (Clear Form)
          </button>
          &nbsp;
          {/* <button
            type="button"
            onClick={() => {
              //Show import Mission Form
              setShowImportMission(!showImportMission);
            }}
            disabled={user?.id !== 1}
          >
            {showImportMission ? "Close Import/Export" : "Open Import/Export"}
          </button>
          <ImportMission /> */}
          <MissionEditor
            refreshMissionList={loadMissionsFromDB}
            mission={mission}
            setMission={setMission}
          />
        </div>
      </div>
    </>
  );
};

//component to display the bulleted list of missions
const MissionList = (props: {
  missions: Mission[];
  user: User;
  refreshMissionList: () => {};
  setEditMissionId: Dispatch<SetStateAction<Number>>;
}) => {
  const router = useRouter();
  const permissionList = props.user?.permissionList;

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
          if (
            props.user.isSuperAdmin ||
            permissionList.some((p) => p.missionId === mission.id && p.permissions.edit === true)
          ) {
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
          } else {
            return (
              <li key={mission.id}>
                <>
                  <span className={styles.noPermission}>
                    {mission.name} (v{mission.version}) [No Edit Permissions]
                  </span>
                </>
              </li>
            );
          }
        })}
      </ul>
    );
  } else {
    return <div>No missions found</div>;
  }
};

export default Mission;
