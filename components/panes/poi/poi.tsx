import styles from "./poi.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCaretDown,
  faCaretRight,
  faClone,
  faPlusCircle,
} from "@fortawesome/free-solid-svg-icons";
import { FunctionComponent, useState } from "react";
import { IconButton, ModifiedIndicator } from "components/interface/_global-elements";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "store";
import {
  createBlankPoi,
  duplicatePoi,
  setSelectedPoiUuid,
  setSelectedRightNavItem,
} from "store/poi";

const PoiEditorLeft: FunctionComponent = () => {
  const [expandedSections, setExpandedSections] = useState<POIExpandedSections>({
    pois: true,
  });

  return (
    <>
      <PoiList expandedSections={expandedSections} setExpandedSections={setExpandedSections} />
    </>
  );
};

export default PoiEditorLeft;

const PoiList: FunctionComponent<{
  expandedSections: POIExpandedSections;
  setExpandedSections: SetPOIExpandedSectionsFn;
}> = ({ expandedSections, setExpandedSections }) => {
  const dispatch = useDispatch();
  const pois = useSelector((state: RootState) => state.poi.pois);
  const poisFromDb = useSelector((state: RootState) => state.poi.poisFromDb);
  const selectedRightNavItem = useSelector((state: RootState) => state.poi.selectedRightNavItem);
  const selectedPoiUuid = useSelector((state: RootState) => state.poi.selectedPoiUuid);
  const selectedPoi = pois.filter((poi) => poi.uuid === selectedPoiUuid)[0];

  const user: AEGISUser = useSelector((state: RootState) => state.user.ironSessionData?.user);
  const mission = useSelector((state: RootState) => state.mission.mission);
  return (
    <>
      <div className={paneStyles.leftPanelContainer}>
        <div className={styles.container}>
          <div
            className={styles.header}
            onClick={() =>
              setExpandedSections({
                ...expandedSections,
                pois: !expandedSections.pois,
              })
            }
          >
            <div className={styles.expandoCaret}>
              {expandedSections.pois ? (
                <FontAwesomeIcon icon={faCaretDown} size="sm" />
              ) : (
                <FontAwesomeIcon icon={faCaretRight} size="sm" />
              )}
            </div>
            <div>Mission POIs</div>
          </div>
          <div className={styles.body}>
            {expandedSections.pois &&
              pois.map((poi) => {
                const poiSelected = poi.uuid === selectedPoiUuid ? styles.nameSelected : null;
                const poiFromDb = poisFromDb.filter((poiFromDb) => poiFromDb.uuid === poi.uuid)[0];
                return (
                  <div
                    className={styles.poiItem}
                    key={poi.uuid}
                    onClick={() => {
                      if (selectedPoiUuid === poi.uuid) {
                        dispatch(setSelectedPoiUuid(null));
                      } else {
                        dispatch(setSelectedPoiUuid(poi.uuid));
                        if (!selectedRightNavItem)
                          dispatch(setSelectedRightNavItem("information_panel"));
                      }
                    }}
                  >
                    <div className={styles.itemColor}>
                      <div
                        className={styles.poiDot}
                        style={{ backgroundColor: poi.color?.value }}
                      />
                    </div>
                    <div className={`${styles.name} ${poiSelected}`}>
                      <div>{poi.name}</div>
                      <ModifiedIndicator
                        obj1={poi}
                        obj2={poiFromDb}
                        svgStyle={{
                          width: "15",
                          height: "12",
                          cx: "5",
                          cy: "9",
                          r: "3",
                          fill: "#ff0000",
                        }}
                      />
                      <div className={styles.poiRightSpacer}></div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
      <div className={paneStyles.iconButtons}>
        <IconButton
          onClick={() => {
            dispatch(createBlankPoi({ userId: user.id, missionId: mission.id }));
          }}
          label="Add"
          icon={faPlusCircle}
        ></IconButton>
        <IconButton
          onClick={() => {
            if (selectedPoiUuid !== null) {
              dispatch(duplicatePoi(selectedPoi));
            }
          }}
          label="Duplicate"
          icon={faClone}
          enabled={selectedPoiUuid !== null}
        ></IconButton>
      </div>
    </>
  );
};
