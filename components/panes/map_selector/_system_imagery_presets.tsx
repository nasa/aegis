import styles from "./map_selector.module.css";
import paneStyles from "../left_pane_styles.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretDown, faCaretRight } from "@fortawesome/free-solid-svg-icons";
import { library } from "@fortawesome/fontawesome-svg-core";
import { FunctionComponent } from "react";

library.add(faCaretDown, faCaretRight);

const SystemMapImageryPresets: FunctionComponent<{
  expandedSections: ExpandedSection;
  setExpandedSections: SetExpandedSectionsFn;
}> = ({ expandedSections, setExpandedSections }) => {
  const placeholderPresets = {
    terrain_difficulty: {
      name: "Terrain Difficulty",
    },
    visible_light: {
      name: "Visible Light",
    },
  };

  return (
    <div className={paneStyles.panelContainer}>
      <div className={styles.layersContainer}>
        <div
          className={styles.layersHeader}
          onClick={() =>
            setExpandedSections({
              ...expandedSections,
              systemPresets: !expandedSections.systemPresets,
            })
          }
        >
          <div className={styles.expandoCaret}>
            {expandedSections.systemPresets ? (
              <FontAwesomeIcon icon="caret-down" size="sm" />
            ) : (
              <FontAwesomeIcon icon="caret-right" size="sm" />
            )}
          </div>
          <div>System Map Imagery Presets</div>
        </div>
        <div className={styles.layersBody}>
          {expandedSections.systemPresets &&
            Object.keys(placeholderPresets).map((presetKey) => (
              <div className={styles.layerGroup} key={presetKey}>
                <div className={styles.layer}>
                  <div className={styles.layerName}>{placeholderPresets[presetKey].name}</div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default SystemMapImageryPresets;
