import { FunctionComponent, useEffect } from "react";
import { useSelector } from "react-redux";
import { RootState } from "store";
import styles from "./info_panel.module.css";
import { library } from "@fortawesome/fontawesome-svg-core";
import { faChevronDown, faPlus, faGear } from "@fortawesome/free-solid-svg-icons";
library.add(faChevronDown, faPlus, faGear);

const Info_Panel: FunctionComponent = () => {
  const evaState = useSelector((state: RootState) => state.eva);

  useEffect(() => {
    // console.log(evaState);
  }, [evaState]);

  return (
    <div className={styles.panelContainer}>
      <div className={styles.panelHeader}>
        <h3 className={styles.panelHeaderText}>Information</h3>
      </div>
      <div className={styles.panelBody}>
        <p className={styles.panelBodyText}>
          Terrain Difficulty is a combination of Slope and TRI at 1m/1pixel...lorem ipsum dolor sit
          amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore
          magna aliqua.
          <br />
          <br />
          Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea
          commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum
          dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in
          culpa qui officia deserunt mollit anim id est laborum.
        </p>
      </div>
    </div>
  );
};

export default Info_Panel;
