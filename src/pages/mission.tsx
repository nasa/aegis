import { useAppDispatch } from "utils/useAppDispatch";
import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { useNavigate, useParams, useSearchParams } from "react-router";
import styles from "./mission.module.css";
import { Tooltip } from "react-tooltip";
import Header from "components/interface/header";
import { NavGutter } from "components/interface/side-controls";
import SocketClient from "components/page/socketClient";
import { MissionDockviewLayout } from "components/interface/dockview/MissionDockviewLayout";
import { MapMenuProvider } from "components/interface/map/MapMenuProvider";
import { setAllSliceStores } from "store/crossActions";
import { getPaneTypes } from "components/interface/_paneTypes";
import { populateStore } from "store/processing/populateStore";
import { thunkSelectEvaAction } from "store/thunk/crossThunk";
import { clearLoadedGrid, getGridRenderMode, loadAndReturnGrid } from "utils/mapping/grid";
import { setGridCornerPoint } from "store/map";
import { clientLogger } from "utils/logging/clientLogger";
import { isLaunchpadSuperUser, meetsPermLevel } from "utils/permissionsClient";
import { getCurrentUserAndAccess } from "http-client/access/currentUser";
import { setUserState } from "store/user";
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
  const isVersionChecked = useAppSelector(
    // if this value exists then it has already been checked via sockets
    (state) => !!state.connection.socketStatus.lastStatusFromServer.serverVersion,
    deepEqual
  );
  const missionPermLevel = useAppSelector((state) => state.user.missionPermLevel, deepEqual);

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
      archivedAt: mission.archivedAt,
      name: mission.name,
      serverFileGrid: mission.serverFileGrid,
      gridRenderMode: mission.gridRenderMode,
    }),
    deepEqual
  );

  const paneTypes = getPaneTypes(partialMission?.actionSystemVersion);
  const paneType: PaneType = paneTypes[interfaceStateLabel as keyof PaneTypes];

  // Resolves access and populates the user store, or sends the user home when they have none.
  useEffect(() => {
    if (!intMissionId) return;

    (async () => {
      const access = await getCurrentUserAndAccess();
      if (access instanceof Error) {
        navigate("/");
        return;
      }

      // A super user has implicit edit everywhere and therefore carries no grant rows.
      const permLevel = isLaunchpadSuperUser(access.launchpadUser)
        ? "edit"
        : (access.permissions?.[String(intMissionId)] ?? null);

      if (!permLevel) {
        navigate("/");
        return;
      }

      dispatch(
        setUserState({
          isLoggedIn: !!access.launchpadUser,
          launchpadUser: access.launchpadUser,
          appUserId: access.appUser?.id ?? null,
          missionPermLevel: permLevel,
        })
      );

      clientLogger.info({
        logId: "appLogin",
        appUsername: access.launchpadUser.auid,
        missionId: intMissionId,
        page: "mission",
      });
    })();
  }, [dispatch, intMissionId, navigate]);

  // Populate the store only after permission check is done AND serverVersion is available.
  // This is to ensure we have the latest app before any audits are made or data is retrieved
  useEffect(() => {
    if (!missionPermLevel || !isVersionChecked || !automergeRepo) return;

    (async () => {
      // Get the rest of the store data
      let wholeStoreState: WholeStoreState;
      if (meetsPermLevel(missionPermLevel, "edit")) {
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
    missionPermLevel,
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
    if (!partialMission) return;
    if (getGridRenderMode(partialMission) === "dynamic-lgrs" || !partialMission.serverFileGrid) {
      clearLoadedGrid();
      dispatch(setGridCornerPoint(null));
      return;
    }

    const loadGridAsync = async () => {
      const newGrid: MissionGrid = await loadAndReturnGrid(intMissionId);
      if (newGrid?.coordinates && newGrid.coordinates.length > 0) {
        dispatch(setGridCornerPoint(newGrid.coordinates[0][0]));
      } else {
        dispatch(setGridCornerPoint(null));
      }
    };

    loadGridAsync();
  }, [dispatch, intMissionId, partialMission]);

  useEffect(() => {
    if (!partialMission?.name) return;

    document.title = `${partialMission.name} - AEGIS`;
  }, [partialMission?.name]);

  return (
    <>
      {missionPermLevel && partialMission && storeIsPopulated ? (
        <>
          {partialMission.archivedAt ? (
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
                  const updated = activeAnchor.getAttribute("data-tooltip-le-updated");
                  const created = activeAnchor.getAttribute("data-tooltip-le-created");
                  const infoRaw = activeAnchor.getAttribute("data-tooltip-le-info");
                  let info: LastEditedInfoLine[] = [];
                  if (infoRaw) {
                    try {
                      const parsed: unknown = JSON.parse(infoRaw);
                      if (Array.isArray(parsed)) info = parsed as LastEditedInfoLine[];
                    } catch (err) {
                      clientLogger.warning({
                        logId: "lastEditedTooltip:parseError",
                        message: "Failed to parse data-tooltip-le-info",
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
                <MapMenuProvider>
                  {/* Context is shared by the map and its separate floating Dockview menu panel. */}
                  <MissionDockviewLayout />
                </MapMenuProvider>
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
