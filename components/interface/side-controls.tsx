import _ from "lodash";
import styles from "./side-controls.module.css";
import { FunctionComponent } from "react";
import { useDispatch } from "react-redux";
import { useAppSelector, refEqual, shallowEqual } from "utils/useAppSelector";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { setSectionSelected } from "store/interface";

import { paneTypes } from "components/interface/_paneTypes";
import { setSelectedEvaUuid } from "store/eva";

/* This control sits at the left side of the screen and loads the selected component based on the NavGutter icon selected */
export const LeftControlPanel: FunctionComponent = () => {
  const interfaceStateLabel = useAppSelector(
    (state) => state.interface.sectionSelectedLabel,
    refEqual
  );

  let ActiveComponent = null;
  let title = null;
  if (!_.isNil(paneTypes[interfaceStateLabel])) {
    ActiveComponent = paneTypes[interfaceStateLabel].leftPane;
    title = paneTypes[interfaceStateLabel].title;
  }

  return (
    <div className={styles.body}>
      <NavGutter selectedNavItem={interfaceStateLabel} />
      <div className={styles.activeComponent}>
        <div
          className={styles.activeComponentTitle}
          style={{ color: paneTypes[interfaceStateLabel].color }}
        >
          {title}
        </div>
        <ActiveComponent />
      </div>
    </div>
  );
};

/* This control sits at the right side of the screen and displays the active pane for that position */
export const RightControlPanel: FunctionComponent = () => {
  const interfaceStateLabel = useAppSelector(
    (state) => state.interface.sectionSelectedLabel,
    refEqual
  );

  let ActiveComponent = null;
  if (!_.isNil(paneTypes[interfaceStateLabel])) {
    ActiveComponent = paneTypes[interfaceStateLabel].rightPane;
  }

  return (
    <>
      <div className={styles.activeComponentRight}>
        <ActiveComponent />
      </div>
    </>
  );
};

const NavGutter: FunctionComponent<{ selectedNavItem: InterfaceSection }> = ({
  selectedNavItem,
}) => {
  const dispatch = useDispatch();
  const pois = useAppSelector((state) => state.poi.pois, shallowEqual);
  const poisFromDb = useAppSelector((state) => state.poi.poisFromDb, shallowEqual);
  const presets = useAppSelector((state) => state.preset.presets, shallowEqual);
  const presetsFromDb = useAppSelector((state) => state.preset.presetsFromDb, shallowEqual);
  const stations = useAppSelector((state) => state.station.stations, shallowEqual);
  const stationsFromDb = useAppSelector((state) => state.station.stationsFromDb, shallowEqual);
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

  return (
    <div className={styles.iconGutter}>
      {/* Loop through all of the paneTypes and draw them on the gutter */}
      {Object.keys(paneTypes).map((paneType: InterfaceSection) => {
        let itemModified = false;
        switch (paneType) {
          case "poi":
            const poiEqual = _.isEqual(_.sortBy(pois, ["uuid"]), _.sortBy(poisFromDb, ["uuid"]));
            const poiActionEqual = _.isEqual(
              _.sortBy(poiActions, ["uuid"]),
              _.sortBy(poiActionsFromDb, ["uuid"])
            );
            itemModified = !poiEqual || !poiActionEqual;
            break;
          case "map_layer_selector":
            itemModified = !_.isEqual(presets, presetsFromDb);
            break;
          case "station":
            const stationsEqual = _.isEqual(
              _.sortBy(stations, ["uuid"]),
              _.sortBy(stationsFromDb, ["uuid"])
            );
            const stationActionEqual = _.isEqual(
              _.sortBy(stationActions, ["uuid"]),
              _.sortBy(stationActionsFromDb, ["uuid"])
            );
            itemModified = !stationsEqual || !stationActionEqual;
            break;
        }

        return (
          <div
            key={paneType}
            className={
              selectedNavItem === paneType ? styles.iconContainerSelected : styles.iconContainer
            }
          >
            <div
              className={styles.icon}
              style={{ color: paneTypes[paneType].color }}
              title={paneTypes[paneType].title}
              onClick={() => {
                dispatch(setSectionSelected(paneType));
                dispatch(setSelectedEvaUuid(null));
              }}
            >
              <FontAwesomeIcon icon={paneTypes[paneType].icon} size="lg" />
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
