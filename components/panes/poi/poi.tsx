import poiStyles from "./poi.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { faClone, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { FunctionComponent } from "react";
import { IconButton } from "components/interface/_global-elements";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import {
  duplicatePoi,
  setPoiEditMode,
  setSelectedPoiUuid,
  setSelectedPOIRightNavItem,
  upsertPoi,
} from "store/poi";
import { v4 as uuidv4 } from "uuid";
import PoiItem from "./poi-item";
import _ from "lodash";
import { generateUniqueName } from "utils/unique-name";
import { duplicateAction } from "store/action";
import { makeUniqueStringCopy } from "utils/duplicate";
import { setRightPanelOpen } from "store/interface";

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
  const isAdmin = useAppSelector(
    (state) => state.user.ironSessionData?.user.permission.includes("admin"),
    refEqual
  );
  const handleCreatePoi = () => {
    const randomName = generateUniqueName({
      dictName: "animals",
      existingNames: pois.map((item) => item.name),
    });

    const blankPoi: POI = {
      ownerId: userId,
      missionId: mission.id,
      uuid: uuidv4(),
      name: randomName,
      description: "",
      priorityOverride: 0,
      radius: 5,
      location: null,
      icon: "1F534",
      tags: [],
      status: "Candidate",
    };
    dispatch(upsertPoi(blankPoi));
    // turn on edit mode for the new POI
    dispatch(setPoiEditMode({ poiUuid: blankPoi.uuid, editMode: true }));
    // select the newly created POI
    dispatch(setSelectedPoiUuid(blankPoi.uuid));
    // open right panel
    dispatch(setRightPanelOpen(true));
    // set the selected tab to the POI's info tab
    dispatch(setSelectedPOIRightNavItem("info_panel"));
  };

  const handleDuplicatePoi = (poi: POI) => {
    if (selectedPoiUuid !== null) {
      //duplicate poi
      const newPoi: POI = {
        ...poi,
        uuid: uuidv4(),
        name: makeUniqueStringCopy(
          poi.name,
          pois.map((item) => item.name)
        ),
      };
      dispatch(duplicatePoi(newPoi));
      //duplicate actions
      const newStationActions = actions.filter((action) => action.poiUuid === poi?.uuid);
      for (const action of newStationActions) {
        dispatch(
          duplicateAction({
            action: action,
            poiUuid: newPoi.uuid,
          })
        );
      }

      // open right panel
      dispatch(setRightPanelOpen(true));
      // set the selected tab to the POI's info tab
      dispatch(setSelectedPOIRightNavItem("info_panel"));
    }
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
      {isAdmin && (
        <div className={paneStyles.iconButtons}>
          <IconButton
            onClick={() => {
              handleCreatePoi();
            }}
            label="Add"
            icon={faPlusCircle}
          />
          <IconButton
            onClick={() => {
              handleDuplicatePoi(selectedPoi);
            }}
            label="Duplicate"
            icon={faClone}
            enabled={selectedPoiUuid !== null}
          />
        </div>
      )}
    </>
  );
};

export default PoiEditorLeft;
