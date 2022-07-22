import styles from "./left-control.module.css";
import { useState } from "react";

import { library } from "@fortawesome/fontawesome-svg-core";
import { faGlobe, faRoute } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import MapSelector from "components/panes/map_selector/map_selector";
import EvaPlanner from "components/panes/eva_planner";
import _ from "lodash";

library.add(faGlobe, faRoute);

const paneTypes: PaneTypes = {
  map_layer_selector: {
    title: "Map Imagery",
    pane: MapSelector,
    color: "var(--map)",
    icon: "globe",
  },
  eva_planner: {
    title: "EVA Planner",
    pane: EvaPlanner,
    color: "var(--eva)",
    icon: "route",
  },
};

const LeftControlPanel = () => {
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
