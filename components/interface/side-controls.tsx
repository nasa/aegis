import _ from "lodash";
import styles from "./side-controls.module.css";
import { FunctionComponent } from "react";
import { useSelector, useDispatch } from "react-redux";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { RootState } from "store";
import { setSectionSelected } from "store/interface";

import { paneTypes } from "components/interface/_paneTypes";

/* This control sits at the left side of the screen and loads the selected component based on the NavGutter icon selected */
export const LeftControlPanel: FunctionComponent = () => {
  const dispatch = useDispatch();
  const interfaceState = useSelector((state: RootState) => state.interface);

  const selectedNavItem = interfaceState.sectionSelectedLabel;

  const setSelectedNavItem = (itemLabel) => {
    dispatch(setSectionSelected(itemLabel));
  };

  let ActiveComponent = null;
  let title = null;
  if (!_.isNil(paneTypes[selectedNavItem])) {
    ActiveComponent = paneTypes[selectedNavItem].leftPane;
    title = paneTypes[selectedNavItem].title;
  }

  return (
    <div className={styles.body}>
      <NavGutter selectedNavItem={selectedNavItem} setSelectedNavItem={setSelectedNavItem} />
      <div className={styles.activeComponent}>
        <div
          className={styles.activeComponentTitle}
          style={{ color: paneTypes[selectedNavItem].color }}
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
  const interfaceState = useSelector((state: RootState) => state.interface);

  const selectedNavItem = interfaceState.sectionSelectedLabel;

  let ActiveComponent = null;
  if (!_.isNil(paneTypes[selectedNavItem])) {
    ActiveComponent = paneTypes[selectedNavItem].rightPane;
  }

  return (
    <>
      <div className={styles.activeComponentRight}>
        <ActiveComponent />
      </div>
    </>
  );
};

const NavGutter = ({ selectedNavItem, setSelectedNavItem }) => {
  const pois = useSelector((state: RootState) => state.poi.pois);
  const poisFromDb = useSelector((state: RootState) => state.poi.poisFromDb);
  const presets = useSelector((state: RootState) => state.preset.presets);
  const presetsFromDb = useSelector((state: RootState) => state.preset.presetsFromDb);

  return (
    <div className={styles.iconGutter}>
      {/* Loop through all of the paneTypes and draw them on the gutter */}
      {Object.keys(paneTypes).map((paneType) => {
        let itemModified = false;
        switch (paneType) {
          case "poi":
            itemModified = !_.isEqual(pois, poisFromDb);
            break;
          case "map_layer_selector":
            itemModified = !_.isEqual(presets, presetsFromDb);
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
              onClick={() => setSelectedNavItem(paneType)}
            >
              <FontAwesomeIcon icon={paneTypes[paneType].icon} size="lg" />
            </div>
            {itemModified && (
              <svg height="6" width="6" style={{ position: "absolute", top: "31", left: "31" }}>
                <circle cx="3" cy="3" r="3" fill="#ff0000" />
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
};
