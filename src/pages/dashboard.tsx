import { useEffect, useState } from "react";
import { useAppDispatch } from "utils/useAppDispatch";
import { useParams } from "react-router";
import { useCookies } from "react-cookie";

import styles from "./dashboard.module.css";
import { setAppUser } from "store/user";
import { Tooltip } from "react-tooltip";
import { isLoggedIn } from "http-client/login";
import { useNavigate } from "react-router";

import DashboardHeader from "components/dashboard/header";
import SocketClient from "components/page/socketClient";
import { setAllSliceStores } from "store/crossActions";
import { populateStore } from "store/processing/populateStore";
import MapBody from "components/dashboard/map";
import DashTimeline from "components/dashboard/timeline/dashTimeline";
import { deepEqual, useAppSelector } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import MiniMap from "components/dashboard/miniMap";
import { setGridCornerPoint } from "store/map";
import { loadAndReturnGrid } from "utils/mapping/grid";
import { useRepo } from "@automerge/automerge-repo-react-hooks";
import { clientLogger } from "utils/logging/clientLogger";
import { LoadingOverlay } from "components/interface/_global-elements";

type RouteParams = {
  id: string;
};

const Main = (): JSX.Element => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [eyeballMenuCookie] = useCookies(["AEGIS_Map_View_Settings"]);
  const automergeRepo = useRepo();
  const partialMission = useMissionDocSelector(
    (mission) => ({ name: mission.name, activeGridUuid: mission.activeGridUuid }),
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
  const defaultPreset = useAppSelector((state) => {
    const defaultPresetUuid = state.preset.presetsFromDb.find((p) => p.missionDefault)?.uuid;
    return state.preset.presetsFromDb.find((p) => p.uuid === defaultPresetUuid);
  }, deepEqual);

  const [missionPerms, setMissionPerms] = useState(null);
  const [storeIsPopulated, setStoreIsPopulated] = useState(false);
  // props that are passed between the big map and mini map
  const [bigMapBounds, setBigMapBounds] = useState<L.LatLngBoundsLiteral>(null);
  const [mapDisplayPos, setMapDisplayPos] = useState<MapDisplayPos>({
    show: true,
    showAllLabels: false,
    showLatestLabels: false,
    showPaths: true,
    showOldPaths: true,
    fadeOldPaths: true,
    showMarkers: true,
    showOldMarkers: false,
    fadeOldMarkers: false,
    sourceUuids: [],
  });
  const [showScaleBar, setShowScaleBar] = useState(true);
  // store preset in local state so it can be passed to both maps
  const [selectedPreset, setSelectedPreset] = useState<Preset>(defaultPreset);
  const [showArrows, setShowArrows] = useState(true);

  const params = useParams<RouteParams>();
  const slug = params.id;
  const intMissionId = parseInt(slug);

  useEffect(() => {
    // set selected preset to default preset for initial load
    if (!selectedPreset) setSelectedPreset(defaultPreset);
  }, [defaultPreset, selectedPreset]);

  // Set default sourceUuids when runningRexFromDb changes, reading from cookie settings
  useEffect(() => {
    if (!runningRex?.posSources) return;

    const taskSourceUuid = runningRex.posSources.find((source) => source.abbr === "T")?.uuid;
    const crewSourceUuid = runningRex.posSources.find((source) => source.abbr === "C")?.uuid;

    // Get existing settings from cookie, similar to map-body-leaflet
    const existingSettings = eyeballMenuCookie["AEGIS_Map_View_Settings"];

    if (existingSettings?.mapDisplayPos) {
      // Use cookie settings but override sourceUuids with task and crew defaults
      setMapDisplayPos({
        ...existingSettings.mapDisplayPos,
        sourceUuids: [taskSourceUuid, crewSourceUuid].filter(Boolean), // filter out undefined values
      });
    } else {
      // No cookie settings, just update sourceUuids on current state
      setMapDisplayPos((prevMapDisplayPos) => ({
        ...prevMapDisplayPos,
        sourceUuids: [taskSourceUuid, crewSourceUuid].filter(Boolean),
      }));
    }
  }, [runningRex?.posSources, eyeballMenuCookie]);

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
    if (!partialMission?.activeGridUuid) return;

    const loadGridAsync = async () => {
      const newGrid: MissionGrid = await loadAndReturnGrid(
        intMissionId,
        partialMission.activeGridUuid
      );
      if (newGrid?.coordinates && newGrid.coordinates.length > 0) {
        dispatch(setGridCornerPoint(newGrid.coordinates[0][0]));
      } else {
        dispatch(setGridCornerPoint(null));
      }
    };

    loadGridAsync();
  }, [dispatch, intMissionId, partialMission?.activeGridUuid]);

  useEffect(() => {
    if (!partialMission?.name) return;

    document.title = `${partialMission.name} - AEGIS`;
  }, [partialMission?.name]);

  return (
    <>
      <div className={styles.page}>
        <Tooltip
          id="aegis-tooltip"
          className={styles.tooltip}
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
                  <MapBody
                    setBigMapBounds={setBigMapBounds}
                    mapDisplayPos={mapDisplayPos}
                    setMapDisplayPos={setMapDisplayPos}
                    showScaleBar={showScaleBar}
                    setShowScaleBar={setShowScaleBar}
                    selectedPreset={selectedPreset}
                    setSelectedPreset={setSelectedPreset}
                    showArrows={showArrows}
                    setShowArrows={setShowArrows}
                  />
                  <MiniMap
                    bigMapBounds={bigMapBounds}
                    mapDisplayPos={mapDisplayPos}
                    showScaleBar={showScaleBar}
                    selectedPreset={selectedPreset}
                    showArrows={showArrows}
                  />
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
