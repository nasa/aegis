import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";

const Reports_Panel: FunctionComponent = () => {
  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Reports</div>
    </div>
  );
};

export default Reports_Panel;
