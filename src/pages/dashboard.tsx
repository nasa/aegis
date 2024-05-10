import { useEffect, useState } from "react";
import { useAppDispatch } from "utils/useAppDispatch";
import { useParams } from "react-router-dom";

import styles from "./dashboard.module.css";
import { setMissionPerms, setUserStore } from "store/user";
import { Tooltip } from "react-tooltip";
import { isLoggedIn } from "http-client/login";
import { useNavigate } from "react-router-dom";

import DashboardHeader from "components/dashboard/header";
import SocketClient from "components/page/socketClient";
import { setAllSliceStores } from "store/crossActions";
import { populateStore } from "store/processing/populateStore";
import LeftTopPanel from "components/dashboard/leftPanel";
import MapBody from "components/dashboard/map";
import DashTimeline from "components/dashboard/dashTimeline";
import { deepEqual, useAppSelector } from "utils/useAppSelector";
import MiniMap from "components/dashboard/miniMap";

type RouteParams = {
  id: string;
};

const Main = (): JSX.Element => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  // props that are passed between the big map and mini map
  const [hasPermissions, setHasPermissions] = useState(false);
  const [mapShowPos, setMapShowPos] = useState(true);
  const [mapShowScaleBar, setMapShowScaleBar] = useState(true);
  const [bigMapBounds, setBigMapBounds] = useState<L.LatLngBoundsLiteral>(null);
  const [mapSelectedPreset, setMapSelectedPreset] = useState<Preset>(null);
  const [mapShowArrows, setMapShowArrows] = useState(false);

  const params = useParams<RouteParams>();
  const slug = params.id;
  const intMissionId = parseInt(slug);
  const runningRexFromDb = useAppSelector(
    (state) => state.rex.rexesFromDb.find((r) => r.isRunning),
    deepEqual
  );

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
        dispatch(setUserStore({ isLoggedIn: true, user: response.data.user, missionPerms: null }));
        if (response.data.user.isSuperAdmin) {
          dispatch(
            setMissionPerms({ missionId: intMissionId, permissions: { view: true, edit: true } })
          );
        } else {
          const perms = response.data.user.permissionList?.find(
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
              <LeftTopPanel />
              <div className={styles.miniMapContainer}>
                <MiniMap
                  mapShowPos={mapShowPos}
                  mapShowScaleBar={mapShowScaleBar}
                  bigMapBounds={bigMapBounds}
                  mapSelectedPreset={mapSelectedPreset}
                  mapShowArrows={mapShowArrows}
                />
              </div>
            </div>
            <div className={`${styles.middlePanel} ${styles.mapBody}`}>
              <MapBody
                setMapShowPos={setMapShowPos}
                setMapShowScaleBar={setMapShowScaleBar}
                setBigMapBounds={setBigMapBounds}
                setMapSelectedPreset={setMapSelectedPreset}
                setMapShowArrows={setMapShowArrows}
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
