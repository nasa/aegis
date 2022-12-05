import styles from "./map.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretDown, faCaretRight, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { FunctionComponent, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../../store";

const UserMapImageryPresets: FunctionComponent<{
  expandedSections: MapExpandedSections;
  setExpandedSections: SetMapExpandedSectionsFn;
}> = ({ expandedSections, setExpandedSections }) => {
  // const placeholderPresets = {
  //   user1: {
  //     name: "My Preset 1",
  //   },
  //   user2: {
  //     name: "My Preset 2",
  //   },
  // };
  const [presetName, setPresetName] = useState("");
  const activeLayerUUID = useSelector((state: RootState) => state.map.activeLayerUUID);
  console.log(activeLayerUUID);
  console.log(presetName);
  const addPreset = async () => {
    fetch("/api/preset/add", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: presetName,
        uuid: activeLayerUUID,
      }),
    });
  };

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
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                  />
                  <span className={styles.presetAdd} onClick={addPreset}>
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
