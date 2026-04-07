import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { createMission, deleteMissions } from "http-client/mission";
import { isLoggedIn } from "http-client/login";
import { Tooltip } from "react-tooltip";
import { useAppDispatch } from "utils/useAppDispatch";
import { initialState as wholeStoreInitialState } from "store/index";
import { setAllSliceStores } from "store/crossActions";
import { getAutomergeDocListing } from "http-client/docListing";
import { useRepo } from "@automerge/automerge-repo-react-hooks";
import type { AutomergeUrl, Repo } from "@automerge/automerge-repo";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretDown, faCaretRight, faRocket } from "@fortawesome/free-solid-svg-icons";
import adminCommon from "./adminCommon.module.css";
import styles from "./missions.module.css";

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
    <main className={adminCommon.page}>
      <Tooltip
        id="aegis-tooltip"
        style={{
          zIndex: 900,
          backgroundColor: "black",
          color: "white",
          maxWidth: 300,
          opacity: 1,
          fontSize: "0.8rem",
          padding: 10,
        }}
      />
      <div className={adminCommon.container}>
        <Link to="/admin" className={adminCommon.backLink}>
          ← Admin
        </Link>
        <h1 className={adminCommon.pageTitle}>Missions</h1>
        <div className={styles.missionPageHeader}>
          <p className={adminCommon.introText}>
            Manage existing missions or create new ones. Each mission contains GIS data, layers, and
            configuration.
          </p>
          <button
            className={adminCommon.buttonPrimary}
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
            + Add New Mission
          </button>
        </div>
        <MissionList
          missions={missions}
          automergeDocListings={automergeDocListings}
          user={user}
          loadMissions={loadMissions}
          automergeRepo={automergeRepo}
        />
      </div>
    </main>
  );
};

const CollapsibleMissionSection = ({
  title,
  count,
  badgeClass,
  defaultOpen,
  children,
}: {
  title: string;
  count: number;
  badgeClass: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <section className={adminCommon.section}>
      <div
        className={adminCommon.collapsibleHeader}
        onClick={() => setIsOpen(!isOpen)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setIsOpen(!isOpen);
        }}
      >
        <span className={adminCommon.collapsibleIcon}>
          <FontAwesomeIcon icon={isOpen ? faCaretDown : faCaretRight} />
        </span>
        <h2 className={adminCommon.sectionHeading}>
          <FontAwesomeIcon icon={faRocket} className={adminCommon.mutedIcon} />
          {title}
          <span className={badgeClass}>{count}</span>
        </h2>
      </div>
      {isOpen && children}
    </section>
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

  const listedMissionRows = (missionType: Mission[], isArchivedTable = false) => {
    return missionType.map((mission: Mission) => {
      if (
        user?.isSuperAdmin ||
        permissionList?.some((p) => p.missionId === mission.id && p.permissions.edit === true)
      ) {
        const automergeUrlForMission =
          automergeDocListings.find((ar) => ar.missionId === mission.id)?.automergeUrl || "";
        return (
          <tr key={mission.id}>
            <td>{mission.id}</td>
            <td>
              <span style={{ fontWeight: 600, color: "#e2e8f0", fontSize: "0.95rem" }}>
                {mission.name}
              </span>
            </td>
            <td style={{ textAlign: "center" }}>{mission.actionSystemVersion ?? "—"}</td>
            <td style={{ whiteSpace: "nowrap" }}>
              {mission.updatedAt ? new Date(mission.updatedAt).toLocaleString() : "—"}
            </td>
            <td style={{ whiteSpace: "nowrap" }}>
              {mission.createdAt ? new Date(mission.createdAt).toLocaleString() : "—"}
            </td>
            <td>
              <div className={styles.missionActions}>
                <button
                  className={adminCommon.button}
                  type="button"
                  onClick={() => {
                    navigate(`/admin/mission/${mission.id}/${automergeUrlForMission}`);
                  }}
                >
                  Edit Mission
                </button>
                <button
                  className={adminCommon.button}
                  type="button"
                  onClick={() => {
                    navigate(`/admin/mission_layers/${mission.id}`);
                  }}
                >
                  Layers
                </button>
                <button
                  className={adminCommon.button}
                  type="button"
                  onClick={() => {
                    navigate(`/admin/mission_stm/${mission.id}`);
                  }}
                >
                  STM
                </button>
                <button
                  className={adminCommon.button}
                  type="button"
                  onClick={() => {
                    navigate(`/admin/mission_grid/${mission.id}`);
                  }}
                >
                  Grid
                </button>
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  onClick={() => {
                    navigate(`/admin/export/${mission.id}`);
                  }}
                >
                  Export
                </button>
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  onClick={() => {
                    navigate(`/admin/mission_duplicate/${mission.id}`);
                  }}
                >
                  Duplicate
                </button>
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  onClick={() => {
                    navigate(`/admin/automerge/${automergeUrlForMission}`);
                  }}
                >
                  Automerge
                </button>
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  onClick={() => {
                    const action = mission.isArchived ? "Unarchive" : "Archive";
                    if (
                      confirm(`Are you sure you want to ${action.toLowerCase()} "${mission.name}"?`)
                    ) {
                      archiveMission({
                        id: mission.id,
                        archive: !mission.isArchived,
                      });
                    }
                  }}
                >
                  {mission.isArchived ? "Unarchive" : "Archive"}
                </button>
              </div>
            </td>
            {isArchivedTable && (
              <td>
                {mission.isArchived && (
                  <button
                    className={adminCommon.buttonDanger}
                    type="button"
                    onClick={() => {
                      delMissionAndAutomerge(mission.id);
                    }}
                  >
                    Delete Mission
                  </button>
                )}
              </td>
            )}
          </tr>
        );
      } else {
        return (
          <tr key={mission.id}>
            <td colSpan={isArchivedTable ? 7 : 6}>
              <span style={{ color: "#64748b", fontStyle: "italic", fontSize: "0.9rem" }}>
                {mission.name} [No Edit Permissions]
              </span>
            </td>
          </tr>
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
      <>
        <CollapsibleMissionSection
          title="Active Missions"
          count={visibleMissions.length}
          badgeClass={adminCommon.badgeSuccess}
          defaultOpen={true}
        >
          <div className={styles.missionTableWrapper}>
            <table
              className={`${adminCommon.table} ${adminCommon.tableCompact} ${styles.missionTableFixed}`}
            >
              <colgroup>
                <col className={styles.colId} />
                <col />
                <col className={styles.colVersion} />
                <col className={styles.colDate} />
                <col className={styles.colDate} />
                <col className={styles.colActions} />
              </colgroup>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Mission</th>
                  <th style={{ textAlign: "center" }}>Version</th>
                  <th>Updated At</th>
                  <th>Created At</th>
                  <th>Actions</th>
                </tr>
              </thead>
            </table>
            <div className={styles.scrollableList}>
              <table
                className={`${adminCommon.table} ${adminCommon.tableCompact} ${styles.missionTableFixed}`}
              >
                <colgroup>
                  <col className={styles.colId} />
                  <col />
                  <col className={styles.colVersion} />
                  <col className={styles.colDate} />
                  <col className={styles.colDate} />
                  <col className={styles.colActions} />
                </colgroup>
                <tbody>{listedMissionRows(visibleMissions, false)}</tbody>
              </table>
            </div>
          </div>
        </CollapsibleMissionSection>

        <CollapsibleMissionSection
          title="Archived Missions"
          count={archivedMissions.length}
          badgeClass={adminCommon.badgeNeutral}
          defaultOpen={false}
        >
          <div className={styles.archiveInfo}>
            Archived missions are hidden from the home page. Users cannot access them via direct
            link. Archived missions stay compatible with future AEGIS updates — you can un-archive
            at any time. The Delete button permanently removes the mission and all GIS data.
          </div>
          {archivedMissions.length > 0 ? (
            <div className={styles.missionTableWrapper}>
              <table
                className={`${adminCommon.table} ${adminCommon.tableCompact} ${styles.missionTableFixed}`}
              >
                <colgroup>
                  <col className={styles.colId} />
                  <col />
                  <col className={styles.colVersion} />
                  <col className={styles.colDate} />
                  <col className={styles.colDate} />
                  <col className={styles.colActions} />
                  <col className={styles.colDelete} />
                </colgroup>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Mission</th>
                    <th style={{ textAlign: "center" }}>Version</th>
                    <th>Updated At</th>
                    <th>Created At</th>
                    <th>Actions</th>
                    <th>Delete</th>
                  </tr>
                </thead>
              </table>
              <div className={styles.scrollableList}>
                <table
                  className={`${adminCommon.table} ${adminCommon.tableCompact} ${styles.missionTableFixed}`}
                >
                  <colgroup>
                    <col className={styles.colId} />
                    <col />
                    <col className={styles.colVersion} />
                    <col className={styles.colDate} />
                    <col className={styles.colDate} />
                    <col className={styles.colActions} />
                    <col className={styles.colDelete} />
                  </colgroup>
                  <tbody>{listedMissionRows(archivedMissions, true)}</tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className={adminCommon.emptyState}>No archived missions.</div>
          )}
        </CollapsibleMissionSection>
      </>
    );
  } else {
    return <div className={adminCommon.emptyState}>No missions found.</div>;
  }
};

export default Missions;
