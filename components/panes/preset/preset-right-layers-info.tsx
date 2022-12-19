import { FunctionComponent } from "react";
import styles from "./preset-right-layers-info.module.css";

const Info_subpanel: FunctionComponent<{
  sublayer: MMGIS_Sublayer;
}> = ({ sublayer }) => {
  return (
    <div className={styles.container}>
      <div className={styles.title}>Layer Description</div>
      <div className={styles.description}>{sublayer.name} (description to be added)</div>
    </div>
  );
};

export default Info_subpanel;
