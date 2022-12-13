import { Dispatch, FunctionComponent, SetStateAction } from "react";
import styles from "./admin.module.css";

interface TimeProps {
  config_time: MMGIS_Time3;
  setConfig: Dispatch<SetStateAction<Config>>;
}

const Time: FunctionComponent<TimeProps> = (props: TimeProps) => {
  return (
    <>
      <h4>Time</h4>
      <h5>User Interface</h5>
      <div id="enabledDiv">
        <div className={styles.editDiv}>
          <label htmlFor="enabled">Enabled</label>
        </div>
        <div className={styles.editDiv}>
          <input
            id="enabled"
            type="checkbox"
            onChange={(e) => {
              props.setConfig((previousConfig) => {
                return {
                  ...previousConfig,
                  time: { ...previousConfig.time, enabled: e.target.checked },
                };
              });
            }}
            checked={props.config_time?.enabled}
          />
        </div>
      </div>
      <div id="visibleDiv">
        <div className={styles.editDiv}>
          <label htmlFor="visible">Visible</label>
        </div>
        <div className={styles.editDiv}>
          <input
            id="visible"
            type="checkbox"
            onChange={(e) => {
              props.setConfig((previousConfig) => {
                return {
                  ...previousConfig,
                  time: { ...previousConfig.time, visible: e.target.checked },
                };
              });
            }}
            checked={props.config_time?.visible}
          />
        </div>
      </div>
      <div id="formatDiv">
        <div className={styles.editDiv}>
          <label htmlFor="format">Time Format</label>
        </div>
        <div className={styles.editDiv}>
          <input
            id="format"
            type="text"
            onChange={(e) => {
              props.setConfig((previousConfig) => {
                return {
                  ...previousConfig,
                  time: { ...previousConfig.time, format: e.target.value },
                };
              });
            }}
            value={props.config_time?.format}
          />
        </div>
      </div>
    </>
  );
};

export default Time;
