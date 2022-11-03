import styles from "./map_selector.module.css";
import paneStyles from "../global_pane_styles.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretDown, faCaretRight, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { FunctionComponent } from "react";

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
              <FontAwesomeIcon icon={faCaretDown} size="sm" />
            ) : (
              <FontAwesomeIcon icon={faCaretRight} size="sm" />
            )}
          </div>
          <div>My Presets</div>
        </div>
        <div className={styles.layersBody}>
          {expandedSections.userPresets ? (
            <div className={styles.layersList}>
              <div className={styles.layerItem}>
                <div className={styles.layerItemName}>My Preset Placeholder</div>
              </div>
              <div className={styles.layerItem}>
                <div className={styles.presetDetail}>
                  <span className={styles.presetText}>
                    Adjust imagery details visibility and settings and save current map view as a
                    preset.
                  </span>
                </div>
              </div>
              <div className={styles.layerItem}>
                <div className={styles.presetInsert}>
                  <input
                    className={styles.presetName}
                    type={"text"}
                    placeholder={"Type Preset Name"}
                  />
                  <span className={styles.presetAdd}>
                    <FontAwesomeIcon icon={faPlusCircle} /> Add Preset{" "}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default UserMapImageryPresets;
