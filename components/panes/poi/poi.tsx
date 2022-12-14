import styles from "./poi.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { faClone, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { FunctionComponent } from "react";
import { IconButton, ModifiedIndicator } from "components/interface/_global-elements";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "store";
import {
  duplicatePoi,
  setPoiEditMode,
  setSelectedPoiUuid,
  setSelectedRightNavItem,
  upsertPoi,
} from "store/poi";
import { animals, uniqueNamesGenerator } from "unique-names-generator";
import { v4 as uuidv4 } from "uuid";

const PoiEditorLeft: FunctionComponent = () => {
  const dispatch = useDispatch();
  const pois = useSelector((state: RootState) => state.poi.pois);
  const poisFromDb = useSelector((state: RootState) => state.poi.poisFromDb);
  const selectedRightNavItem = useSelector((state: RootState) => state.poi.selectedRightNavItem);
  const selectedPoiUuid = useSelector((state: RootState) => state.poi.selectedPoiUuid);
  const selectedPoi = pois.filter((poi) => poi.uuid === selectedPoiUuid)[0];

  const user: AEGISUser = useSelector((state: RootState) => state.user.ironSessionData?.user);
  const mission = useSelector((state: RootState) => state.mission.mission);

  const handleCreatePoi = () => {
    const randomName: string = uniqueNamesGenerator({
      dictionaries: [animals],
      style: "capital",
    });

    const blankPoi: POI = {
      owner: user.id,
      mission: mission.id,
      uuid: uuidv4(),
      name: "P-" + randomName,
      description: "",
      actions: [],
      priorityOverride: 0,
      radius: 5,
      location: null,
      color: null,
      tags: [],
      status: "Candidate",
    };
    dispatch(upsertPoi(blankPoi));
    // turn on edit mode for the new POI
    dispatch(setPoiEditMode({ poi: blankPoi, editMode: true }));
    // select the newly created POI
    dispatch(setSelectedPoiUuid(blankPoi.uuid));
  };

  return (
    <>
      <div className={paneStyles.leftPanelContainer}>
        <div className={styles.container}>
          <div className={styles.body}>
            {pois.map((poi) => {
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
                    <div className={styles.poiDot} style={{ backgroundColor: poi.color?.value }} />
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
            handleCreatePoi();
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

export default PoiEditorLeft;
