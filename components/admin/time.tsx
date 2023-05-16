import { FunctionComponent } from "react";
import styles from "./admin.module.css";
import { CheckboxInputField, TextInputField } from "components/form/FormInput";

const Time: FunctionComponent = () => {
  return (
    <>
      <h4>Time</h4>{" "}
      <div className={styles.sectionDiv}>
        <h5>User Interface</h5>
        <div id="enabledDiv">
          <div className={styles.editDiv}>
            <CheckboxInputField
              name="config.time.enabled"
              label={{ label: "Enabled" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="visibleDiv">
          <div className={styles.editDiv}>
            <CheckboxInputField
              name="config.time.visible"
              label={{ label: "Visible" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="formatDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.time.format"
              label={{ label: "Time Format" }}
              className={styles.editDiv}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default Time;
