import styles from "./right-control.module.css";
import { FunctionComponent, useState } from "react";
import Info_panel from "../panes/map_selector/info_panel";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { library } from "@fortawesome/fontawesome-svg-core";
import { faCircleInfo, faSliders } from "@fortawesome/free-solid-svg-icons";
import _ from "lodash";
import Settings_panel from "../panes/map_selector/settings_panel";
library.add(faCircleInfo, faSliders);
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "store";
import { paneTypes } from "components/interface/_paneTypes";
import _ from "lodash";

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

const RightControlPanel: FunctionComponent = () => {
  const dispatch = useDispatch();
  const interfaceState = useSelector((state: RootState) => state.interface);

  const selectedNavItem = interfaceState.sectionSelectedLabel;

  let ActiveComponent = null;
  let title = null;
  if (!_.isNil(paneTypes[selectedNavItem])) {
    ActiveComponent = paneTypes[selectedNavItem].rightPane;
    title = paneTypes[selectedNavItem].title;
  }

  return (
    <div className={styles.body}>
      <ActiveComponent />
    </div>
  );
};

export default RightControlPanel;
