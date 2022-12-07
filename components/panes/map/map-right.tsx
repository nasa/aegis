import { FunctionComponent } from "react";
import { useSelector, useDispatch } from "react-redux";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo, faHammer, faSliders } from "@fortawesome/free-solid-svg-icons";

import Info_panel from "./map-right-info-panel";
import Settings_panel from "./map-right-settings-panel";
import Preset_panel from "./map-right-preset-panel";
import paneStyles from "../global-pane-styles.module.css";
import { RootState } from "store";
import { setSelectedRightNavItem } from "store/map";

let panelTypes: PanelTypes;

const RightControlPanel: FunctionComponent = () => {
  const dispatch = useDispatch();
  const selectedRightNavItem = useSelector((state: RootState) => state.map.selectedRightNavItem);
  const activeLayerName = useSelector((state: RootState) => state.map.activeSelectedName);
  const activeSelectedType = useSelector((state: RootState) => state.map.activeSelectedType);
  let ActiveComponent = null;

  switch (activeSelectedType) {
    case "layer": {
      panelTypes = {
        information_panel: {
          title: "Layer Information",
          panel: Info_panel,
          color: "var(--map)",
          icon: faCircleInfo,
        },
        settings_panel: {
          title: "Layer Settings",
          panel: Settings_panel,
          color: "var(--map)",
          icon: faSliders,
        },
      };
      break;
    }
    case "preset": {
      panelTypes = {
        preset_panel: {
          title: "Layer Presets",
          panel: Preset_panel,
          color: "var(--map)",
          icon: faHammer,
        },
      };
    }
    default: {
      break;
    }
  }
  if (selectedRightNavItem !== null) {
    ActiveComponent = panelTypes[selectedRightNavItem].panel;
  }

  return (
    activeLayerName && (
      <>
        <div className={paneStyles.rightTopTitle} style={{ color: "var(--map)" }}>
          {activeLayerName}
        </div>
        <div className={paneStyles.rightIconRow}>
          {Object.keys(panelTypes).map((panelType) => {
            return (
              <div
                key={panelType}
                className={
                  selectedRightNavItem === panelType
                    ? paneStyles.rightIconContainerSelected
                    : paneStyles.rightIconContainer
                }
              >
                <div
                  className={paneStyles.rightIcon}
                  style={{
                    color:
                      selectedRightNavItem === panelType ? panelTypes[panelType].color : "white",
                  }}
                  title={panelTypes[panelType].title}
                  onClick={() => dispatch(setSelectedRightNavItem(panelType))}
                >
                  <FontAwesomeIcon icon={panelTypes[panelType].icon} size="lg" />
                </div>
              </div>
            );
          })}
        </div>
        <ActiveComponent className={paneStyles.rightActiveWindow} />
      </>
    )
  );
};

export default RightControlPanel;
