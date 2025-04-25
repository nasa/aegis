import { useEffect, useState } from "react";
import { useAppDispatch } from "utils/useAppDispatch";
import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { useParams, useSearchParams } from "react-router";

import styles from "./mission.module.css";
import { setUserStore } from "store/user";
import { Tooltip } from "react-tooltip";
import { isLoggedIn } from "http-client/login";
import { useNavigate } from "react-router";

import Header from "components/interface/header";
import { LeftControlPanel, NavGutter } from "components/interface/side-controls";
import { RightControlPanel } from "components/interface/side-controls";
import { BottomControlPanel } from "components/interface/side-controls";
import SocketClient from "components/page/socketClient";
import MapBody from "components/interface/map/map-body-leaflet"; // Adjust import as needed
import { setAllSliceStores } from "store/crossActions";
import { getPaneTypes } from "components/interface/_paneTypes";
import { populateStore } from "store/processing/populateStore";
import { thunkSelectEvaAction } from "store/thunk/crossThunk";

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

  const [permissions, setPermissions] = useState<Permission>(null);
  const [searchParams] = useSearchParams();
  const evaUuid = searchParams.get("evaUuid");
  const actionUuid = searchParams.get("actionUuid");

  const params = useParams<RouteParams>();
  const slug = params.id;
  const intMissionId = parseInt(slug);

  const paneTypes = getPaneTypes(missionStore.mission?.actionSystemVersion);

  const paneType: PaneType = paneTypes[interfaceStateLabel as keyof PaneTypes];

  useEffect(() => {
    // wait for permissions to be set before populating store
    if (!permissions) return;
    const populateStoreAsync = async () => {
      let wholeStoreState: WholeStoreState;
      if (permissions.permissions?.edit) {
        wholeStoreState = await populateStore({ missionId: intMissionId, runAudit: true });
      } else {
        // user does not have edit permissions, so do not run audit (which causes DB changes)
        wholeStoreState = await populateStore({ missionId: intMissionId, runAudit: false });
      }
      /**
       * dispatch a single action to populate the stores across all slices using the wholeStoreState
       */
      dispatch(setAllSliceStores(wholeStoreState));

      // if evaUuid, actionUuid are present in the URL, set the selected action using thunk
      if (evaUuid && actionUuid) {
        dispatch(thunkSelectEvaAction({ evaUuid, actionUuid }));
      }
    };
    populateStoreAsync();
    //eslint-disable-next-line
  }, [permissions, evaUuid, actionUuid]);

  useEffect(() => {
    window.sessionStorage.setItem("missionId", intMissionId.toString());
    window.sessionStorage.setItem("socketId", "null");
  }, [intMissionId]);

  useEffect(() => {
    if (!intMissionId) return;
    const isLoggedInAsync = async () => {
      const response = await isLoggedIn();
      if (response.status === "success") {
        let missionPerms: Permission = null;
        if (response.data.user.isSuperAdmin) {
          missionPerms = { missionId: intMissionId, permissions: { view: true, edit: true } };
        } else {
          missionPerms = response.data.user.permissionList?.find(
            (permission) => permission.missionId === intMissionId
          );
          if (!missionPerms || (!missionPerms.permissions.view && !missionPerms.permissions.edit))
            navigate("/");
        }
        dispatch(
          setUserStore({ isLoggedIn: true, user: response.data.user, missionPerms: missionPerms })
        );
        setPermissions(missionPerms);
      } else {
        navigate("/");
      }
    };
    isLoggedInAsync();
  }, [navigate, intMissionId, dispatch]);

  return (
    <>
      {permissions && (
        <>
          {missionStore.mission && missionStore.layers ? (
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
          ) : (
            <div>Loading...</div>
          )}
        </>
      )}
    </>
  );
};

export default Main;
