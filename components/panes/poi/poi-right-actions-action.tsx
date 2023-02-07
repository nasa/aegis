import { faCaretDown, faCaretRight, faTrashAlt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  ContentEditableTextArea,
  Dropdown,
  InLineEditInput,
  MultiButton,
} from "components/interface/_global-elements";
import { FunctionComponent, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import poiStyles from "./poi.module.css";
import { setPoiEditMode } from "store/poi";
import { deleteAction, upsertAction } from "store/action";
import { toDecimal } from "utils/formatting";
import { useDispatch } from "react-redux";
import STMSelector from "../stm-selector";

const RightAction: FunctionComponent<{ editMode: boolean; poiUuid: string; action: Action }> = ({
  editMode,
  poiUuid,
  action,
}) => {
  const dispatch = useDispatch();
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
          <div className={`${paneStyles.actionsHeadingTitle} ${poiStyles.poiColor} `}>
            {action.type}
          </div>
        ) : (
          <Dropdown
            selected={action.type}
            onChange={(val) => {
              dispatch(upsertAction({ ...action, type: val as ActionType }));
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
            styleInput={{ width: "100%" }}
            containerStyle={{ fontSize: "0.9em", fontWeight: 400 }}
            value={action.name}
            onChange={(val) => {
              const updatedAction: Action = { ...action, name: val };
              dispatch(upsertAction(updatedAction));
            }}
          />
        </div>
        <div className={paneStyles.actionHeadingIcons}>
          {editMode && (
            <FontAwesomeIcon
              icon={faTrashAlt}
              size="sm"
              onClick={(e) => {
                dispatch(deleteAction(action));
                dispatch(setPoiEditMode({ poiUuid, editMode: true }));
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
                dispatch(upsertAction(updatedAction));
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
                    styleInput={{ width: "45px" }}
                    containerStyle={{ fontSize: "0.8em", fontWeight: 400 }}
                    value={action.durationLower.toString()}
                    onChange={(val) => {
                      const updatedAction: Action = { ...action, durationLower: val };
                      dispatch(upsertAction(updatedAction));
                    }}
                    onBlur={(e) => {
                      const numericVal = toDecimal(e.target.value);
                      const updatedAction: Action = { ...action, durationLower: numericVal };
                      dispatch(upsertAction(updatedAction));
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
                    styleInput={{ width: "45px" }}
                    containerStyle={{ fontSize: "0.8em", fontWeight: 400 }}
                    value={action.durationUpper?.toString()}
                    onChange={(val) => {
                      const updatedAction: Action = { ...action, durationUpper: val };
                      dispatch(upsertAction(updatedAction));
                    }}
                    onBlur={(e) => {
                      const numericVal = toDecimal(e.target.value);
                      const updatedAction: Action = { ...action, durationUpper: numericVal };
                      dispatch(upsertAction(updatedAction));
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Science Tracability</div>
            <STMSelector
              editMode={editMode}
              action={action}
              onSTMChange={(stmUuidRefs: string[]) => {
                const updatedAction: Action = { ...action, stmUuidRefs: stmUuidRefs };
                dispatch(upsertAction(updatedAction));
              }}
            />
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>POI Value & Notes</div>
            <ContentEditableTextArea
              html={action.description} // innerHTML of the editable div
              editing={editMode}
              onChange={(evt) => {
                const updatedAction: Action = { ...action, description: evt.target.value };
                dispatch(upsertAction(updatedAction));
              }} // handle innerHTML change
            />
          </div>
        </>
      )}
    </div>
  );
};

export default RightAction;
