import _ from "lodash";
import { FunctionComponent, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { library } from "@fortawesome/fontawesome-svg-core";
import { faCircleInfo, faSliders } from "@fortawesome/free-solid-svg-icons";

import Info_panel from "./_right_info_panel";
import Settings_panel from "./_right_settings_panel";
import paneStyles from "../global_pane_styles.module.css";
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

  return (
    <>
      <div className={paneStyles.rightIconRow}>
        {Object.keys(panelTypes).map((panelType) => {
          return (
            <div
              key={panelType}
              className={
                selectedNavItem === panelType
                  ? paneStyles.rightIconContainerSelected
                  : paneStyles.rightIconContainer
              }
            >
              <div
                className={paneStyles.rightIcon}
                style={{
                  color: selectedNavItem === panelType ? panelTypes[panelType].color : "white",
                }}
                title={panelTypes[panelType].title}
                onClick={() => setSelectedNavItem(panelType)}
              >
                <FontAwesomeIcon icon={panelTypes[panelType].icon} size="lg" />
              </div>
            </div>
          );
        })}
      </div>
      <ActiveComponent className={paneStyles.rightActiveWindow} />
    </>
  );
};

const RightControlPanel: FunctionComponent = () => {
  return <Info />;
};

export default RightControlPanel;
