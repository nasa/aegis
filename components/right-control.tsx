import styles from "./right-control.module.css";
import { useSelector } from "react-redux";
import { RootState } from "store";

const Info = () => {
  const mmgisConfig = useSelector((state: RootState) => state.mmgisConfig);
  const config = mmgisConfig?.MMGISConfig?.config;
  return (
    <div className={styles.info}>
      <div>{config?.msv?.mission} Info:</div>
      <br />
      <div>Default position:</div>
      <div>Lat: {config?.msv?.view[0]}</div>
      <div>Lon: {config?.msv?.view[1]}</div>
      <div>Mag: {config?.msv?.view[2]}</div>
    </div>
  );
};

const RightControlPanel = () => {
  return (
    <div className={styles.body}>
      <Info />
    </div>
  );
};

export default RightControlPanel;
