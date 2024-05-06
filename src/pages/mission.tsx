import { useEffect, useState } from "react";
import { useAppDispatch } from "utils/useAppDispatch";
import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { useParams } from "react-router-dom";

import styles from "./mission.module.css";
import { setMissionPerms, setUserStore } from "store/user";
import { Tooltip } from "react-tooltip";
import { isLoggedIn } from "http-client/login";
import { useNavigate } from "react-router-dom";

import Header from "components/interface/header";
import { LeftControlPanel, NavGutter } from "components/interface/side-controls";
import { RightControlPanel } from "components/interface/side-controls";
import { BottomControlPanel } from "components/interface/side-controls";
import SocketClient from "components/page/socketClient";
import MapBody from "components/interface/map/map-body-leaflet"; // Adjust import as needed
import { setAllSliceStores } from "store/crossActions";
import { paneTypes } from "components/interface/_paneTypes";
import { populateStore } from "store/processing/populateStore";

type RouteParams = {
  id: string;
};

const Main = (): JSX.Element => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const missionStore = useAppSelector((state) => state.mission, deepEqual);
  const interfaceStateLabel = useAppSelector(
    (state) => state.interface.sectionSelectedLabel,
    refEqual
  );

  const [hasPermissions, setHasPermissions] = useState(false);

  const params = useParams<RouteParams>();
  const slug = params.id;
  const intMissionId = parseInt(slug);

  const paneType: PaneType = paneTypes[interfaceStateLabel as keyof PaneTypes];

  useEffect(() => {
    const populateStoreAsync = async () => {
      const wholeStoreState = await populateStore({ missionId: intMissionId, runAudit: true });
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
                  <div className={styles.mapBody}>
                    {missionStore.mission && missionStore.layers && <MapBody />}
                  </div>
                </div>
                <BottomControlPanel />
              </div>
              <RightControlPanel />
            </div>
          )}

          <SocketClient missionId={intMissionId} />
        </div>
      )}
    </>
  );
};

export default Main;
