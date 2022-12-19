import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { IconButton } from "components/interface/_global-elements";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { RootState } from "store";
import { setPoiEditMode, upsertAction } from "store/poi";
import POIAction from "./poi-right-action";
import { starWars, uniqueNamesGenerator } from "unique-names-generator";
import { v4 as uuidv4 } from "uuid";

const Actions_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();
  const selectedPoiUuid = useSelector(
    (state: RootState) => state.poi.selectedPoiUuid,
    shallowEqual
  );
  const pois: POI[] = useSelector((state: RootState) => state.poi.pois, shallowEqual);
  const selectedPoi = pois.find((poi) => poi.uuid === selectedPoiUuid);

  const handleCreateAction = () => {
    const randomName: string = uniqueNamesGenerator({
      dictionaries: [starWars],
      style: "capital",
    });

    const blankAction: Action = {
      poi: selectedPoi.id,
      uuid: uuidv4(),
      name: "Action " + randomName,
      description: "",
      status: "Candidate",
      type: "other",
      durationLower: 5,
      durationUpper: null,
      stmUuidRefs: null,
      inventoryItems: null,
      priorityOverride: null,
    };

    dispatch(upsertAction({ poi: selectedPoi, poiAction: blankAction }));
    dispatch(setPoiEditMode({ poi: selectedPoi, editMode: true }));
  };

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Actions</div>
      <div className={paneStyles.rightBodyBody}>
        {selectedPoi.actions?.map((action) => (
          <POIAction key={action.uuid} editMode={editMode} poi={selectedPoi} action={action} />
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
