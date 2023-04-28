import { NextPage } from "next";
import { ChangeEvent, Dispatch, SetStateAction, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { isAdmin, isLoggedIn } from "http-client/internal-api";
import { getMissions, deleteMission, upsertMission } from "http-client/mission";
import MSV from "components/admin/msv";
import Tools from "components/admin/tools";
import Projection from "components/admin/projection";
import Look from "components/admin/look";
import Panels from "components/admin/panels";
import Time from "components/admin/time";
import styles from "components/admin/admin.module.css";
import { createNewConfig } from "components/admin/helper";
import Header from "components/interface/header";
import FileManager from "components/admin/fileManager";
import adminStyles from "components/admin/admin.module.css";
import { deleteFile } from "http-client/file";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowAltCircleLeft } from "@fortawesome/free-regular-svg-icons";
import { getElevationSinglePoint } from "http-client/elevation";

const Mission: NextPage = () => {
  const router = useRouter();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [editMissionId, setEditMissionId] = useState<number>(); //track mission currently in edit
  const [mission, setMission] = useState<Mission>(); //current mission being edited
  const [admin, setAdmin] = useState<boolean>(false);

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

  return (
    <>
      {admin ? (
        <div className={styles.pageStyle}>
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
            <AddEditMission
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
const AddEditMission = (props: {
  refreshMissionList: () => {};
  mission: Mission;
  setMission: Dispatch<SetStateAction<Mission>>;
}) => {
  const { refreshMissionList, mission, setMission } = { ...props };
  const [config, setConfig] = useState<Config>(createNewConfig());
  const [errorTriggered, setErrorTriggered] = useState<boolean>(false);
  const [tempMission, setTempMission] = useState<string>("");
  const [enableLayerButton, setEnableLayerButton] = useState<boolean>(false);
  useEffect(() => {
    if (props.mission) {
      setConfig(props.mission.config);
    }
  }, [props.mission]);

  //save the mission and call and upsert
  async function saveMission() {
    const missionToSave: Mission = { ...mission, config: config };
    const res = await upsertMission(missionToSave);
    if (res.status === "success") {
      refreshMissionList();
    }
    alert(`${res.status} - ${res.message}`);
  }

  //calculate the lander elevation based on the lander location
  async function calcLanderElevation() {
    if (!mission.landerLocation.lat || !mission.landerLocation.lat) {
      alert("invalid lander location, cannot calculate elevation");
    }

    const radius = parseFloat(mission?.config.msv.radius.minor);
    const measureJson = mission?.config.tools.find((tool) => tool.name === "Measure")?.variables;
    const demFilepath: string = measureJson["dem"];
    const point: AEGISPoint = {
      lat: mission.landerLocation.lat,
      lng: mission.landerLocation.lng,
    };
    const elevation = (await getElevationSinglePoint(mission.id, demFilepath, point, radius)).data;
    setMission({
      ...mission,
      landerElevationMeters: elevation,
    });
  }

  async function updateTempMissionConfig(event: ChangeEvent<HTMLTextAreaElement>) {
    const { value } = event.target;
    setTempMission(value);
  }

  function isValidJsonString(str: string) {
    try {
      JSON.parse(str);
    } catch (e) {
      return false;
    }
    return true;
  }

  return (
    mission && (
      <div className={styles.container}>
        <div className={adminStyles.editMissionDiv}>
          {mission.id ? <h3>Edit Mission &quot;{mission.name}&quot;</h3> : <h3>Add Mission</h3>}
          <button
            type="button"
            onClick={() => {
              saveMission();
            }}
          >
            Save Mission
          </button>
          <br />
          <br />
          <div className={adminStyles.sectionDiv}>
            Manage files in the /Data folder for this mission
            <br />
            <br />
            {mission.id ? (
              <>
                <FileManager path={`missionFiles/${mission.id}/Data`} />
              </>
            ) : (
              <div>A new mission must be saved first before you can upload files</div>
            )}
          </div>
          <br />
          <br />
          <div id="missionDiv">
            <div className={styles.editDiv}>
              <label htmlFor="newName">Mission Name (Parent)</label>
            </div>
            <div className={styles.editDiv}>
              <input
                id="newName"
                type="text"
                onChange={(e) => {
                  setMission({ ...mission, name: e.target.value });
                }}
                value={mission.name}
              />
            </div>
          </div>
          <div id="bannerDiv">
            <div className={styles.editDiv}>
              <label htmlFor="banner">Mission Banner</label>
            </div>
            <div className={styles.editDiv}>
              <input
                id="banner"
                type="text"
                onChange={(e) => {
                  setConfig({ ...config, missionBanner: e.target.value });
                }}
                value={config.missionBanner || ""}
              />
            </div>
          </div>
          <div id="landerLatDiv">
            <div className={styles.editDiv}>
              <label htmlFor="landerLat">Lander Location Latitude</label>
            </div>
            <div className={styles.editDiv}>
              <input
                id="landerLat"
                type="text"
                onChange={(e) => {
                  setMission({
                    ...mission,
                    landerLocation: { ...mission.landerLocation, lat: +e.target.value },
                  });
                }}
                value={mission.landerLocation?.lat || ""}
              />
            </div>
          </div>
          <div id="landerLongDiv">
            <div className={styles.editDiv}>
              <label htmlFor="landerLong">Lander Location Longitude</label>
            </div>
            <div className={styles.editDiv}>
              <input
                id="landerLong"
                type="text"
                onChange={(e) => {
                  setMission({
                    ...mission,
                    landerLocation: { ...mission.landerLocation, lng: +e.target.value },
                  });
                }}
                value={mission.landerLocation?.lng || ""}
              />
            </div>
          </div>
          <div id="landerEleDiv">
            <div className={styles.editDiv}>
              <label htmlFor="landerEle">Lander Elevation</label>
            </div>
            <div className={styles.editDiv}>
              <input
                id="landerEle"
                type="text"
                onChange={(e) => {
                  setMission({
                    ...mission,
                    landerElevationMeters: +e.target.value,
                  });
                }}
                value={mission.landerElevationMeters || ""}
              />{" "}
              <button
                type="button"
                onClick={() => {
                  calcLanderElevation();
                }}
              >
                Calculate
              </button>
            </div>
          </div>
          <div id="traverseDiv">
            <div className={styles.editDiv}>
              <label htmlFor="traverse">Default Traverse Speed</label>
            </div>
            <div className={styles.editDiv}>
              <input
                id="traverse"
                type="text"
                onChange={(e) => {
                  setMission({
                    ...mission,
                    traverseSpeed: +e.target.value,
                  });
                }}
                value={mission.traverseSpeed}
              />
            </div>
          </div>
          <MSV config_msv={config.msv} setConfig={setConfig} />
          <Tools config_tools={config.tools} setConfig={setConfig} />
          <Projection config_projection={config.projection} setConfig={setConfig} />
          <Look config_look={config.look} setConfig={setConfig} />
          <Panels
            config_panels={config.panels}
            config_panelSettings={config.panelSettings}
            setConfig={setConfig}
          />
          <Time config_time={config.time} setConfig={setConfig} />
        </div>
        <div className={styles.rightFlexCenter}>
          <div className={styles.configDiv}>
            <label className={styles.title} htmlFor="configImport">
              <span className={styles.label}>Mission Config (json)</span>
            </label>

            <textarea
              id="configImport"
              className={styles.configImport}
              value={tempMission}
              onChange={updateTempMissionConfig}
            />
            <button
              type="button"
              onClick={() => {
                if (isValidJsonString(tempMission)) {
                  setConfig(JSON.parse(tempMission));
                  setErrorTriggered(false);
                  setEnableLayerButton(true);
                } else {
                  setErrorTriggered(true);
                  setEnableLayerButton(false);
                }
              }}
            >
              Import Json
            </button>
            <button
              type={"button"}
              onClick={() => {
                const tempMissionConfig = JSON.parse(tempMission);
                if (tempMissionConfig.layers) {
                  tempMissionConfig.layers.forEach((layer: any) => {
                    // import the layer into the database
                    const body = {
                      missionId: mission.id,
                      layerConfig: layer,
                    };

                    fetch("/api/layer", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify(body),
                    })
                      .then((res) => res.json())
                      .then((data) => {
                        console.log(data);
                      })
                      .catch((err) => {
                        console.log(err);
                      });
                  });
                }
              }}
              disabled={!enableLayerButton && mission.id !== undefined}
            >
              Import Layers
            </button>
            <span className={styles.errorMessage}>
              {errorTriggered === true ? "Invalid JSON" : ""}
            </span>
          </div>
        </div>
      </div>
    )
  );
};

export default Mission;
