import styles from "./left-control.module.css";
import { useState } from "react";

import { library } from "@fortawesome/fontawesome-svg-core";
import {
  faLayerGroup,
  faCaretDown,
  faCaretRight,
  faRoute,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import MapLayerSelector from "components/panes/map_layer_selector";
import EVA_Planner from "components/panes/eva_planner";

library.add(faLayerGroup, faCaretDown, faCaretRight, faRoute);

const LeftControlPanel = () => {
  const [selectedNavItem, setSelectedNavItem] = useState("eva_planner");

  const showSelectedNavItem = () => {
    switch (selectedNavItem) {
      case "map_layer_selector":
        return <MapLayerSelector />;
      case "eva_planner":
        return <EVA_Planner />;

      default:
        return <div>No nav match</div>;
    }
  };

  return (
    <div className={styles.body}>
      <NavGutter setSelectedNavItem={setSelectedNavItem} />
      <div className={styles.activeComponent}>{showSelectedNavItem()}</div>
    </div>
  );
};

export default LeftControlPanel;

const NavGutter = ({ setSelectedNavItem }) => {
  return (
    <div className={styles.iconGutter}>
      <div
        className={styles.icon}
        title={"Map Layer Selector"}
        onClick={() => setSelectedNavItem("map_layer_selector")}
      >
        <FontAwesomeIcon icon="layer-group" />
      </div>
      <div
        className={styles.icon}
        title={"EVA Planner"}
        onClick={() => setSelectedNavItem("eva_planner")}
      >
        <FontAwesomeIcon icon="route" />
      </div>
    </div>
  );
};
