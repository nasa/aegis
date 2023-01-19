import styles from "./poi.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { faClone, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { FunctionComponent } from "react";
import { IconButton } from "components/interface/_global-elements";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { RootState } from "store";
import { duplicatePoi, setPoiEditMode, setSelectedPoiUuid, upsertPoi } from "store/poi";
import { animals, uniqueNamesGenerator } from "unique-names-generator";
import { v4 as uuidv4 } from "uuid";
import PoiItem from "./poi-item";
import _ from "lodash";

const PoiEditorLeft: FunctionComponent = () => {
  const dispatch = useDispatch();
  const pois: POI[] = useSelector((state: RootState) => state.poi.pois, shallowEqual);
  const poisFromDb: POI[] = useSelector((state: RootState) => state.poi.poisFromDb, shallowEqual);

  const selectedPoiUuid = useSelector(
    (state: RootState) => state.poi.selectedPoiUuid,
    shallowEqual
  );
  const selectedPoi: POI = pois.find((poi: POI) => poi.uuid === selectedPoiUuid);

  const user: AEGISUser = useSelector(
    (state: RootState) => state.user.ironSessionData?.user,
    shallowEqual
  );
  const mission = useSelector((state: RootState) => state.mission.mission, shallowEqual);
  const actions: Action[] = useSelector((state: RootState) => state.action.actions, shallowEqual);
  const actionsFromDb: Action[] = useSelector(
    (state: RootState) => state.action.actionsFromDb,
    shallowEqual
  );

  const handleCreatePoi = () => {
    const randomName: string = uniqueNamesGenerator({
      dictionaries: [animals],
      style: "capital",
    });

    const blankPoi: POI = {
      ownerId: user.id,
      missionId: mission.id,
      uuid: uuidv4(),
      name: "P-" + randomName,
      description: "",
      priorityOverride: 0,
      radius: 5,
      location: null,
      color: null,
      tags: [],
      status: "Candidate",
    };
    dispatch(upsertPoi(blankPoi));
    // turn on edit mode for the new POI
    dispatch(setPoiEditMode({ poiUuid: blankPoi.uuid, editMode: true }));
    // select the newly created POI
    dispatch(setSelectedPoiUuid(blankPoi.uuid));
  };

  return (
    <>
      <div className={paneStyles.leftPanelContainer}>
        <div className={styles.container}>
          <div className={styles.body}>
            {_.sortBy(pois, "name").map((poi) => {
              const poiFromDb = poisFromDb.find((poiFromDb) => poiFromDb.uuid === poi.uuid);
              return (
                <PoiItem
                  key={poi.uuid}
                  selectedPoiUuid={selectedPoiUuid}
                  poi={poi}
                  poiFromDb={poiFromDb}
                  actions={actions}
                  actionsFromDb={actionsFromDb}
                />
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
