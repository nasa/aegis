import { FunctionComponent } from "react";
import styles from "./preset-right-layers-info.module.css";

const Info_subpanel: FunctionComponent<{
  sublayer: Sublayer;
}> = ({ sublayer }) => {
  return (
    <div className={styles.container}>
      <div className={styles.title}>Layer Description</div>
      <div className={styles.description}>
        {sublayer.name} {sublayer.description}
      </div>
    </div>
  );
};

export default Info_subpanel;
