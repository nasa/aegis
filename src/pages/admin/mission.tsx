import { Dispatch, SetStateAction, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMissions, deleteMissions } from "http-client/mission";
import styles from "components/admin/admin.module.css";
import Header from "components/interface/header";
import { deleteFile } from "http-client/file";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowAltCircleLeft } from "@fortawesome/free-regular-svg-icons";
import MissionEditor from "components/admin/missionEditor";
import { isLoggedIn } from "http-client/login";
import { Tooltip } from "react-tooltip";
import { roundDateToSecond } from "utils/formatting";
import MissionLayers from "components/admin/missionLayers";
import MissionSTM from "components/admin/missionSTM";

const Mission: React.FunctionComponent = () => {
  const navigate = useNavigate();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [editMissionId, setEditMissionId] = useState<number>(); //track mission currently in edit
  const [mission, setMission] = useState<Mission>(null); //current mission being edited
  const [user, setUser] = useState<User>(null);
  const [editingAttr, setEditingAttr] = useState<"Mission" | "Layers" | "STM">(undefined);

  useEffect(() => {
    // put mission id in session so api endpoints don't fail
    sessionStorage.setItem("missionId", mission?.id?.toString());
  }, [mission]);

  const loadMissionsFromDB = useCallback(async () => {
    const missionList = (await getMissions()).data;
    const newMissionList: Mission[] = [];

    for (const thisMission of missionList) {
      newMissionList.push(thisMission);
    }

    //Sort by name
    newMissionList.sort((a, b) => {
      if (a.name.toLowerCase() < b.name.toLowerCase()) {
        return -1;
      } else if (a.name.toLowerCase() > b.name.toLowerCase()) {
        return 1;
      } else {
        return 0;
      }
    });

    setMissions(newMissionList);
  }, []);

  const handleBack = () => {
    navigate("/admin");
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
        navigate("/");
      }
    }

    adminCheck().catch(() => {
      // Something went wrong. Eventually would like a logger here.
    });
  }, [navigate, loadMissionsFromDB]);

  function createNewMission() {
    const newMission: Mission = {
      id: null,
      version: 0,
      name: "",
      description: "",
      missionBanner: "",
      landerLocation: null,
      landerElevationMeters: 0,
      traverseRate: 2,
      sunAzimuth: 0,
      sunAzimuthVisible: false,
      earthAzimuth: 0,
      earthAzimuthVisible: false,
      defaultEvaDuration: 240,
      walkbackRate: 2,
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
      updatedAt: roundDateToSecond(new Date()).toISOString(),
      createdAt: roundDateToSecond(new Date()).toISOString(),
    };

    setMission(newMission);
    setEditingAttr("Mission");
    setEditMissionId(null);
  }

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
            setEditingAttr={setEditingAttr}
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
          {editingAttr === "Mission" && mission && (
            <MissionEditor
              refreshMissionList={loadMissionsFromDB}
              mission={mission}
              setMission={setMission}
            />
          )}
          {editingAttr === "Layers" && mission && <MissionLayers mission={mission} />}
          {editingAttr === "STM" && mission && <MissionSTM mission={mission} />}
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
  setEditingAttr: Dispatch<SetStateAction<string>>;
}) => {
  const navigate = useNavigate();
  const permissionList = props.user?.permissionList;

  async function delMission(id: number) {
    if (confirm("Are you sure you want to delete mission " + id)) {
      const res: WrappedResponse<number[]> = await deleteMissions([id]);
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
                      props.setEditingAttr("Mission");
                    }}
                  >
                    Edit Mission
                  </button>
                  &nbsp;
                  <button
                    type="button"
                    onClick={() => {
                      props.setEditMissionId(mission.id);
                      props.setEditingAttr("Layers");
                    }}
                  >
                    Edit Layers
                  </button>
                  &nbsp;
                  <button
                    type="button"
                    onClick={() => {
                      props.setEditMissionId(mission.id);
                      props.setEditingAttr("STM");
                    }}
                  >
                    Edit STM
                  </button>
                  &nbsp;
                  <button
                    type="button"
                    onClick={() => {
                      navigate(`/admin/export?missionId=${mission.id}`);
                    }}
                  >
                    Export
                  </button>
                  &nbsp;
                  <button
                    className={styles.deleteButton}
                    type="button"
                    onClick={() => {
                      props.setEditingAttr(undefined);
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
