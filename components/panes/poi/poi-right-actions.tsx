import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { IconButton } from "components/interface/_global-elements";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import { setPoiEditMode } from "store/poi";
import { upsertAction } from "store/action";
import POIAction from "./poi-right-actions-action";
import { starWars, uniqueNamesGenerator } from "unique-names-generator";
import { v4 as uuidv4 } from "uuid";

const Actions_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();
  const selectedPoiUuid = useAppSelector((state) => state.poi.selectedPoiUuid, refEqual);
  const selectedMissionId = useAppSelector((state) => state.mission.mission?.id, refEqual);
  const poiActions = useAppSelector(
    (state) => state.action.actions.filter((action) => action.poiUuid === selectedPoiUuid),
    shallowEqual
  );

  const handleCreateAction = () => {
    const randomName: string = uniqueNamesGenerator({
      dictionaries: [starWars],
      style: "capital",
    });

    const blankAction: Action = {
      missionId: selectedMissionId,
      poiUuid: selectedPoiUuid,
      uuid: uuidv4(),
      name: "A-" + randomName,
      description: "",
      status: "Candidate",
      type: "other",
      durationLower: 5,
      durationUpper: null,
      stmUuidRefs: null,
      inventoryItems: null,
      priorityOverride: null,
    };

    dispatch(upsertAction(blankAction));
    dispatch(setPoiEditMode({ poiUuid: selectedPoiUuid, editMode: true }));
  };

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Actions</div>
      <div className={paneStyles.rightBodyBody}>
        {poiActions?.map((action) => (
          <POIAction
            key={action.uuid}
            editMode={editMode}
            poiUuid={selectedPoiUuid}
            action={action}
          />
        ))}
      </div>
      <div className={paneStyles.rightBodyFooter}>
        <div className={paneStyles.panelSection}>
          {editMode && (
            <IconButton
              icon={faPlusCircle}
              label="Add Action"
              style={{ width: "100px" }}
              onClick={() => {
                handleCreateAction();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Actions_Panel;
