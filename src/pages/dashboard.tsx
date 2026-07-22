import { useEffect, useState } from "react";
import { useAppDispatch } from "utils/useAppDispatch";
import { useParams } from "react-router";

import styles from "./dashboard.module.css";
import aegisTooltipStyles from "styles/aegis-tooltip.module.css";
import { setAppUser } from "store/user";
import { Tooltip } from "react-tooltip";
import { isLoggedIn } from "http-client/login";
import { useNavigate } from "react-router";

import DashboardHeader from "components/dashboard/header";
import SocketClient from "components/page/socketClient";
import { setAllSliceStores } from "store/crossActions";
import { populateStore } from "store/processing/populateStore";
import DashTimeline from "components/dashboard/timeline/dashTimeline";
import { deepEqual, useAppSelector } from "utils/useAppSelector";
import { FeatureSourcesProvider } from "components/interface/map/FeatureSourcesProvider";
import { DashboardBoundsProvider } from "components/interface/map/DashboardBoundsProvider";
import { AegisMapDashboard } from "components/interface/map/AegisMapDashboard";
import { AegisMapMinimap } from "components/interface/map/AegisMapMinimap";
import { setGridCornerPoint } from "store/map";
import { setSelectedEvaUuid } from "store/eva";
import { setSelectedRexUuid } from "store/rex";
import { setSectionSelected } from "store/interface";
import { loadAndReturnGrid } from "utils/mapping/grid";
import { useMissionDocSelector } from "utils/useDocSelector";
import { useRepo } from "@automerge/automerge-repo-react-hooks";
import { clientLogger } from "utils/logging/clientLogger";
import { LoadingOverlay } from "components/interface/_global-elements";

type RouteParams = {
  id: string;
};

const Main = (): JSX.Element => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const automergeRepo = useRepo();
  const partialMission = useMissionDocSelector(
    (doc) => ({ name: doc.name, grid: doc.grid }),
    deepEqual
  );
  const isVersionChecked = useAppSelector(
    // if this value exists then it has already been checked via sockets
    (state) => !!state.connection.socketStatus.lastStatusFromServer.serverVersion,
    deepEqual
  );
  const runningRex = useMissionDocSelector((mission) => {
    if (!mission?.rexes) return null;
    return Object.values(mission.rexes).find((r) => r.isRunning) ?? null;
  }, deepEqual);

  const [missionPerms, setMissionPerms] = useState(null);
  const [storeIsPopulated, setStoreIsPopulated] = useState(false);

  const params = useParams<RouteParams>();
  const slug = params.id;
  const intMissionId = parseInt(slug);

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
      console.log("AEGIS Username:", response.data.username);
      // Log user
      clientLogger.info({
        logId: "appLogin",
        appUsername: response.data.username,
        missionId: intMissionId,
        page: "dashboard",
      });

      setMissionPerms(missionPerms);
    })();
  }, [navigate, intMissionId, dispatch]);

  // Populate the store only after permission check is done AND serverVersion is available.
  // This is to ensure we have the latest app before data is retrieved
  useEffect(() => {
    if (!missionPerms || !isVersionChecked || !automergeRepo) return;

    (async () => {
      const wholeStoreState = await populateStore({
        missionId: intMissionId,
        runAudit: false,
        automergeRepo,
      });

      // Dispatch a single action to populate the stores across all slices using the wholeStoreState
      dispatch(setAllSliceStores(wholeStoreState));

      setStoreIsPopulated(true);
    })();
  }, [automergeRepo, dispatch, intMissionId, missionPerms, isVersionChecked]);

  useEffect(() => {
    // update session storage information. This is for sockets
    window.sessionStorage.setItem("missionId", intMissionId.toString());
    window.sessionStorage.setItem("socketId", "null");
  }, [intMissionId]);

  // in it's own useEffect in case grid changes while user is on the page
  useEffect(() => {
    if (!partialMission?.grid) return;

    const loadGridAsync = async () => {
      const newGrid: MissionGrid = await loadAndReturnGrid(intMissionId);
      if (newGrid?.coordinates && newGrid.coordinates.length > 0) {
        dispatch(setGridCornerPoint(newGrid.coordinates[0][0]));
      } else {
        dispatch(setGridCornerPoint(null));
      }
    };

    loadGridAsync();
  }, [dispatch, intMissionId, partialMission?.grid]);

  useEffect(() => {
    if (!partialMission?.name) return;

    document.title = `${partialMission.name} - AEGIS`;
  }, [partialMission?.name]);

  // Keep the map/pos selection in sync with the running REX.
  const runningRexUuid = runningRex?.uuid ?? null;
  const runningRexEvaUuid = runningRex?.evaUuid ?? null;
  useEffect(() => {
    if (!storeIsPopulated || !runningRexUuid) return;
    // Switch to the EVA section so traverse/pos map behaviors (gated on
    // sectionSelected === "evas") render. When the dashboard loads with a REX
    // already running, populateStore's setRunningRexView sets this; when a REX
    // starts after load, this effect is the only thing that does.
    dispatch(setSectionSelected("evas"));
    dispatch(setSelectedRexUuid(runningRexUuid));
    dispatch(setSelectedEvaUuid(runningRexEvaUuid));
  }, [dispatch, storeIsPopulated, runningRexUuid, runningRexEvaUuid]);

  return (
    <>
      <div className={styles.page}>
        <Tooltip
          id="aegis-tooltip"
          className={aegisTooltipStyles.tooltip}
          clickable={true}
          delayShow={1000}
          delayHide={500}
        />
        <DashboardHeader />
        {missionPerms && storeIsPopulated ? (
          <>
            {runningRex ? (
              <div className={styles.mainContent}>
                <div className={`${styles.middlePanel} ${styles.mapBody}`}>
                  <DashboardBoundsProvider>
                    {/* Each map owns its own FeatureSourcesProvider so the
                        dashboard and minimap reconcile independent VectorSources.
                        Sharing one provider forced both maps to display the same
                        feature set (last reconcile wins). */}
                    <FeatureSourcesProvider>
                      <AegisMapDashboard />
                    </FeatureSourcesProvider>
                    <div className={styles.minimapWrapper}>
                      <FeatureSourcesProvider>
                        <AegisMapMinimap />
                      </FeatureSourcesProvider>
                    </div>
                  </DashboardBoundsProvider>
                </div>
                <div className={styles.rightPanel}>
                  <DashTimeline />
                </div>
              </div>
            ) : (
              <div className={styles.infoMessageWrapper}>
                <div className={styles.infoMessageTitle}>No EVA is currently running.</div>
                <div className={styles.infoMessageSubText}>
                  When an EVA begins, this dashboard will refresh automatically.
                </div>
                <div>
                  <img src="/images/EMSS.svg" alt="EMSS Logo" className={styles.emssLogo} />
                </div>
              </div>
            )}
          </>
        ) : (
          <LoadingOverlay message="Loading dashboard..." />
        )}
        <SocketClient missionId={intMissionId} />
      </div>
    </>
  );
};

export default Main;
