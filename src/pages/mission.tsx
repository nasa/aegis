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
import MapBody from "components/interface/map/map-body-leaflet"; // Adjust import as needed
import { getAll } from "http-client/all";
import { setAllSliceStores } from "store/crossActions";
import { initialState as wholeStoreInitialState } from "store/index";
import {
  auditActions,
  auditPresetsAgainstLayers,
  generatePresetUIStates,
} from "store/processing/audits";
import _ from "lodash";
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
    const populateStoreAsync = async () => {
      const wholeStoreState = await populateStore({ missionId: intMissionId });
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
        </div>
      )}
    </>
  );
};

export default Main;

const setRunningRexView = (params: { wholeStoreState: WholeStoreState }) => {
  const { wholeStoreState } = params;
  const runningRex = wholeStoreState.rex.rexes.find((rex) => rex.isRunning === true);
  if (runningRex) {
    wholeStoreState.rex.selectedRexUuid = runningRex.uuid;
    wholeStoreState.rex.expandedRexUuids = [runningRex.uuid];
    wholeStoreState.interface.rightPanelIsOpen = true;
    wholeStoreState.interface.sectionSelectedLabel = "rex";
    // Find the EVA UUID associated with the Rex and set it in the eva slice
    const evaUuid = wholeStoreState.rex.rexes.find((rex) => rex.uuid === runningRex.uuid)?.evaUuid;
    if (evaUuid) {
      wholeStoreState.eva.selectedEvaUuid = evaUuid;
      wholeStoreState.eva.selectedEvaRightNavItem = "actions_panel";
    }
  }
};

export const populateStore = async (params: { missionId: number }): Promise<WholeStoreState> => {
  const { missionId } = params;
  //get all data for a mission from a single endpoint
  const allDataRes: WrappedResponse<OneMissionToRuleThemAll> = await getAll(missionId);
  if (allDataRes.status !== "success" || !allDataRes.data) {
    return;
  } //gracefully handle an error if no data is returned?

  const wholeStoreState: WholeStoreState = _.cloneDeep(wholeStoreInitialState);
  wholeStoreState.action.actions = allDataRes.data.actions;
  wholeStoreState.action.actionsFromDb = allDataRes.data.actions;
  wholeStoreState.eva.evas = allDataRes.data.evas;
  wholeStoreState.eva.evasFromDb = allDataRes.data.evas;
  wholeStoreState.mission.mission = allDataRes.data.mission;
  wholeStoreState.mission.missionFromDb = allDataRes.data.mission;
  wholeStoreState.mission.layers = allDataRes.data.layers;
  wholeStoreState.mission.sublayers = allDataRes.data.sublayers;
  wholeStoreState.poi.pois = allDataRes.data.pois;
  wholeStoreState.poi.poisFromDb = allDataRes.data.pois;
  wholeStoreState.preset.presets = allDataRes.data.presets;
  wholeStoreState.preset.presetsFromDb = allDataRes.data.presets;
  wholeStoreState.rex.rexes = allDataRes.data.rexes;
  wholeStoreState.rex.rexesFromDb = allDataRes.data.rexes;
  wholeStoreState.station.stations = allDataRes.data.stations;
  wholeStoreState.station.stationsFromDb = allDataRes.data.stations;
  wholeStoreState.stm.level1s = allDataRes.data.level1s;
  wholeStoreState.stm.level2s = allDataRes.data.level2s;
  wholeStoreState.stm.level3s = allDataRes.data.level3s;
  wholeStoreState.traverse.traverses = allDataRes.data.traverses;
  wholeStoreState.traverse.traversesFromDb = allDataRes.data.traverses;

  // Run audits on the data returned, modifying the data as needed. Each audit function will save needed changes to the DB
  await auditPresetsAgainstLayers({ wholeStoreState });

  // Generate preset UI states that are in the store but not in the DB
  generatePresetUIStates({ wholeStoreState });

  //If a rex is running, then switch the interface to show the rex pane and EVA actions right panel
  setRunningRexView({ wholeStoreState });

  /**
   * Audit actions
   * These are permanent checks that protect against changes made via admin
   */
  await auditActions({ wholeStoreState });

  return wholeStoreState;
};
