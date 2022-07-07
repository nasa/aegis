import styles from "./left-control.module.css";
import { useEffect, useRef, useState } from "react";

import { library } from "@fortawesome/fontawesome-svg-core";
import { faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { RootState } from "store";
library.add(faLayerGroup);

const LeftControlPanel = () => {
  return (
    <div className={styles.body}>
      <div className={styles.iconGutter}>
        <div className={styles.icon}>
          <FontAwesomeIcon icon="layer-group" />
        </div>
      </div>
      <div className={styles.activeComponent}>
        <LayerSelector />
      </div>
    </div>
  );
};

export default LeftControlPanel;

const LayerSelector = () => {
  return <div className={styles.body}>Layer Selector</div>;
};
