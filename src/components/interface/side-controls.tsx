import _ from "lodash";
import styles from "./side-controls.module.css";
import { FunctionComponent, useEffect } from "react";
import { useAppSelector, refEqual, shallowEqual } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  setBottomPanelOpen,
  setLeftPanelOpen,
  setRightPanelOpen,
  setSectionSelected,
} from "store/interface";

import { paneTypes } from "components/interface/_paneTypes";
import { setSelectedEvaUuid, setSelectedEvaRightNavItem } from "store/eva";
import NavTimeline from "components/interface/timeline/timeline";
import { isModified } from "utils/component-helpers";
import paneStyles from "../panes/global-pane-styles.module.css";
import {
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faChevronUp,
} from "@fortawesome/free-solid-svg-icons";

/* This control sits at the left side of the screen and loads the selected component based on the NavGutter icon selected */
export const LeftControlPanel: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const leftPanelOpen = useAppSelector((state) => state.interface.leftPanelOpen, refEqual);
  const interfaceStateLabel = useAppSelector(
    (state) => state.interface.sectionSelectedLabel,
    refEqual
  );

  let ActiveComponent = null;
  let title = null;
  const paneType: PaneType = paneTypes[interfaceStateLabel as keyof PaneTypes];
  if (!_.isNil(paneType)) {
    ActiveComponent = paneType.leftPane;
    title = paneType.title;
  }

  return (
    <div className={styles.body}>
      <NavGutter selectedNavItem={interfaceStateLabel} />

      {leftPanelOpen && (
        <div className={styles.activeComponent}>
          <div className={styles.activeComponentTitle} style={{ color: paneType.color }}>
            {title}
          </div>
          <ActiveComponent />
        </div>
      )}
      <div className={styles.drawerLeft} onClick={() => dispatch(setLeftPanelOpen(!leftPanelOpen))}>
        <div className={styles.drawerLeftTab}>
          {leftPanelOpen ? (
            <FontAwesomeIcon className={styles.drawerLeftIcon} color="white" icon={faChevronLeft} />
          ) : (
            <FontAwesomeIcon
              className={styles.drawerLeftIcon}
              color="white"
              icon={faChevronRight}
            />
          )}
          <div className={styles.drawerLeftSvg}>
            <img src="/images/drawerNub.svg" alt="Open/Close Timline" />
          </div>
        </div>
      </div>
    </div>
  );
};

export const BottomControlPanel: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const bottomPanelOpen = useAppSelector((state) => state.interface.bottomPanelOpen, refEqual);
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);

  useEffect(() => {
    if (selectedEvaUuid) {
      dispatch(setBottomPanelOpen(true));
    } else {
      dispatch(setBottomPanelOpen(false));
    }
  }, [selectedEvaUuid, dispatch]);

  return (
    <>
      <div
        className={styles.drawerBottom}
        onClick={() => dispatch(setBottomPanelOpen(!bottomPanelOpen))}
      >
        <div className={styles.drawerBottomTab}>
          {bottomPanelOpen ? (
            <FontAwesomeIcon
              className={styles.drawerBottomIcon}
              color="white"
              icon={faChevronDown}
            />
          ) : (
            <FontAwesomeIcon className={styles.drawerBottomIcon} color="white" icon={faChevronUp} />
          )}
          <div className={styles.drawerBottomSvg}>
            <img src="/images/drawerNub.svg" alt="Open/Close Timline" />
          </div>
        </div>
      </div>
      {bottomPanelOpen && (
        <div className={styles.activeComponentBottom}>
          <NavTimeline />
        </div>
      )}
    </>
  );
};

/* This control sits at the right side of the screen and displays the active pane for that position */
export const RightControlPanel: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const interfaceStateLabel = useAppSelector(
    (state) => state.interface.sectionSelectedLabel,
    refEqual
  );
  const rightPanelOpen = useAppSelector((state) => state.interface.rightPanelOpen, refEqual);

  let ActiveComponent = null;
  const paneType: PaneType = paneTypes[interfaceStateLabel as keyof PaneTypes];
  if (!_.isNil(paneType)) {
    ActiveComponent = paneType.rightPane;
  }

  return (
    <>
      <div
        className={styles.drawerRight}
        onClick={() => dispatch(setRightPanelOpen(!rightPanelOpen))}
      >
        <div className={styles.drawerRightTab}>
          {rightPanelOpen ? (
            <FontAwesomeIcon
              className={styles.drawerRightIcon}
              color="white"
              icon={faChevronRight}
            />
          ) : (
            <FontAwesomeIcon
              className={styles.drawerRightIcon}
              color="white"
              icon={faChevronLeft}
            />
          )}
          <div className={styles.drawerRightSvg}>
            <img src="/images/drawerNub.svg" alt="Open/Close Timline" />
          </div>
        </div>
      </div>

      {rightPanelOpen && (
        <div className={styles.rightControl}>
          <div className={styles.activeComponentRight}>
            <ActiveComponent />
          </div>
        </div>
      )}
    </>
  );
};

const NavGutter: FunctionComponent<{ selectedNavItem: InterfaceSection }> = ({
  selectedNavItem,
}) => {
  const dispatch = useAppDispatch();
  const mission = useAppSelector((state) => state.mission.mission, shallowEqual);
  const missionFromDb = useAppSelector((state) => state.mission.missionFromDb, shallowEqual);
  const pois = useAppSelector((state) => state.poi.pois, shallowEqual);
  const poisFromDb = useAppSelector((state) => state.poi.poisFromDb, shallowEqual);
  const selectedPoiUuid = useAppSelector((state) => state.poi.selectedPoiUuid, refEqual);
  const presets = useAppSelector((state) => state.preset.presets, shallowEqual);
  const presetsFromDb = useAppSelector((state) => state.preset.presetsFromDb, shallowEqual);
  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const stations = useAppSelector((state) => state.station.stations, shallowEqual);
  const stationsFromDb = useAppSelector((state) => state.station.stationsFromDb, shallowEqual);
  const selectedStationUuid = useAppSelector(
    (state) => state.station.selectedStationUuid,
    refEqual
  );
  const poiActions = useAppSelector(
    (state) => state.action.actions.filter((storeAction) => storeAction.poiUuid),
    shallowEqual
  );
  const poiActionsFromDb = useAppSelector(
    (state) => state.action.actionsFromDb.filter((storeAction) => storeAction.poiUuid),
    shallowEqual
  );
  const stationActions = useAppSelector(
    (state) => state.action.actions.filter((storeAction) => storeAction.stationUuid),
    shallowEqual
  );
  const stationActionsFromDb = useAppSelector(
    (state) => state.action.actionsFromDb.filter((storeAction) => storeAction.stationUuid),
    shallowEqual
  );
  const evas = useAppSelector((state) => state.eva.evas, shallowEqual);
  const evasFromDb = useAppSelector((state) => state.eva.evasFromDb, shallowEqual);
  const traverses = useAppSelector((state) => state.traverse.traverses, shallowEqual);
  const traversesFromDb = useAppSelector((state) => state.traverse.traversesFromDb, shallowEqual);
  const rexes = useAppSelector((state) => state.rex.rexes, shallowEqual);
  const rexesFromDb = useAppSelector((state) => state.rex.rexesFromDb, shallowEqual);
  const selectedRexUuid = useAppSelector((state) => state.rex.selectedRexUuid, refEqual);

  const selectedEvaRightNavItem = useAppSelector(
    (state) => state.eva.selectedEvaRightNavItem,
    refEqual
  );

  return (
    <div className={styles.iconGutter}>
      {/* Loop through all of the paneTypes and draw them on the gutter */}
      {Object.keys(paneTypes).map((paneType: InterfaceSection) => {
        let itemModified = false;
        switch (paneType) {
          case "mission":
            itemModified = mission?.updatedAt !== missionFromDb?.updatedAt;
            break;
          case "preset":
            itemModified = isModified(presets, presetsFromDb);
            break;
          case "poi":
            const poiEqual = isModified(pois, poisFromDb);
            const poiActionEqual = isModified(poiActions, poiActionsFromDb);
            itemModified = poiEqual || poiActionEqual;
            break;
          case "station":
            const stationsEqual = isModified(stations, stationsFromDb);
            const stationActionEqual = isModified(stationActions, stationActionsFromDb);
            itemModified = stationsEqual || stationActionEqual;
            break;
          case "evas":
            const evasEqual = isModified(evas, evasFromDb);
            const traversesEqual = isModified(traverses, traversesFromDb);
            const evaStationUuids = _.uniq(
              _.flatten(
                evas.map((eva) => {
                  const stationSeqItems = eva.sequence.filter(
                    (seqItem) => seqItem.type === "station"
                  );
                  return stationSeqItems.map((s) => s.uuid);
                })
              )
            );
            const evaStations = stations.filter((s) => evaStationUuids.includes(s.uuid));
            const evaStationsFromDb = stationsFromDb.filter((s) =>
              evaStationUuids.includes(s.uuid)
            );
            const evaStationsEqual = isModified(evaStations, evaStationsFromDb);
            itemModified = evasEqual || traversesEqual || evaStationsEqual;
            break;
          case "rex":
            itemModified = isModified(rexes, rexesFromDb);
            break;
        }

        const pane: PaneType = paneTypes[paneType as keyof PaneTypes];
        return (
          <div
            key={paneType}
            className={
              selectedNavItem === paneType ? styles.iconContainerSelected : styles.iconContainer
            }
          >
            <div
              className={styles.icon}
              style={{ color: pane.color }}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-html={pane.title}
              onClick={() => {
                dispatch(setLeftPanelOpen(true));
                dispatch(setSectionSelected(paneType));
                switch (paneType) {
                  case "mission":
                    dispatch(setRightPanelOpen(true));
                    break;
                  case "preset":
                    dispatch(setRightPanelOpen(selectedPresetUuid !== null));
                    dispatch(setSelectedEvaUuid(null));
                    break;
                  case "poi":
                    dispatch(setRightPanelOpen(selectedPoiUuid !== null));
                    dispatch(setSelectedEvaUuid(null));
                    break;
                  case "station":
                    dispatch(setRightPanelOpen(selectedStationUuid !== null));
                    dispatch(setSelectedEvaUuid(null));
                    break;
                  case "evas":
                    dispatch(setRightPanelOpen(false));
                    break;
                  case "rex":
                    dispatch(setSelectedEvaUuid(null));
                    dispatch(setRightPanelOpen(selectedRexUuid !== null));
                    if (!selectedEvaRightNavItem)
                      dispatch(setSelectedEvaRightNavItem("info_panel"));
                }
              }}
            >
              <FontAwesomeIcon icon={pane.icon} size="lg" />
              {itemModified && (
                <svg height="6" width="6" style={{ position: "absolute", top: "31", left: "31" }}>
                  <circle cx="3" cy="3" r="3" fill="#ff0000" />
                </svg>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const RightTabs: FunctionComponent<{
  selectedRightNavItem: string;
  panelTypes: PanelTypes;
  dispatchFunction: Function;
}> = ({ selectedRightNavItem, panelTypes, dispatchFunction }) => {
  const dispatch = useAppDispatch();
  return (
    <div className={paneStyles.rightIconRow}>
      {Object.keys(panelTypes).map((panelType) => {
        return (
          <div
            key={panelType}
            className={
              selectedRightNavItem === panelType
                ? paneStyles.rightIconContainerSelectedPreset
                : paneStyles.rightIconContainer
            }
            onClick={() => dispatch(dispatchFunction(panelType))}
          >
            <div
              className={paneStyles.rightIcon}
              style={{
                color:
                  selectedRightNavItem === panelType
                    ? panelTypes[panelType].selectedColor
                    : "white",
              }}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-html={panelTypes[panelType].title}
            >
              <FontAwesomeIcon icon={panelTypes[panelType].icon} size="lg" />
            </div>
          </div>
        );
      })}
    </div>
  );
};
