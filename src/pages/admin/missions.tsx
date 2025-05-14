import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { getMissions, deleteMissions, upsertMissions } from "http-client/mission";
import styles from "components/admin/admin.module.css";
import Header from "components/interface/header";
import { deleteFile } from "http-client/file";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowAltCircleLeft } from "@fortawesome/free-regular-svg-icons";
import { isLoggedIn } from "http-client/login";
import { Tooltip } from "react-tooltip";
import { useAppDispatch } from "utils/useAppDispatch";
import { initialState as wholeStoreInitialState } from "store/index";
import { setAllSliceStores } from "store/crossActions";

const Missions: React.FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [user, setUser] = useState<User>(null);

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

  // clear the redux store
  useEffect(() => {
    const populateStoreAsync = async () => {
      /**
       * dispatch a single action to de-populate the stores across all slices using the wholeStoreState
       */
      dispatch(setAllSliceStores(wholeStoreInitialState));
    };
    populateStoreAsync();
    //eslint-disable-next-line
  }, []);

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
          <MissionList missions={missions} user={user} loadMissionsFromDB={loadMissionsFromDB} />
          <button
            type="button"
            onClick={() => {
              navigate("/admin/mission/0");
            }}
            disabled={user?.id !== 1}
          >
            Add New Mission
          </button>
        </div>
      </div>
    </>
  );
};

//component to display the bulleted list of missions
const MissionList = (props: { missions: Mission[]; user: User; loadMissionsFromDB: Function }) => {
  const navigate = useNavigate();
  const permissionList = props.user?.permissionList;

  async function delMission(id: number) {
    if (
      confirm(
        `Are you sure you want to delete mission ${id} and all of its GIS data?\nThis cannot be undone!`
      )
    ) {
      const res: WrappedResponse<number[]> = await deleteMissions([id]);
      const fileDelete = await deleteFile(`missionFiles/${id.toString()}`);
      alert(
        `Delete ${res.status} - ${res.message} for missionID ${id}. File delete ${
          fileDelete ? "successful" : "failed"
        }`
      );
      props.loadMissionsFromDB();
    }
  }

  async function archiveMission({ id, archive }: { id: number; archive: boolean }) {
    const mission = props.missions.find((m) => m.id === id);
    if (mission) {
      mission.isArchived = archive;
      await upsertMissions([mission]);
      props.loadMissionsFromDB();
    }
  }

  const listedMissions = (missionType: Mission[]) => {
    return missionType.map((mission: Mission) => {
      if (
        props.user.isSuperAdmin ||
        permissionList.some((p) => p.missionId === mission.id && p.permissions.edit === true)
      ) {
        return (
          <li key={mission.id} style={{ marginBottom: "8px" }}>
            {" "}
            <>
              {mission.name}
              <span className={styles.missionSubtext}>(id: {mission.id})</span>
              <br />
              <button
                type="button"
                onClick={() => {
                  navigate(`/admin/mission/${mission.id}`);
                }}
              >
                Edit Mission
              </button>
              &nbsp;
              <button
                type="button"
                onClick={() => {
                  navigate(`/admin/mission_layers/${mission.id}`);
                }}
              >
                Edit Layers
              </button>
              &nbsp;
              <button
                type="button"
                onClick={() => {
                  navigate(`/admin/mission_stm/${mission.id}`);
                }}
              >
                Edit STM
              </button>
              &nbsp;
              <button
                type="button"
                onClick={() => {
                  navigate(`/admin/mission_grid/${mission.id}`);
                }}
              >
                Edit Grid
              </button>
              &nbsp;
              <button
                type="button"
                onClick={() => {
                  navigate(`/admin/export/${mission.id}`);
                }}
              >
                Export Data
              </button>
              &nbsp;
              <button
                className={styles.duplicateButton}
                type="button"
                onClick={() => {
                  navigate(`/admin/mission_duplicate/${mission.id}`);
                }}
              >
                Duplicate
              </button>
              &nbsp;
              <button
                className={styles.duplicateButton}
                type="button"
                onClick={() => {
                  archiveMission({
                    id: mission.id,
                    archive: !mission.isArchived,
                  });
                }}
              >
                {mission.isArchived ? "Unarchive" : "Archive"}
              </button>
              &nbsp;
              {mission.isArchived && (
                <button
                  className={styles.deleteButton}
                  type="button"
                  onClick={() => {
                    delMission(mission.id);
                  }}
                >
                  Delete Mission
                </button>
              )}
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
    });
  };

  const visibleMissions = props.missions?.filter(
    (mission: Mission) => mission.isArchived == undefined || mission.isArchived == false
  );
  const archivedMissions = props.missions?.filter(
    (missions: Mission) => missions.isArchived == true
  );

  if (props.missions.length > 0) {
    return (
      <div>
        <ul>{listedMissions(visibleMissions)}</ul>
        <h2>Archived Missions:</h2>
        <p>
          Archived missions are not shown in the home page mission list.
          <br />
          Users cannot access archived missions through a direct link. Archived missions will be
          kept compatible with the AEGIS application as new updates occur. This means that you can
          un-archive at any time and view the mission in a future version of AEGIS, but data may be
          transformed or lost as fields/features are changed in future versions
        </p>
        <p>
          The Delete Mission button will permanently delete the mission and all of its GIS data.
          <br />
          This should be used with caution and only if you are sure you will never need the mission
          again. <br />
          There is no undo for the Delete Mission action.
        </p>
        <ul>{listedMissions(archivedMissions)}</ul>
      </div>
    );
  } else {
    return <div>No missions found</div>;
  }
};

export default Missions;
