import poiStyles from "./poi.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { faClone, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { FunctionComponent } from "react";
import { IconButton } from "components/interface/_global-elements";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import { duplicatePoi, setPoiEditMode, setSelectedPoiUuid, upsertPoi } from "store/poi";
import { v4 as uuidv4 } from "uuid";
import PoiItem from "./poi-item";
import _ from "lodash";
import { generateUniqueName } from "utils/unique-name";

const PoiEditorLeft: FunctionComponent = () => {
  const dispatch = useDispatch();
  const pois = useAppSelector((state) => state.poi.pois, shallowEqual);
  const poisFromDb = useAppSelector((state) => state.poi.poisFromDb, shallowEqual);

  const selectedPoiUuid = useAppSelector((state) => state.poi.selectedPoiUuid, refEqual);
  const selectedPoi = pois.find((poi) => poi.uuid === selectedPoiUuid);

  const userId: number = useAppSelector((state) => state.user.ironSessionData?.user.id, refEqual);
  const mission = useAppSelector((state) => state.mission.mission, shallowEqual);
  const actions = useAppSelector((state) => state.action.actions, shallowEqual);
  const actionsFromDb = useAppSelector((state) => state.action.actionsFromDb, shallowEqual);

  const handleCreatePoi = () => {
    const randomName = generateUniqueName({
      dictName: "animals",
      existingNames: pois.map((item) => item.name),
    });

    const blankPoi: POI = {
      ownerId: userId,
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
        <div className={poiStyles.container}>
          <div className={poiStyles.body}>
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
