import _ from "lodash";
import styles from "./left-control.module.css";
import { FunctionComponent, useState } from "react";
import MapSelector from "components/panes/map_selector/map_selector";
import EvaPlanner from "components/panes/eva_planner/eva_planner";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { library } from "@fortawesome/fontawesome-svg-core";
import { faGlobe, faRoute } from "@fortawesome/free-solid-svg-icons";
library.add(faGlobe, faRoute);

const paneTypes: PaneTypes = {
  map_layer_selector: {
    title: "Map Imagery",
    pane: MapSelector,
    color: "var(--map)",
    icon: "globe",
  },
  eva_planner: {
    title: "EVA Planning",
    pane: EvaPlanner,
    color: "var(--eva)",
    icon: "route",
  },
};

/* This control sits at the left side of the screen and loads the selected component based on the NavGutter icon selected */

const LeftControlPanel: FunctionComponent = () => {
  const [selectedNavItem, setSelectedNavItem] = useState("eva_planner");

  let ActiveComponent = null;
  let title = null;
  if (!_.isNil(paneTypes[selectedNavItem])) {
    ActiveComponent = paneTypes[selectedNavItem].pane;
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

export default LeftControlPanel;

const NavGutter = ({ selectedNavItem, setSelectedNavItem }) => {
  return (
    <div className={styles.iconGutter}>
      {/* Loop through all of the paneTypes and draw them on the gutter */}
      {Object.keys(paneTypes).map((paneType) => {
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
          </div>
        );
      })}
    </div>
  );
};
