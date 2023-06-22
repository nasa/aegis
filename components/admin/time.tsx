import { FunctionComponent } from "react";
import styles from "./admin.module.css";
import { FFCheckbox, FFInput } from "components/interface/form/globalFields";

const Time: FunctionComponent = () => {
  return (
    <>
      <h4>Time</h4>{" "}
      <div className={styles.sectionDiv}>
        <h5>User Interface</h5>
        <div id="enabledDiv">
          <div className={styles.editDiv}>
            <FFCheckbox name="config.time.enabled" label={{ label: "Enabled" }} />
          </div>
        </div>
        <div id="visibleDiv">
          <div className={styles.editDiv}>
            <FFCheckbox name="config.time.visible" label={{ label: "Visible" }} />
          </div>
        </div>
        <div id="formatDiv">
          <div className={styles.editDiv}>
            <FFInput name="config.time.format" label={{ label: "Time Format" }} />
          </div>
        </div>
      </div>
    </>
  );
};

export default Time;
