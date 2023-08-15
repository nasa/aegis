import {
  faCaretDown,
  faCaretRight,
  faGripVertical,
  faTrashAlt,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Dropdown, InLineEditInput } from "components/interface/form/globalFields";
import { FunctionComponent, CSSProperties } from "react";
import paneStyles from "./global-pane-styles.module.css";
import actionsStyles from "./actions.module.css";
import actionStyles from "./actions-action.module.css";
import { deleteActionByUuid, upsertAction } from "store/action";
import { useAppDispatch } from "utils/useAppDispatch";
import { hhmmFromMinutes } from "utils/formatting";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import { validators } from "components/interface/form/formValidators";
import _ from "lodash";
import { collapseActions, expandActions } from "store/interface";
import { RightActionBody } from "./actions-action-body";

const RightAction: FunctionComponent<{
  editMode: boolean;
  action: Action;
  highlight: boolean;
  actionColor: CSSProperties;
  parentType: "station" | "poi" | "eva";
  parentLocation: AEGISPoint | null;
}> = ({ editMode, action, highlight, actionColor, parentType, parentLocation }) => {
  const dispatch = useAppDispatch();

  const actionsExpanded = useAppSelector((state) => state.interface.actionsExpanded, shallowEqual);

  const toggleCrewAssigned = (crewMember: Crew) => {
    const currentCrew = action.crewAssigned || [];
    let newCrew: Crew[] = [];
    if (currentCrew.includes(crewMember)) {
      newCrew = currentCrew.filter((c) => c !== crewMember);
    } else {
      newCrew = [...currentCrew, crewMember];
    }
    dispatch(
      upsertAction({
        ...action,
        crewAssigned: newCrew,
      })
    );
  };

  const crewLeftStyle = action.crewAssigned?.includes("EV1")
    ? actionStyles.actionHeadingCrewSelected
    : undefined;

  const crewRightStyle = action.crewAssigned?.includes("EV2")
    ? actionStyles.actionHeadingCrewSelected
    : undefined;

  return (
    <div
      className={`${paneStyles.panelContainer} ${actionStyles.actionPanelContainer} ${actionsStyles.actionlistitemAction}`}
    >
      <div
        className={`${actionStyles.actionsHeading} ${highlight && actionStyles.highlightAction}`}
      >
        {editMode && (
          <a className={actionStyles.gripIcon}>
            <FontAwesomeIcon icon={faGripVertical} className={actionStyles.reorderIcon} size="sm" />
          </a>
        )}

        <div
          className={`${actionStyles.actionsHeadingCaret} ${
            editMode && actionStyles.actionsHeadingCaret
          } `}
          onClick={() => {
            if (actionsExpanded.includes(action.uuid)) {
              dispatch(collapseActions([action.uuid]));
            } else {
              dispatch(expandActions([action.uuid]));
            }
          }}
        >
          {actionsExpanded.includes(action.uuid) ? (
            <FontAwesomeIcon
              icon={faCaretDown}
              size="sm"
              className={actionStyles.actionsHeadingCaretDown}
              style={editMode && { marginTop: "5px" }}
            />
          ) : (
            <FontAwesomeIcon
              icon={faCaretRight}
              size="sm"
              className={actionStyles.actionsHeadingCaretRight}
              style={editMode && { marginTop: "5px" }}
            />
          )}
        </div>
        {!editMode ? (
          <div
            className={`${actionStyles.actionsHeadingType}`}
            style={actionColor}
            onClick={() => {
              if (actionsExpanded.includes(action.uuid)) {
                dispatch(collapseActions([action.uuid]));
              } else {
                dispatch(expandActions([action.uuid]));
              }
            }}
          >
            {action.type}
          </div>
        ) : (
          <Dropdown
            selected={action.type}
            onChange={(val) => {
              dispatch(upsertAction({ ...action, type: val as ActionType }));
            }}
            toolTip="Action Type"
          >
            <option value="measurement">Measurement</option>
            <option value="observation">Observation</option>
            <option value="sample">Sample</option>
            <option value="photo">Photo</option>
            <option value="other">Other</option>
          </Dropdown>
        )}

        <div className={actionStyles.actionsHeadingTitle}>
          <InLineEditInput
            value={action.name}
            editing={editMode}
            fieldProps={{
              name: "Name",
              style: { width: "100%" },
              validators: [validators.required, validators.maxLength(255)],
            }}
            onSubmit={(value: string) => {
              dispatch(upsertAction({ ...action, name: value }));
            }}
          />
        </div>
        <div
          className={actionStyles.actionHeadingRight}
          style={editMode ? { marginTop: "5px" } : undefined}
        >
          <div
            className={actionStyles.actionHeadingRightItem}
            style={{ marginTop: "3px", width: "15px", textAlign: "right" }}
            data-tooltip-id="aegis-tooltip"
            data-tooltip-html={"Priority"}
          >
            {action.priority}
          </div>
          <div
            className={actionStyles.actionHeadingRightItem}
            style={{ marginTop: "3px" }}
            data-tooltip-id="aegis-tooltip"
            data-tooltip-html={"Max Duration (mins)"}
          >
            {hhmmFromMinutes(action.durationUpper).slice(1)}
          </div>
          {parentType !== "poi" && (
            <div className={actionStyles.actionHeadingRightItem}>
              <div className={actionStyles.actionHeadingCrew}>
                <div
                  className={`${actionStyles.actionHeadingCrewLeft} ${crewLeftStyle}`}
                  onClick={() => {
                    if (editMode) toggleCrewAssigned("EV1");
                  }}
                >
                  1
                </div>

                <div
                  className={`${actionStyles.actionHeadingCrewRight} ${crewRightStyle}`}
                  onClick={() => {
                    if (editMode) toggleCrewAssigned("EV2");
                  }}
                >
                  2
                </div>
              </div>
            </div>
          )}

          {editMode && (
            <FontAwesomeIcon
              icon={faTrashAlt}
              size="sm"
              onClick={(e) => {
                if (window.confirm("Are you sure you want to delete this Action?")) {
                  dispatch(deleteActionByUuid(action.uuid));
                  e.stopPropagation();
                }
              }}
              style={{ marginTop: "3px" }}
            />
          )}
        </div>
      </div>
      {actionsExpanded.includes(action.uuid) && (
        <RightActionBody
          action={action}
          editMode={editMode}
          parentType={parentType}
          parentLocation={parentLocation}
        />
      )}
    </div>
  );
};

export default RightAction;
