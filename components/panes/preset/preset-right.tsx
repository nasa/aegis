import { FunctionComponent } from "react";
import { useSelector, useDispatch } from "react-redux";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo, faLayerGroup } from "@fortawesome/free-solid-svg-icons";

import Info_panel from "./preset-right-info-panel";
import Layers_Panel from "./preset-right-layers-panel";
import paneStyles from "../global-pane-styles.module.css";
import { RootState } from "store";
import { setSelectedRightNavItem } from "store/preset";

const RightControlPanel: FunctionComponent = () => {
  const dispatch = useDispatch();
  const selectedRightNavItem = useSelector((state: RootState) => state.preset.selectedRightNavItem);
  const selectedPresetUuid = useSelector((state: RootState) => state.preset.selectedPresetUuid);
  const selectedPreset = useSelector((state: RootState) => state.preset.presets).filter(
    (preset) => preset.uuid === selectedPresetUuid
  )[0];
  let ActiveComponent = null;

  const panelTypes: PanelTypes = {
    info_panel: {
      title: "Preset Information",
      panel: Info_panel,
      color: "var(--map)",
      icon: faCircleInfo,
    },
    layers_panel: {
      title: "Preset Layer Configuration",
      panel: Layers_Panel,
      color: "var(--map)",
      icon: faLayerGroup,
    },
  };

  if (selectedRightNavItem !== null) {
    ActiveComponent = panelTypes[selectedRightNavItem].panel;
  }

  return (
    selectedPreset && (
      <>
        <div className={paneStyles.rightTopTitle} style={{ color: "var(--map)" }}>
          {selectedPreset.name}
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
