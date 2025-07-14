import { useEffect, useState } from "react";
import { useAppDispatch } from "utils/useAppDispatch";
import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { useParams, useSearchParams } from "react-router";
import ReactDOM from "react-dom";
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
import MapBody from "components/interface/map/map-body-leaflet"; // Adjust import as needed
import { setAllSliceStores } from "store/crossActions";
import { getPaneTypes } from "components/interface/_paneTypes";
import { populateStore } from "store/processing/populateStore";
import { thunkSelectEvaAction } from "store/thunk/crossThunk";
import { loadAndReturnGrid } from "utils/grid";
import { setGridCornerPoint } from "store/map";

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
  const evaRefUuid = searchParams.get("evaRefUuid");
  const actionRefUuid = searchParams.get("actionRefUuid");
  const rexUuid = searchParams.get("rexUuid"); // optional

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

      // if evaRefUuid, actionRefUuid are present in the URL, set the selected action using thunk
      if (evaRefUuid && actionRefUuid) {
        dispatch(thunkSelectEvaAction({ evaRefUuid, actionRefUuid, rexUuid }));
      }
    };
    populateStoreAsync();
    //eslint-disable-next-line
  }, [permissions, evaRefUuid, actionRefUuid]);

  useEffect(() => {
    window.sessionStorage.setItem("missionId", intMissionId.toString());
    window.sessionStorage.setItem("socketId", "null");
  }, [intMissionId]);

  // in it's own useEffect incase grid changes while user is on the page
  useEffect(() => {
    const loadGridAsync = async () => {
      const newGrid: MissionGrid = await loadAndReturnGrid(
        intMissionId,
        missionStore.mission?.activeGridUuid
      );
      if (newGrid?.coordinates && newGrid.coordinates.length > 0) {
        dispatch(setGridCornerPoint(newGrid.coordinates[0][0]));
      } else {
        dispatch(setGridCornerPoint(null));
      }
    };

    loadGridAsync();
  }, [dispatch, intMissionId, missionStore.mission?.activeGridUuid]);

  useEffect(() => {
    if (!intMissionId) return;
    const isLoggedInAsync = async () => {
      const response = await isLoggedIn();
      if (response.status === "success") {
        let missionPerms: Permission = null;
        if (response.data.isSuperAdmin) {
          missionPerms = { missionId: intMissionId, permissions: { view: true, edit: true } };
        } else {
          missionPerms = response.data.permissionList?.find(
            (permission) => permission.missionId === intMissionId
          );
          if (!missionPerms || (!missionPerms.permissions.view && !missionPerms.permissions.edit))
            navigate("/");
        }
        dispatch(setAppUser({ isLoggedIn: true, user: response.data, missionPerms: missionPerms }));
        setPermissions(missionPerms);
        console.log("Logged in to AEGIS with user:", response.data.username);
      } else {
        navigate("/");
      }
    };
    isLoggedInAsync();
  }, [navigate, intMissionId, dispatch]);

  useEffect(() => {
    if (!missionStore?.mission?.name) {
      return;
    }
    document.title = `${missionStore.mission.name} - AEGIS`;
  }, [missionStore?.mission?.name]);

  // Put socket client into it's own react portal. If it's not in a portal, it will cause
  //  the react context internally to re-render every time a socket statuses comes in, which causes all
  //  descendants to re-render (like the map), which is not desired.
  function SocketClientPortal({ intMissionId }: { intMissionId: number }) {
    return ReactDOM.createPortal(<SocketClient missionId={intMissionId} />, document.body);
  }

  return (
    <>
      {permissions && (
        <>
          {missionStore.mission && missionStore.layers ? (
            <>
              {missionStore.mission.isArchived ? (
                <div className={styles.archivedBody}>
                  This mission has been archived. Please contact the EMSS team if you need to access
                  it.
                  <div style={{ marginTop: "3rem" }}>
                    <img src="/images/EMSS.svg" alt="EMSS Logo" className={styles.emssLogo} />
                  </div>
                </div>
              ) : (
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

                  <SocketClientPortal intMissionId={intMissionId} />
                </div>
              )}
            </>
          ) : (
            <div>Loading...</div>
          )}
        </>
      )}
    </>
  );
};

export default Main;
