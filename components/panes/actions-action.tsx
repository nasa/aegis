import {
  faCaretDown,
  faCaretRight,
  faGripVertical,
  faTrashAlt,
} from "@fortawesome/free-solid-svg-icons";
import { faCircleDot } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  ContentEditableTextArea,
  Dropdown,
  InLineEditInput,
  MultiButton,
} from "components/interface/_global-elements";
import { FunctionComponent, useState } from "react";
import paneStyles from "./global-pane-styles.module.css";
import actionStyles from "./actions-action.module.css";
import { deleteAction, upsertAction } from "store/action";
import { toDecimal } from "utils/formatting";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import { Tooltip } from "react-tooltip";
import ReactDOMServer from "react-dom/server";
import STMSelector from "./stm-selector";

const RightAction: FunctionComponent<{
  editMode: boolean;
  setEditMode: (newEditMode: boolean) => void;
  action: Action;
  highlight: boolean;
  actionColor: React.CSSProperties;
}> = ({ editMode, setEditMode, action, highlight, actionColor }) => {
  const dispatch = useDispatch();
  const parentAction = useAppSelector(
    (state) =>
      state.action.actions.find((storeAction) => storeAction.uuid === action.parentActionUuid),
    shallowEqual
  );
  const parentPoi = useAppSelector(
    (state) => state.poi.pois.find((storePoi) => storePoi.uuid === parentAction?.poiUuid),
    shallowEqual
  );
  const [expanded, setExpanded] = useState(false);

  function buildActionTooltip() {
    if (parentAction && parentPoi) {
      const copyDate: Date = new Date(action.parentCopyDate);
      const dateString = `${
        copyDate.getUTCMonth() + 1
      }/${copyDate.getUTCDate()}/${copyDate.getUTCFullYear()} @ ${copyDate.getUTCHours()}:${copyDate.getUTCMinutes()} UTC`;
      return (
        <>
          Copied from {parentPoi.name} - {parentAction.name}
          <br />
          on {dateString}
        </>
      );
    } else {
      return <></>;
    }
  }

  return (
    <div className={`${paneStyles.panelContainer} ${actionStyles.actionPanelContainer}`}>
      <div
        className={`${paneStyles.actionsHeading} ${highlight && actionStyles.highlightAction}`}
        onClick={() => {
          setExpanded(!expanded);
        }}
      >
        {editMode && (
          <a>
            <FontAwesomeIcon icon={faGripVertical} className={actionStyles.reorderIcon} size="sm" />
          </a>
        )}

        <div
          className={`${paneStyles.actionsHeadingCaret} ${
            editMode && actionStyles.actionsHeadingCaret
          } `}
        >
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
          <div className={`${paneStyles.actionsHeadingTitle}`} style={actionColor}>
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
            containerStyle={{ fontSize: "0.8rem", fontWeight: 400 }}
            value={action.name}
            onChange={(val) => {
              const updatedAction: Action = { ...action, name: val };
              dispatch(upsertAction(updatedAction));
            }}
          />
        </div>
        {editMode ? (
          <div className={paneStyles.actionHeadingIcons}>
            <FontAwesomeIcon
              icon={faTrashAlt}
              size="sm"
              onClick={(e) => {
                dispatch(deleteAction(action));
                setEditMode(true);
                e.stopPropagation();
              }}
            />
          </div>
        ) : (
          action.parentActionUuid && (
            <div className={paneStyles.actionHeadingIcons}>
              <FontAwesomeIcon
                id={`${action.uuid}-${action.parentActionUuid}`}
                icon={faCircleDot}
                size="sm"
                className={actionStyles.iconFaded}
              />
              <Tooltip
                anchorId={`${action.uuid}-${action.parentActionUuid}`}
                className={actionStyles.actionToolTip}
                html={ReactDOMServer.renderToString(buildActionTooltip())}
              />
            </div>
          )
        )}
      </div>
      {expanded && (
        <>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Status</div>
            <MultiButton
              editing={editMode}
              selected={action.status}
              handleChange={(newStatus: ActionStatus) => {
                const updatedAction: Action = { ...action, status: newStatus };
                dispatch(upsertAction(updatedAction));
              }}
            >
              <button type="button">Archived</button>
              <button type="button">Candidate</button>
              <button type="button">In Review</button>
              <button type="button">Approved</button>
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
                    onChange={(val: number) => {
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
                    containerStyle={{ fontSize: "0.8rem", fontWeight: 400 }}
                    value={action.durationUpper?.toString()}
                    onChange={(val: number) => {
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
            <div className={paneStyles.panelSectionTitle}>Action Value & Notes</div>
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
