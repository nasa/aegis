import { useAppDispatch } from "utils/useAppDispatch";
import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { useParams, useSearchParams } from "react-router";
import styles from "./mission.module.css";
import { setAppUser } from "store/user";
import { Tooltip } from "react-tooltip";
import { isLoggedIn } from "http-client/login";
import { useNavigate } from "react-router";
import Header from "components/interface/header";
import { LeftControlPanel, NavGutter } from "components/interface/side-controls";
import { RightControlPanel } from "components/interface/side-controls";
import { BottomControlPanel } from "components/interface/side-controls";
import SocketClient from "components/page/socketClient";
import { AegisMapEditor } from "components/interface/map/AegisMapEditor";
import { setAllSliceStores } from "store/crossActions";
import { getPaneTypes } from "components/interface/_paneTypes";
import { populateStore } from "store/processing/populateStore";
import { thunkSelectEvaAction } from "store/thunk/crossThunk";
import { loadAndReturnGrid } from "utils/mapping/grid";
import { setGridCornerPoint } from "store/map";
import { clientLogger } from "utils/logging/clientLogger";
import { useMissionDocSelector } from "utils/useDocSelector";
import { useRepo } from "@automerge/automerge-repo-react-hooks";
import { useEffect, useState } from "react";
import { LoadingOverlay } from "components/interface/_global-elements";
import aegisTooltipStyles from "styles/aegis-tooltip.module.css";
import type { LastEditedInfoLine } from "components/interface/_global-elements";

type RouteParams = {
  id: string;
};

const Main: React.FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const automergeRepo = useRepo();
  const interfaceStateLabel = useAppSelector(
    (state) => state.interface.sectionSelectedLabel,
    refEqual
  );
  const hasMissionLayers = useAppSelector((state) => {
    return state.mission.layers?.length > 0;
  }, refEqual);
  const isVersionChecked = useAppSelector(
    // if this value exists then it has already been checked via sockets
    (state) => !!state.connection.socketStatus.lastStatusFromServer.serverVersion,
    deepEqual
  );

  const [missionPerms, setMissionPerms] = useState(null);
  const [storeIsPopulated, setStoreIsPopulated] = useState(false);
  const [searchParams] = useSearchParams();
  const evaRefUuid = searchParams.get("evaRefUuid");
  const actionRefUuid = searchParams.get("actionRefUuid");
  const rexUuid = searchParams.get("rexUuid"); // optional

  const params = useParams<RouteParams>();
  const slug = params.id;
  const intMissionId = parseInt(slug);
  const partialMission = useMissionDocSelector(
    (mission) => ({
      actionSystemVersion: mission.actionSystemVersion,
      isArchived: mission.isArchived,
      name: mission.name,
      serverFileGrid: mission.serverFileGrid,
    }),
    deepEqual
  );

  const paneTypes = getPaneTypes(partialMission?.actionSystemVersion);
  const paneType: PaneType = paneTypes[interfaceStateLabel as keyof PaneTypes];

  useEffect(() => {
    if (!intMissionId) return;
    (async () => {
      // Get permissions
      let missionPerms: Permission = null;
      const response = await isLoggedIn();
      if (response.status !== "success") {
        navigate("/"); // Kick user out back to homepage
        return;
      }
      if (response.data.isSuperAdmin) {
        missionPerms = { missionId: intMissionId, permissions: { view: true, edit: true } };
      } else {
        missionPerms = response.data.permissionList?.find(
          (permission) => permission.missionId === intMissionId
        );
        if (!missionPerms || (!missionPerms.permissions.view && !missionPerms.permissions.edit)) {
          navigate("/");
          return;
        }
      }

      // Populate the user store
      dispatch(setAppUser({ isLoggedIn: true, user: response.data, missionPerms: missionPerms }));
      // log user info
      clientLogger.info({
        logId: "appLogin",
        appUsername: response.data.username,
        missionId: intMissionId,
        page: "mission",
      });

      setMissionPerms(missionPerms);
    })();
  }, [dispatch, intMissionId, navigate]);

  // Populate the store only after permission check is done AND serverVersion is available.
  // This is to ensure we have the latest app before any audits are made or data is retrieved
  useEffect(() => {
    if (!missionPerms || !isVersionChecked || !automergeRepo) return;

    (async () => {
      // Get the rest of the store data
      let wholeStoreState: WholeStoreState;
      if (missionPerms.permissions?.edit) {
        wholeStoreState = await populateStore({
          missionId: intMissionId,
          runAudit: true,
          automergeRepo,
        });
      } else {
        // User does not have edit permissions, so do not run audit (which causes DB changes)
        wholeStoreState = await populateStore({
          missionId: intMissionId,
          runAudit: false,
          automergeRepo,
        });
      }

      // Dispatch a single action to populate the stores across all slices using the wholeStoreState
      dispatch(setAllSliceStores(wholeStoreState));

      // If evaRefUuid, actionRefUuid are present in the URL, set the selected action using thunk
      if (evaRefUuid && actionRefUuid) {
        dispatch(thunkSelectEvaAction({ evaRefUuid, actionRefUuid, rexUuid }));
      }

      setStoreIsPopulated(true);
    })();
  }, [
    isVersionChecked,
    automergeRepo,
    missionPerms,
    dispatch,
    intMissionId,
    evaRefUuid,
    actionRefUuid,
    rexUuid,
  ]);

  useEffect(() => {
    // update session storage information. This is for sockets
    window.sessionStorage.setItem("missionId", intMissionId.toString());
    window.sessionStorage.setItem("socketId", "null");
  }, [intMissionId]);

  // in it's own useEffect in case grid changes while user is on the page
  useEffect(() => {
    if (!partialMission?.serverFileGrid) return;

    const loadGridAsync = async () => {
      const newGrid: MissionGrid = await loadAndReturnGrid(intMissionId);
      if (newGrid?.coordinates && newGrid.coordinates.length > 0) {
        dispatch(setGridCornerPoint(newGrid.coordinates[0][0]));
      } else {
        dispatch(setGridCornerPoint(null));
      }
    };

    loadGridAsync();
  }, [dispatch, intMissionId, partialMission?.serverFileGrid]);

  useEffect(() => {
    if (!partialMission?.name) return;

    document.title = `${partialMission.name} - AEGIS`;
  }, [partialMission?.name]);

  return (
    <>
      {missionPerms && partialMission && storeIsPopulated ? (
        <>
          {partialMission.isArchived ? (
            <div className={styles.archivedBody}>
              This mission has been archived. Please contact the EMSS team if you need to access it.
              <div style={{ marginTop: "3rem" }}>
                <img src="/images/EMSS.svg" alt="EMSS Logo" className={styles.emssLogo} />
              </div>
            </div>
          ) : (
            <div className={styles.page}>
              {/* Standard tooltip for displaying plain string content */}
              <Tooltip
                id="aegis-tooltip"
                className={aegisTooltipStyles.tooltip}
                clickable={true}
                delayShow={1000}
                delayHide={500}
              />
              {/* Tooltip instance for all LastEditedNumeric tooltips
               * This is a separate tooltip since it needs to render custom html content rather than simple text.
               */}
              <Tooltip
                id={"aegis-last-edited"}
                className={aegisTooltipStyles.tooltip}
                clickable={true}
                delayShow={1000}
                delayHide={500}
                render={({ activeAnchor }) => {
                  if (!activeAnchor) return null;
                  const updated = activeAnchor.getAttribute("data-le-updated");
                  const created = activeAnchor.getAttribute("data-le-created");
                  const infoRaw = activeAnchor.getAttribute("data-le-info");
                  let info: LastEditedInfoLine[] = [];
                  if (infoRaw) {
                    try {
                      const parsed: unknown = JSON.parse(infoRaw);
                      if (Array.isArray(parsed)) info = parsed as LastEditedInfoLine[];
                    } catch (err) {
                      clientLogger.warning({
                        logId: "lastEditedTooltip:parseError",
                        message: "Failed to parse data-le-info",
                        error: err instanceof Error ? err.message : String(err),
                      });
                    }
                  }
                  return (
                    <>
                      <div>Updated At: {updated} Z</div>
                      <div>Created At: {created} Z</div>
                      {info.map(([label, value]) => (
                        <div key={label}>
                          {label}: {value}
                        </div>
                      ))}
                    </>
                  );
                }}
              />{" "}
              <div className={styles.header}>
                <Header />
              </div>
              {paneType?.fullScreen ? (
                <div className={styles.body}>
                  <div className={styles.leftControl}>
                    <NavGutter selectedNavItem={interfaceStateLabel} />
                  </div>

                  <div className={styles.bodyRight}>
                    <paneType.rightPane />
                  </div>
                </div>
              ) : (
                <div className={styles.body}>
                  <div className={styles.bodyLeft}>
                    <div className={styles.leftUpper}>
                      <div className={styles.leftControl}>
                        <NavGutter selectedNavItem={interfaceStateLabel} />
                        <LeftControlPanel />
                      </div>
                      <div className={styles.mapBody}>{hasMissionLayers && <AegisMapEditor />}</div>
                    </div>
                    <BottomControlPanel />
                  </div>
                  <RightControlPanel />
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <LoadingOverlay message="Loading mission data..." />
      )}

      <SocketClient missionId={intMissionId} />
    </>
  );
};

export default Main;
