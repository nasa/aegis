import _ from "lodash";
import { FunctionComponent } from "react";
import { useSelector, useDispatch } from "react-redux";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo, faSliders } from "@fortawesome/free-solid-svg-icons";

import Info_panel from "./_right_info_panel";
import Settings_panel from "./_right_settings_panel";
import paneStyles from "../global_pane_styles.module.css";
import { RootState } from "store";
import { setSelectedRightNavItem } from "store/map";

const panelTypes: PanelTypes = {
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

const RightControlPanel: FunctionComponent = () => {
  const dispatch = useDispatch();
  const selectedRightNavItem = useSelector((state: RootState) => state.map.selectedRightNavItem);
  const activeLayerName = useSelector((state: RootState) => state.map.activeLayerName);
  // const [selectedNavItem, setSelectedNavItem] = useState("information_window");
  let ActiveComponent = null;
  if (!_.isNil(panelTypes[selectedRightNavItem])) {
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
