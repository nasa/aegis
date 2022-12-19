import {
  faCaretDown,
  faCaretRight,
  faTableList,
  faTrashAlt,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  ContentEditableTextArea,
  Dropdown,
  IconButton,
  InLineEditInput,
  MultiButton,
} from "components/interface/_global-elements";
import { FunctionComponent, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { deleteAction, setPoiEditMode, upsertAction } from "store/poi";
import { toDecimal } from "utils/formatting";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { RootState } from "store";

const RightAction: FunctionComponent<{ editMode: boolean; poi: POI; action: Action }> = ({
  editMode,
  poi,
  action,
}) => {
  const dispatch = useDispatch();
  const selectedPoiUuid = useSelector(
    (state: RootState) => state.poi.selectedPoiUuid,
    shallowEqual
  );
  const pois: POI[] = useSelector((state: RootState) => state.poi.pois, shallowEqual);
  const selectedPoi = pois.find((poi) => poi.uuid === selectedPoiUuid);

  const [expanded, setExpanded] = useState(false);

  return (
    <div className={paneStyles.panelContainer}>
      <div
        className={paneStyles.actionsHeading}
        onClick={() => {
          setExpanded(!expanded);
        }}
      >
        <div className={paneStyles.actionsHeadingCaret}>
          {expanded ? (
            <FontAwesomeIcon icon={faCaretDown} size="sm" />
          ) : (
            <FontAwesomeIcon
              icon={faCaretRight}
              size="sm"
              className={paneStyles.actionsHeadingCaretRight}
            />
          )}
        </div>
        {!editMode ? (
          <div className={paneStyles.actionsHeadingTitle}>{action.type}</div>
        ) : (
          <Dropdown
            selected={action.type}
            onChange={(val) => {
              dispatch(upsertAction({ poi, poiAction: { ...action, type: val as ActionType } }));
            }}
          >
            <option value="measurement">Measurement</option>
            <option value="observation">Observation</option>
            <option value="sample">Sample</option>
            <option value="photo">Photo</option>
            <option value="other">Other</option>
          </Dropdown>
        )}
        <div className={paneStyles.actionsHeadingSubTitle}>
          <InLineEditInput
            fieldName="Action Title"
            editing={editMode}
            maxLength={255}
            style={{ width: "100%" }}
            containerStyle={{ fontSize: "0.9em", fontWeight: 400 }}
            value={action.name}
            onChange={(val) => {
              const updatedAction: Action = { ...action, name: val };
              dispatch(upsertAction({ poi, poiAction: updatedAction }));
            }}
          />
        </div>
        <div className={paneStyles.actionHeadingIcons}>
          {editMode && (
            <FontAwesomeIcon
              icon={faTrashAlt}
              size="sm"
              onClick={(e) => {
                dispatch(deleteAction({ poi, poiAction: action }));
                dispatch(setPoiEditMode({ poi: selectedPoi, editMode: true }));
                e.stopPropagation();
              }}
            />
          )}
        </div>
      </div>
      {expanded && (
        <>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Status</div>
            <MultiButton
              editing={editMode}
              selected={action.status}
              handleChange={(newStatus) => {
                const updatedAction: Action = { ...action, status: newStatus };
                dispatch(upsertAction({ poi, poiAction: updatedAction }));
              }}
            >
              <button>Archived</button>
              <button>Candidate</button>
              <button>In Review</button>
              <button>Approved</button>
            </MultiButton>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Duration Min*</div>
                <div className={paneStyles.inputField}>
                  <InLineEditInput
                    fieldName="Minimum Time in minutes"
                    editing={editMode}
                    maxLength={4}
                    style={{ width: "45px" }}
                    containerStyle={{ fontSize: "0.8em", fontWeight: 400 }}
                    value={action.durationLower.toString()}
                    onChange={(val) => {
                      const updatedAction: Action = { ...action, durationLower: val };
                      dispatch(upsertAction({ poi, poiAction: updatedAction }));
                    }}
                    onBlur={(e) => {
                      const numericVal = toDecimal(e.target.value);
                      const updatedAction: Action = { ...action, durationLower: numericVal };
                      dispatch(upsertAction({ poi, poiAction: updatedAction }));
                    }}
                  />
                </div>
              </div>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Duration Max</div>
                <div className={paneStyles.inputField}>
                  <InLineEditInput
                    fieldName="Maximum Time in minutes"
                    editing={editMode}
                    maxLength={4}
                    style={{ width: "45px" }}
                    containerStyle={{ fontSize: "0.8em", fontWeight: 400 }}
                    value={action.durationUpper?.toString()}
                    onChange={(val) => {
                      const updatedAction: Action = { ...action, durationUpper: val };
                      dispatch(upsertAction({ poi, poiAction: updatedAction }));
                    }}
                    onBlur={(e) => {
                      const numericVal = toDecimal(e.target.value);
                      const updatedAction: Action = { ...action, durationUpper: numericVal };
                      dispatch(upsertAction({ poi, poiAction: updatedAction }));
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Science Tracability</div>
            {editMode && (
              <IconButton
                onClick={() => {}}
                icon={faTableList}
                label="Select"
                style={{ width: "75px" }}
              />
            )}
            {!editMode && <div style={{ height: "26px" }}>...</div>}
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>POI Value & Notes</div>
            <ContentEditableTextArea
              html={action.description} // innerHTML of the editable div
              editing={editMode}
              onChange={(evt) => {
                const updatedAction: Action = { ...action, description: evt.target.value };
                dispatch(upsertAction({ poi, poiAction: updatedAction }));
              }} // handle innerHTML change
            />
          </div>
        </>
      )}
    </div>
  );
};

export default RightAction;
