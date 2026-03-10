import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { createMission, deleteMissions } from "http-client/mission";
import styles from "components/admin/admin.module.css";
import Header from "components/interface/header";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowAltCircleLeft } from "@fortawesome/free-regular-svg-icons";
import { isLoggedIn } from "http-client/login";
import { Tooltip } from "react-tooltip";
import { useAppDispatch } from "utils/useAppDispatch";
import { initialState as wholeStoreInitialState } from "store/index";
import { setAllSliceStores } from "store/crossActions";
import { getAutomergeDocListing } from "http-client/docListing";
import { useRepo } from "@automerge/automerge-repo-react-hooks";
import type { AutomergeUrl, Repo } from "@automerge/automerge-repo";

const Missions: React.FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const automergeRepo = useRepo();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [automergeDocListings, setAutomergeDocListings] = useState<AutomergeDocListing[]>([]);
  const [user, setUser] = useState<AppUser | null>(null);

  const loadMissions = useCallback(async () => {
    // get missions from automerge db table
    const docListings = (await getAutomergeDocListing()).data;
    if (docListings) setAutomergeDocListings(docListings);

    // get missions from automerge
    const missionPromises = docListings.map(async (listing) => {
      const missionDocHandle: DocHandle<Mission> = await automergeRepo.find(
        listing.automergeUrl as AutomergeUrl
      );
      await missionDocHandle.whenReady();
      return missionDocHandle.doc();
    });
    const allMissions = await Promise.all(missionPromises);
    if (!allMissions) return;

    //Sort by name
    allMissions.sort((a, b) => {
      if (a.name.toLowerCase() < b.name.toLowerCase()) {
        return -1;
      } else if (a.name.toLowerCase() > b.name.toLowerCase()) {
        return 1;
      } else {
        return 0;
      }
    });
    setMissions(allMissions);
  }, [automergeRepo]);

  const handleBack = () => {
    navigate("/admin");
  };

  //on load check login and mission id
  useEffect(() => {
    async function isLoggedInAsync() {
      const response = await isLoggedIn();
      if (
        response.status === "success" &&
        (response.data?.isAdmin || response.data?.isSuperAdmin)
      ) {
        setUser(response.data);
        await loadMissions();
      } else {
        navigate("/");
      }
    }
    isLoggedInAsync();
  }, [navigate, loadMissions]);

  // clear the redux store
  useEffect(() => {
    const clearStoreAsync = async () => {
      /**
       * dispatch a single action to de-populate the stores across all slices using the wholeStoreState
       */
      dispatch(setAllSliceStores(wholeStoreInitialState));
    };
    clearStoreAsync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <MissionList
            missions={missions}
            automergeDocListings={automergeDocListings}
            user={user}
            loadMissions={loadMissions}
            automergeRepo={automergeRepo}
          />
          <button
            type="button"
            onClick={async () => {
              const res = await createMission();
              if (res.status != "success") {
                alert(`Error creating automerge record: ${res.message}`);
                return;
              } else if (res.data) {
                navigate(`/admin/mission/${res.data.missionId}/${res.data.automergeUrl}`);
              }
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
const MissionList = ({
  missions,
  automergeDocListings,
  user,
  loadMissions,
  automergeRepo,
}: {
  missions: Mission[];
  automergeDocListings: AutomergeDocListing[];
  user: AppUser | null;
  loadMissions: Function;
  automergeRepo: Repo;
}) => {
  const navigate = useNavigate();
  const permissionList = user?.permissionList;

  async function delMissionAndAutomerge(missionId: number | null) {
    if (!missionId) return;
    if (
      confirm(
        `Are you sure you want to delete mission ${missionId} and all of its GIS data? This will also delete the automerge doc listing.\nThis cannot be undone!`
      )
    ) {
      try {
        const res: WrappedResponse<number[]> = await deleteMissions([missionId]);
        alert(`Delete ${res.status} - ${res.message} for missionID ${missionId}.`);
        loadMissions();
      } catch (e) {
        alert("Error in deleting mission: " + e);
      }
    }
  }

  async function archiveMission({ id, archive }: { id: number; archive: boolean }) {
    const mission = missions.find((m) => m.id === id);
    if (mission) {
      // get automerge URL
      const automergeUrl = automergeDocListings.find(
        (listing) => listing.missionId === id
      )?.automergeUrl;
      if (!automergeUrl) {
        alert("No automerge URL found for mission " + id);
        return;
      }
      const missionDocHandle = await automergeRepo.find<Mission>(automergeUrl as AutomergeUrl);
      if (missionDocHandle) {
        missionDocHandle.change((mission: Mission) => {
          mission.isArchived = archive;
          mission.updatedAt = new Date().getTime();
        });
      }
      loadMissions();
    }
  }

  const listedMissions = (missionType: Mission[]) => {
    return missionType.map((mission: Mission) => {
      if (
        user?.isSuperAdmin ||
        permissionList?.some((p) => p.missionId === mission.id && p.permissions.edit === true)
      ) {
        const automergeUrlForMission =
          automergeDocListings.find((ar) => ar.missionId === mission.id)?.automergeUrl || "";
        return (
          <li key={mission.id} style={{ marginBottom: "8px" }}>
            <>
              {mission.name}
              <span className={styles.missionSubtext}>(id: {mission.id})</span>
              <br />
              <button
                type="button"
                onClick={() => {
                  navigate(`/admin/mission/${mission.id}/${automergeUrlForMission}`);
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
                    delMissionAndAutomerge(mission.id);
                  }}
                >
                  Delete Mission
                </button>
              )}
              <div>
                Automerge:&nbsp;&nbsp;
                <>
                  <button
                    type="button"
                    onClick={() => {
                      navigate(`/admin/automerge/${automergeUrlForMission}`);
                    }}
                  >
                    Manage
                  </button>
                  &nbsp;
                  {automergeUrlForMission}
                </>
              </div>
            </>
          </li>
        );
      } else {
        return (
          <li key={mission.id}>
            <>
              <span className={styles.noPermission}>{mission.name} [No Edit Permissions]</span>
            </>
          </li>
        );
      }
    });
  };

  const visibleMissions = missions?.filter(
    (mission: Mission) => mission.isArchived == undefined || mission.isArchived == false
  );
  const archivedMissions = missions?.filter((missions: Mission) => missions.isArchived == true);

  if (missions.length > 0) {
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
