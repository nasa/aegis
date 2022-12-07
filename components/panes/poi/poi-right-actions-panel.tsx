import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { IconButton } from "components/interface/_global-elements";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { RootState } from "store";
import { createBlankAction, setEditMode } from "store/poi";
import POIAction from "./poi-right-action";

const Actions_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();
  const selectedPoiUuid = useSelector(
    (state: RootState) => state.poi.selectedPoiUuid,
    shallowEqual
  );
  const pois: POI[] = useSelector((state: RootState) => state.poi.pois, shallowEqual);
  const selectedPoi = pois.find((poi) => poi.uuid === selectedPoiUuid);

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
                dispatch(createBlankAction(selectedPoi));
                dispatch(setEditMode({ poi: selectedPoi, editMode: true }));
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Actions_Panel;
