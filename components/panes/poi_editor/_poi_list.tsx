import styles from "./poi_editor.module.css";
import paneStyles from "../left_pane_styles.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCaretDown,
  faCaretRight,
  faClone,
  faPlusCircle,
} from "@fortawesome/free-solid-svg-icons";
import { FunctionComponent } from "react";
import IconButton from "components/interface/_global_elements";

const PoiList: FunctionComponent<{
  expandedSections: ExpandedSection;
  setExpandedSections: SetExpandedSectionsFn;
}> = ({ expandedSections, setExpandedSections }) => {
  const placeholderPOIs: POI[] = [
    {
      uuid: "1",
      name: "POI Name 1",
      color: "#ff0000",
      description: "POI Description 1",
      actions: [],
      tags: [],
      location: {
        long: 0,
        lat: 0,
      },
      priorityOverride: 0,
      radius: 0,
      owner: "",
      status: "Candidate",
    },
    {
      uuid: "2",
      name: "POI Name 2",
      color: "#00ff00",
      description: "POI Description 2",
      actions: [],
      tags: [],
      location: {
        long: 0,
        lat: 0,
      },
      priorityOverride: 0,
      radius: 0,
      owner: "",
      status: "Candidate",
    },
  ];

  return (
    <div className={paneStyles.panelContainer}>
      <div className={styles.container}>
        <div
          className={styles.header}
          onClick={() =>
            setExpandedSections({
              ...expandedSections,
              systemPresets: !expandedSections.systemPresets,
            })
          }
        >
          <div className={styles.expandoCaret}>
            {expandedSections.systemPresets ? (
              <FontAwesomeIcon icon={faCaretDown} size="sm" />
            ) : (
              <FontAwesomeIcon icon={faCaretRight} size="sm" />
            )}
          </div>
          <div>Mission POIs</div>
        </div>
        <div className={styles.body}>
          {expandedSections.systemPresets &&
            placeholderPOIs.map((poi) => (
              <div className={styles.group} key={poi.uuid}>
                <div className={styles.item}>
                  <div className={styles.itemColor}>
                    <div className={styles.poiDot} style={{ backgroundColor: poi.color }} />
                  </div>
                  <div className={styles.name}>{poi.name}</div>
                </div>
              </div>
            ))}
          <div className={paneStyles.iconButtons}>
            <IconButton onClick={() => {}} label="Add" icon={faPlusCircle}></IconButton>
            <IconButton onClick={() => {}} label="Duplicate" icon={faClone}></IconButton>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PoiList;
