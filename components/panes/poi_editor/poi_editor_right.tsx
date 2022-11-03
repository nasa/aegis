import styles from "./poi_editor.module.css";
import paneStyles from "../global_pane_styles.module.css";
import { FunctionComponent } from "react";

const PoiEditorRight: FunctionComponent = () => {
  return (
    <>
      <div className={paneStyles.rightPanelContainer}>
        <div className={styles.header}>Header</div>
        <div className={styles.body}>
          <div className={paneStyles.panelContainer}>Body</div>
        </div>
      </div>
    </>
  );
};

export default PoiEditorRight;
