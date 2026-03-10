import { useAppDispatch } from "utils/useAppDispatch";
import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { useParams, useSearchParams } from "react-router";
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
import { loadAndReturnGrid } from "utils/mapping/grid";
import { setGridCornerPoint } from "store/map";
import clientLogger from "utils/logging/clientLogger";
import { useMissionDocSelector } from "utils/useDocSelector";
import { useRepo } from "@automerge/automerge-repo-react-hooks";
import { useEffect } from "react";

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
  const permissions = useAppSelector((state) => state.user.missionPerms, deepEqual);
  const hasMissionLayers = useAppSelector((state) => {
    return state.mission.layers?.length > 0;
  }, refEqual);

  const [searchParams] = useSearchParams();
  const evaRefUuid = searchParams.get("evaRefUuid");
  const actionRefUuid = searchParams.get("actionRefUuid");
  const rexUuid = searchParams.get("rexUuid"); // optional

  const params = useParams<RouteParams>();
  const slug = params.id;
  const intMissionId = parseInt(slug);
  const partialMission = useMissionDocSelector(
    (doc) => ({
      actionSystemVersion: doc.actionSystemVersion,
      isArchived: doc.isArchived,
      name: doc.name,
      activeGridUuid: doc.activeGridUuid,
    }),
    deepEqual
  );

  const paneTypes = getPaneTypes(partialMission?.actionSystemVersion);
  const paneType: PaneType = paneTypes[interfaceStateLabel as keyof PaneTypes];

  useEffect(() => {
    let missionPerms: Permission = null;
    // let unsubscribeObserver: Unsubscribe;
    (async () => {
      // get permissions
      const response = await isLoggedIn();
      if (response.status !== "success") {
        navigate("/"); // kick user out back to homepage
      }
      if (response.data.isSuperAdmin) {
        missionPerms = { missionId: intMissionId, permissions: { view: true, edit: true } };
      } else {
        missionPerms = response.data.permissionList?.find(
          (permission) => permission.missionId === intMissionId
        );
        if (!missionPerms || (!missionPerms.permissions.view && !missionPerms.permissions.edit))
          navigate("/");
      }

      // populate the user store
      dispatch(setAppUser({ isLoggedIn: true, user: response.data, missionPerms: missionPerms }));
      console.log("AEGIS Username:", response.data.username);
      // log user to the emss logging system
      clientLogger.info({
        logId: "aegis-login",
        appUsername: response.data.username,
        missionId: intMissionId,
      });

      // get the rest of the store data
      let wholeStoreState: WholeStoreState;
      if (missionPerms.permissions?.edit) {
        wholeStoreState = await populateStore({
          missionId: intMissionId,
          runAudit: true,
          automergeRepo,
        });
      } else {
        // user does not have edit permissions, so do not run audit (which causes DB changes)
        wholeStoreState = await populateStore({
          missionId: intMissionId,
          runAudit: false,
          automergeRepo,
        });
      }

      /**
       * dispatch a single action to populate the stores across all slices using the wholeStoreState
       */
      dispatch(setAllSliceStores(wholeStoreState));

      // if evaRefUuid, actionRefUuid are present in the URL, set the selected action using thunk
      if (evaRefUuid && actionRefUuid) {
        dispatch(thunkSelectEvaAction({ evaRefUuid, actionRefUuid, rexUuid }));
      }
    })();
  }, [automergeRepo, dispatch, intMissionId, navigate, evaRefUuid, actionRefUuid, rexUuid]);

  useEffect(() => {
    // update session storage information. This is for sockets
    window.sessionStorage.setItem("missionId", intMissionId.toString());
    window.sessionStorage.setItem("socketId", "null");
  }, [intMissionId]);

  // in it's own useEffect in case grid changes while user is on the page
  useEffect(() => {
    const loadGridAsync = async () => {
      const newGrid: MissionGrid = await loadAndReturnGrid(
        intMissionId,
        partialMission?.activeGridUuid
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
    if (!partialMission?.name) {
      return;
    }
    document.title = `${partialMission.name} - AEGIS`;
  }, [partialMission?.name]);

  return (
    <>
      {permissions && (
        <>
          {partialMission ? (
            <>
              {partialMission.isArchived ? (
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
                          <div className={styles.mapBody}>{hasMissionLayers && <MapBody />}</div>
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
          ) : (
            <div>Loading...</div>
          )}
        </>
      )}
    </>
  );
};

export default Main;
