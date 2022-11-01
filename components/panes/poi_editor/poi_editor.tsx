import styles from "./poi_editor.module.css";
import paneStyles from "../left_pane_styles.module.css";
import { FunctionComponent, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "store";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import PoiList from "./_poi_list";

const PoiEditorLeft: FunctionComponent = () => {
  const [expandedSections, setExpandedSections] = useState({
    systemPresets: true,
    userPresets: false,
    details: false,
  });

  return (
    <>
      <PoiList expandedSections={expandedSections} setExpandedSections={setExpandedSections} />
    </>
  );
};

export default PoiEditorLeft;
