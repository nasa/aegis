import styles from "./right-control.module.css";
import { FunctionComponent, useState } from "react";
import Info_panel from "../panes/map_selector/info_panel";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { library } from "@fortawesome/fontawesome-svg-core";
import { faCircleInfo, faSliders } from "@fortawesome/free-solid-svg-icons";
import _ from "lodash";
import Settings_panel from "../panes/map_selector/settings_panel";
library.add(faCircleInfo, faSliders);

const panelTypes: PanelTypes = {
  information_window: {
    title: "Information",
    panel: Info_panel,
    color: "var(--map)",
    icon: "circle-info",
  },
  information2_window: {
    title: "Map Imagery",
    panel: Settings_panel,
    color: "var(--map)",
    icon: "sliders",
  },
};

const Info = () => {
  const [selectedNavItem, setSelectedNavItem] = useState("information_window");
  let ActiveComponent = null;
  if (!_.isNil(panelTypes[selectedNavItem])) {
    ActiveComponent = panelTypes[selectedNavItem].panel;
  }

  //Placeholder component for info
  return (
    <div className={styles.rightControl}>
      <div className={styles.header}>
        <h2 className={styles.headerText}>Terrain Difficulty (Walk)</h2>
      </div>
      {Object.keys(panelTypes).map((panelType) => {
        return (
          <div key={panelType} className={styles.iconRow}>
            <div
              className={
                selectedNavItem === panelType ? styles.iconContainerSelected : styles.iconContainer
              }
            >
              <div
                className={styles.icon}
                style={{
                  color: selectedNavItem === panelType ? panelTypes[panelType].color : "white",
                }}
                title={panelTypes[panelType].title}
                onClick={() => setSelectedNavItem(panelType)}
              >
                <FontAwesomeIcon icon={panelTypes[panelType].icon} size="lg" />
              </div>
            </div>
          </div>
        );
      })}
      <ActiveComponent classNamw={styles.activeWindow} />
    </div>
  );
};

const RightControlPanel: FunctionComponent = () => {
  return (
    <div className={styles.body}>
      <Info />
    </div>
  );
};

export default RightControlPanel;
