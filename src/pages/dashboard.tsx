import { useEffect, useState } from "react";
import { useAppDispatch } from "utils/useAppDispatch";
import { useParams } from "react-router";

import styles from "./dashboard.module.css";
import { setMissionPerms, setAppUser } from "store/user";
import { Tooltip } from "react-tooltip";
import { isLoggedIn } from "http-client/login";
import { useNavigate } from "react-router";

import DashboardHeader from "components/dashboard/header";
import SocketClient from "components/page/socketClient";
import { setAllSliceStores } from "store/crossActions";
import { populateStore } from "store/processing/populateStore";
import LeftTopPanel from "components/dashboard/leftPanel";
import MapBody from "components/dashboard/map";
import DashTimeline from "components/dashboard/dashTimeline";
import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import MiniMap from "components/dashboard/miniMap";

type RouteParams = {
  id: string;
};

const Main = (): JSX.Element => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const runningRexFromDb = useAppSelector(
    (state) => state.rex.rexesFromDb.find((r) => r.isRunning),
    deepEqual
  );
  const defaultPreset = useAppSelector((state) => {
    const defaultPresetUuid = state.preset.presetsFromDb.find((p) => p.missionDefault)?.uuid;
    return state.preset.presetsFromDb.find((p) => p.uuid === defaultPresetUuid);
  }, deepEqual);
  const missionTitle = useAppSelector((state) => state.mission.mission?.name, refEqual);

  // set default view to task and crew regardless of what is in the cookie
  const taskSourceUuid = runningRexFromDb?.posSources?.find((source) => source.abbr === "T")?.uuid;
  const crewSourceUuid = runningRexFromDb?.posSources?.find((source) => source.abbr === "C")?.uuid;

  // props that are passed between the big map and mini map
  const [hasPermissions, setHasPermissions] = useState(false);
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
    sourceUuids: [taskSourceUuid, crewSourceUuid],
  });
  const [showScaleBar, setShowScaleBar] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState<Preset>(defaultPreset);
  const [showArrows, setShowArrows] = useState(false);

  const params = useParams<RouteParams>();
  const slug = params.id;
  const intMissionId = parseInt(slug);

  useEffect(() => {
    // set selected preset to default preset for initial load
    setSelectedPreset(defaultPreset);
  }, [defaultPreset]);

  useEffect(() => {
    const populateStoreAsync = async () => {
      const wholeStoreState = await populateStore({ missionId: intMissionId, runAudit: false });
      /**
       * dispatch a single action to populate the stores across all slices using the wholeStoreState
       */
      dispatch(setAllSliceStores(wholeStoreState));
    };
    populateStoreAsync();
    //eslint-disable-next-line
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem("missionId", intMissionId.toString());
    window.sessionStorage.setItem("socketId", "null");
  }, [intMissionId]);

  useEffect(() => {
    if (!intMissionId) return;
    const isLoggedInAsync = async () => {
      const response = await isLoggedIn();
      if (response.status === "success") {
        dispatch(setAppUser({ isLoggedIn: true, user: response.data, missionPerms: null }));
        if (response.data.isSuperAdmin) {
          dispatch(
            setMissionPerms({ missionId: intMissionId, permissions: { view: true, edit: true } })
          );
        } else {
          const perms = response.data.permissionList?.find(
            (permission) => permission.missionId === intMissionId
          );
          if (!perms || (!perms.permissions.view && !perms.permissions.edit)) navigate("/");
          dispatch(setMissionPerms(perms));
        }
        setHasPermissions(true);
      } else {
        navigate("/");
      }
    };
    isLoggedInAsync();
  }, [navigate, intMissionId, dispatch]);

  useEffect(() => {
    if (!missionTitle) {
      return;
    }
    document.title = `${missionTitle} - AEGIS`;
  }, [missionTitle]);

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
        {hasPermissions && runningRexFromDb ? (
          <div className={styles.mainContent}>
            <div className={styles.leftPanel}>
              <LeftTopPanel mapDisplayPos={mapDisplayPos} />
              <div className={styles.miniMapContainer}>
                <MiniMap
                  bigMapBounds={bigMapBounds}
                  mapDisplayPos={mapDisplayPos}
                  showScaleBar={showScaleBar}
                  selectedPreset={selectedPreset}
                  showArrows={showArrows}
                />
              </div>
            </div>
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
        <SocketClient missionId={intMissionId} />
      </div>
    </>
  );
};

export default Main;
