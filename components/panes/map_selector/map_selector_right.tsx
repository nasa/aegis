import { FunctionComponent, useEffect } from "react";
import { useSelector } from "react-redux";
import { RootState } from "store";
import paneStyles from "../global_pane_styles.module.css";

const MapSelectorRight: FunctionComponent = () => {
  const evaState = useSelector((state: RootState) => state.eva);

  useEffect(() => {
    // console.log(evaState);
  }, [evaState]);

  return (
    <div className={paneStyles.panelContainer}>
      <div className={paneStyles.panelHeader}>
        <h3 className={paneStyles.panelHeaderText}>Information</h3>
      </div>
      <div className={paneStyles.panelBody}>
        <p className={paneStyles.panelBodyText}>
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

export default MapSelectorRight;
