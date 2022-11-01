import styles from "./map_selector.module.css";
import paneStyles from "../left_pane_styles.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretDown, faCaretRight } from "@fortawesome/free-solid-svg-icons";
import { library } from "@fortawesome/fontawesome-svg-core";
import { FunctionComponent, useState } from "react";

library.add(faCaretDown, faCaretRight);

const Child = ({ id, isSelected, text }) => {
  const presetHighlight = isSelected ? styles.presetHighlight : "";
  return (
    <div id={id} className={presetHighlight}>
      {text}
    </div>
  );
};

const SystemMapImageryPresets: FunctionComponent<{
  expandedSections: ExpandedSection;
  setExpandedSections: SetExpandedSectionsFn;
}> = ({ expandedSections, setExpandedSections }) => {
  const placeholderPresets = [
    {
      name: "terrain_difficulty",
      text: "Terrain Difficulty",
      selected: false,
    },
    {
      name: "visible_light",
      text: "Visible Light",
      selected: false,
    },
  ];

  const [presets, setPlaceholderPresets] = useState(placeholderPresets);

  const handleMissionPresetClick = async (i) => {
    setPlaceholderPresets((prevState: any) => {
      const newState = [...prevState];
      newState.map((preset) => {
        preset.selected = false;
      });
      newState[i].selected = !newState[i].selected;
      return newState;
    });
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
          <div>Mission Presets</div>
        </div>
        <div className={styles.layersBody}>
          {expandedSections.systemPresets &&
            presets.map((preset, index) => (
              <div className={styles.layerGroup} key={preset.name}>
                <div className={styles.layer} onClick={() => handleMissionPresetClick(index)}>
                  <Child id={preset.name} text={preset.text} isSelected={preset.selected} />
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default SystemMapImageryPresets;
