import AsyncStatus from "components/admin/asyncStatus";
import { useAsyncStatus } from "components/admin/useAsyncStatus";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  createMission,
  deleteMissions,
  getMissionSummaries,
  setMissionArchived,
} from "http-client/mission";
import { isLoggedIn } from "http-client/login";
import { Tooltip } from "react-tooltip";
import { useAppDispatch } from "utils/useAppDispatch";
import { initialState as wholeStoreInitialState } from "store/index";
import { setAllSliceStores } from "store/crossActions";
import { getAutomergeDocListing } from "http-client/docListing";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretDown, faCaretRight, faRocket } from "@fortawesome/free-solid-svg-icons";
import adminCommon from "./adminCommon.module.css";
import styles from "./missions.module.css";

const Missions: React.FunctionComponent = () => {
  const loading = useAsyncStatus("Loading missions...");
  const { run: runLoad } = loading;
  const action = useAsyncStatus();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [missions, setMissions] = useState<MissionSummary[]>([]);
  const [automergeDocListings, setAutomergeDocListings] = useState<AutomergeDocListing[]>([]);
  const [user, setUser] = useState<AppUser | null>(null);

  const loadMissions = useCallback(
    () =>
      runLoad("Loading missions...", async () => {
        // Both requests read SQL metadata; listing historical missions never loads their CRDTs.
        const [docListingsRes, missionsRes] = await Promise.all([
          getAutomergeDocListing(),
          getMissionSummaries(),
        ]);

        if (!docListingsRes.data) {
          throw new Error(docListingsRes.message || "Failed to load mission records");
        }
        setAutomergeDocListings(docListingsRes.data);

        if (!missionsRes.data) {
          throw new Error(missionsRes.message || "Failed to load missions");
        }

        const allMissions = [...missionsRes.data];

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
      }),
    [runLoad]
  );

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
    runLoad("Loading missions...", isLoggedInAsync);
  }, [navigate, loadMissions, runLoad]);

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
            onClick={() =>
              action.run("Creating mission...", async () => {
                const res = await createMission();
                if (res.status != "success") {
                  throw new Error(res.message || "Error creating automerge record");
                } else if (res.data) {
                  navigate(`/admin/mission/${res.data.missionId}/${res.data.automergeUrl}`);
                }
              })
            }
            disabled={user?.id !== 1 || !!loading.pending || !!action.pending}
          >
            + Add New Mission
          </button>
        </div>
        <AsyncStatus {...loading} />
        <AsyncStatus {...action} />
        <MissionList
          missions={missions}
          automergeDocListings={automergeDocListings}
          user={user}
          loadMissions={loadMissions}
          isLoading={!!loading.pending}
          loadError={!!loading.error}
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
  isLoading,
  loadError,
}: {
  missions: MissionSummary[];
  automergeDocListings: AutomergeDocListing[];
  user: AppUser | null;
  loadMissions: Function;
  isLoading: boolean;
  loadError: boolean;
}) => {
  const navigate = useNavigate();
  const permissionList = user?.permissionList;
  const action = useAsyncStatus();

  async function delMissionAndAutomerge(missionId: number | null) {
    if (!missionId) return;
    if (
      confirm(
        `Are you sure you want to delete mission ${missionId} and all of its GIS data? This will also delete the automerge doc listing.\nThis cannot be undone!`
      )
    ) {
      const res: WrappedResponse<number[]> = await deleteMissions([missionId]);
      if (res.status !== "success") {
        throw new Error(res.message || "Failed to delete mission");
      }
      await loadMissions();
    }
  }

  async function archiveMission({ id, archive }: { id: number; archive: boolean }) {
    await setMissionArchived(id, archive);
    await loadMissions();
  }

  const listedMissionRows = (missionType: MissionSummary[], archivedAtTable = false) => {
    return missionType.map((mission) => {
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
              {mission.createdAt ? new Date(mission.createdAt).toLocaleString() : "—"}
            </td>
            {archivedAtTable ? (
              <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>
                {mission.archivedAt ? new Date(mission.archivedAt).toLocaleString() : "—"}
              </td>
            ) : null}
            <td>
              <div className={styles.missionActions}>
                <button
                  disabled={!!action.pending || isLoading || loadError}
                  className={adminCommon.button}
                  type="button"
                  onClick={() => {
                    navigate(`/admin/mission/${mission.id}/${automergeUrlForMission}`);
                  }}
                >
                  Edit Mission
                </button>
                <button
                  disabled={!!action.pending || isLoading || loadError}
                  className={adminCommon.button}
                  type="button"
                  onClick={() => {
                    navigate(`/admin/mission_layers/${mission.id}`);
                  }}
                >
                  Layers
                </button>
                <button
                  disabled={!!action.pending || isLoading || loadError}
                  className={adminCommon.button}
                  type="button"
                  onClick={() => {
                    navigate(`/admin/mission_stm/${mission.id}`);
                  }}
                >
                  STM
                </button>
                <button
                  disabled={!!action.pending || isLoading || loadError}
                  className={styles.buttonSecondary}
                  type="button"
                  onClick={() => {
                    navigate(`/admin/export/${mission.id}`);
                  }}
                >
                  Export
                </button>
                <button
                  disabled={!!action.pending || isLoading || loadError}
                  className={styles.buttonSecondary}
                  type="button"
                  onClick={() => {
                    navigate(`/admin/mission_duplicate/${mission.id}`);
                  }}
                >
                  Duplicate
                </button>
                <button
                  disabled={!!action.pending || isLoading || loadError}
                  className={styles.buttonSecondary}
                  type="button"
                  onClick={() => {
                    navigate(`/admin/automerge/${automergeUrlForMission}`);
                  }}
                >
                  Automerge
                </button>
                <button
                  disabled={!!action.pending || isLoading || loadError}
                  className={styles.buttonSecondary}
                  type="button"
                  onClick={() => {
                    const archiveLabel = mission.archivedAt ? "Unarchive" : "Archive";
                    if (
                      confirm(
                        `Are you sure you want to ${archiveLabel.toLowerCase()} "${mission.name}"?`
                      )
                    ) {
                      action.run("Updating mission archive...", () =>
                        archiveMission({
                          id: mission.id,
                          archive: !mission.archivedAt,
                        })
                      );
                    }
                  }}
                >
                  {mission.archivedAt ? "Unarchive" : "Archive"}
                </button>
              </div>
            </td>
            {archivedAtTable && (
              <td>
                {mission.archivedAt && (
                  <button
                    disabled={!!action.pending || isLoading || loadError}
                    className={adminCommon.buttonDanger}
                    type="button"
                    onClick={() => {
                      action.run("Deleting mission...", () => delMissionAndAutomerge(mission.id));
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
            <td colSpan={archivedAtTable ? 7 : 5}>
              <span style={{ color: "#64748b", fontStyle: "italic", fontSize: "0.9rem" }}>
                {mission.name} [No Edit Permissions]
              </span>
            </td>
          </tr>
        );
      }
    });
  };

  const visibleMissions = missions?.filter((mission) => mission.archivedAt == null);
  const archivedMissions = missions?.filter((mission) => mission.archivedAt != null);

  if (missions.length > 0) {
    return (
      <>
        <AsyncStatus {...action} />

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
                <col className={styles.colActions} />
              </colgroup>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Mission</th>
                  <th style={{ textAlign: "center" }}>Version</th>
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
                    <th>Created At</th>
                    <th>Archived At</th>
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
    return !isLoading && !loadError ? (
      <div className={adminCommon.emptyState}>No missions found.</div>
    ) : null;
  }
};

export default Missions;
