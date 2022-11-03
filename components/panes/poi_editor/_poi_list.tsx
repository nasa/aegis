import styles from "./poi_editor.module.css";
import paneStyles from "../global_pane_styles.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCaretDown,
  faCaretRight,
  faClone,
  faPlusCircle,
} from "@fortawesome/free-solid-svg-icons";
import { FunctionComponent } from "react";
import { IconButton } from "components/interface/_global_elements";
import { useSelector } from "react-redux";
import { RootState } from "store";

const PoiList: FunctionComponent<{
  expandedSections: ExpandedSection;
  setExpandedSections: SetExpandedSectionsFn;
}> = ({ expandedSections, setExpandedSections }) => {
  // get the list of POIs from the store
  const pois = useSelector((state: RootState) => state.poi.pois);

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
            pois.map((poi) => (
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
