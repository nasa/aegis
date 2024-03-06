import { useEffect, useState } from "react";
import { useAppDispatch } from "utils/useAppDispatch";
import { useAppSelector, deepEqual } from "utils/useAppSelector";
import { useParams } from "react-router-dom";

import styles from "./mission.module.css";
import { setMissionPerms, setUserStore } from "store/user";
import { Tooltip } from "react-tooltip";
import { isLoggedIn } from "http-client/login";
import { useNavigate } from "react-router-dom";

import Header from "components/interface/header";
import { LeftControlPanel } from "components/interface/side-controls";
import { RightControlPanel } from "components/interface/side-controls";
import { SunEarthPosition } from "components/interface/map/map-sunearth";
import { BottomControlPanel } from "components/interface/side-controls";
import SocketClient from "components/interface/page/socketClient";
import PopulateStore from "components/interface/page/populateStore";
import MapBody from "components/interface/map/map-body-leaflet"; // Adjust import as needed

type RouteParams = {
  id: string;
};

const Main = (): JSX.Element => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const missionStore = useAppSelector((state) => state.mission, deepEqual);

  const [hasPermissions, setHasPermissions] = useState(false);

  const params = useParams<RouteParams>();
  const slug = params.id;
  const intMissionId = parseInt(slug);

  useEffect(() => {
    window.sessionStorage.setItem("missionId", intMissionId.toString());
    window.sessionStorage.setItem("socketId", "null");
  }, [intMissionId]);

  useEffect(() => {
    if (!intMissionId) return;
    (async () => {
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
    })();
  }, [navigate, intMissionId, dispatch]);

  const showSunEarth =
    missionStore.mission &&
    (missionStore.mission.earthAzimuthVisible || missionStore.mission.sunAzimuthVisible);

  return (
    <>
      {hasPermissions && (
        <div className={styles.page}>
          <Tooltip
            id="aegis-tooltip"
            className={styles.tooltip}
            clickable={true}
            delayShow={1000}
            delayHide={500}
          />
          <div className={styles.header}>
            <Header />
          </div>
          <div className={styles.body}>
            <div className={styles.bodyLeft}>
              <div className={styles.leftUpper}>
                <div className={styles.leftControl}>
                  <LeftControlPanel />
                </div>
                <div className={styles.mapBody}>
                  {missionStore.mission && missionStore.layers && <MapBody />}
                  {showSunEarth && <SunEarthPosition />}
                </div>
              </div>
              <BottomControlPanel />
            </div>
            <RightControlPanel />
          </div>

          <SocketClient missionId={intMissionId} />
          <PopulateStore missionId={intMissionId} hasPermissions={hasPermissions} />
        </div>
      )}
    </>
  );
};

export default Main;
