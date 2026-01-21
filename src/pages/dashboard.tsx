import { useEffect, useState } from "react";
import { useAppDispatch } from "utils/useAppDispatch";
import { useParams } from "react-router";
import { useCookies } from "react-cookie";

import styles from "./dashboard.module.css";
import { setMissionPerms, setAppUser } from "store/user";
import { Tooltip } from "react-tooltip";
import { isLoggedIn } from "http-client/login";
import { useNavigate } from "react-router";

import DashboardHeader from "components/dashboard/header";
import SocketClient from "components/page/socketClient";
import { setAllSliceStores } from "store/crossActions";
import { populateStore } from "store/processing/populateStore";
import MapBody from "components/dashboard/map";
import DashTimeline from "components/dashboard/timeline/dashTimeline";
import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import MiniMap from "components/dashboard/miniMap";
import { setGridCornerPoint } from "store/map";
import { loadAndReturnGrid } from "utils/mapping/grid";

type RouteParams = {
  id: string;
};

const Main = (): JSX.Element => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [eyeballMenuCookie] = useCookies(["AEGIS_Map_View_Settings"]);

  const runningRexFromDb = useAppSelector(
    (state) => state.rex.rexesFromDb.find((r) => r.isRunning),
    deepEqual
  );
  const defaultPreset = useAppSelector((state) => {
    const defaultPresetUuid = state.preset.presetsFromDb.find((p) => p.missionDefault)?.uuid;
    return state.preset.presetsFromDb.find((p) => p.uuid === defaultPresetUuid);
  }, deepEqual);
  const activeGridUuid = useAppSelector((state) => state.mission.mission?.activeGridUuid, refEqual);
  const missionName = useAppSelector((state) => state.mission.mission?.name, refEqual);

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
    if (!runningRexFromDb?.posSources) return;

    const taskSourceUuid = runningRexFromDb.posSources.find((source) => source.abbr === "T")?.uuid;
    const crewSourceUuid = runningRexFromDb.posSources.find((source) => source.abbr === "C")?.uuid;

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
  }, [runningRexFromDb?.posSources, eyeballMenuCookie]);

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
    if (!missionName) {
      return;
    }
    document.title = `${missionName} - AEGIS`;
  }, [missionName]);

  // in it's own useEffect in case grid changes while user is on the page
  useEffect(() => {
    const loadGridAsync = async () => {
      const newGrid: MissionGrid = await loadAndReturnGrid(intMissionId, activeGridUuid);
      if (newGrid?.coordinates && newGrid.coordinates.length > 0) {
        dispatch(setGridCornerPoint(newGrid.coordinates[0][0]));
      } else {
        dispatch(setGridCornerPoint(null));
      }
    };

    loadGridAsync();
  }, [dispatch, intMissionId, activeGridUuid]);

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
        <SocketClient missionId={intMissionId} />
      </div>
    </>
  );
};

export default Main;
