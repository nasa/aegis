import styles from "./map_selector.module.css";
import paneStyles from "../left_pane_styles.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretDown, faCaretRight } from "@fortawesome/free-solid-svg-icons";
import { library } from "@fortawesome/fontawesome-svg-core";
import { FunctionComponent } from "react";

library.add(faCaretDown, faCaretRight);

const UserMapImageryPresets: FunctionComponent<{
  expandedSections: ExpandedSection;
  setExpandedSections: SetExpandedSectionsFn;
}> = ({ expandedSections, setExpandedSections }) => {
  // const placeholderPresets = {
  //   user1: {
  //     name: "My Preset 1",
  //   },
  //   user2: {
  //     name: "My Preset 2",
  //   },
  // };

  return (
    <div className={paneStyles.panelContainer}>
      <div className={styles.layersContainer}>
        <div
          className={styles.layersHeader}
          onClick={() =>
            setExpandedSections({ ...expandedSections, userPresets: !expandedSections.userPresets })
          }
        >
          <div className={styles.expandoCaret}>
            {expandedSections.userPresets ? (
              <FontAwesomeIcon icon="caret-down" size="sm" />
            ) : (
              <FontAwesomeIcon icon="caret-right" size="sm" />
            )}
          </div>
          <div>Your Map Imagery Presets</div>
        </div>
        <div className={styles.layersBody}></div>
      </div>
    </div>
  );
};

export default UserMapImageryPresets;
