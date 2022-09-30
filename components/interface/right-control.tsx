import styles from "./right-control.module.css";
import { useSelector } from "react-redux";
import { RootState } from "store";
import { FunctionComponent } from "react";

/* This control sits at the right side of the screen and displays the active pane for that position */

const Info = () => {
  const mmgisConfig = useSelector((state: RootState) => state.mmgisConfig);
  const config = mmgisConfig?.MMGISConfig?.config;

  //Placeholder component for info
  return (
    <div className={styles.info}>
      <div>{config?.msv?.mission} Info:</div>
      <div className={styles.infoItem}>
        <div>Default position:</div>
        <div>Lat: {config?.msv?.view[0]}</div>
        <div>Lon: {config?.msv?.view[1]}</div>
        <div>Mag: {config?.msv?.view[2]}</div>
      </div>
    </div>
  );
};

const RightControlPanel: FunctionComponent = () => {
  return (
    <div className={styles.body}>
      <Info />
    </div>
  );
};

export default RightControlPanel;
