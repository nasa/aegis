import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { library } from "@fortawesome/fontawesome-svg-core";
import { faChevronDown, faPlus, faGear } from "@fortawesome/free-solid-svg-icons";
library.add(faChevronDown, faPlus, faGear);

const Info_Panel: FunctionComponent = () => {
  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Information</div>
      <div className={paneStyles.panelContainer}>
        <div className={paneStyles.bodyText}>
          <p>
            Terrain Difficulty is a combination of Slope and TRI at 1m/1pixel...lorem ipsum dolor
            sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et
            dolore magna aliqua.
          </p>
          <p>
            Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea
            commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum
            dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in
            culpa qui officia deserunt mollit anim id est laborum.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Info_Panel;
