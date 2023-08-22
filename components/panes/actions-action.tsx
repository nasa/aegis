import { faCaretDown, faCaretRight, faGripVertical } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Dropdown, InLineEditInput } from "components/interface/form/globalFields";
import { FunctionComponent } from "react";
import paneStyles from "./global-pane-styles.module.css";
import actionsStyles from "./actions.module.css";
import actionStyles from "./actions-action.module.css";
import { upsertAction, upsertActionByField } from "store/action";
import { useAppDispatch } from "utils/useAppDispatch";
import { decodeEmoji, hhmmFromMinutes } from "utils/formatting";
import { useAppSelector, shallowEqual, deepEqual } from "utils/useAppSelector";
import { validators } from "components/interface/form/formValidators";
import _ from "lodash";
import { collapseActions, expandActions } from "store/interface";
import { RightActionBody } from "./actions-action-body";
import { ActionMenu } from "./actions-action-menu";

const RightAction: FunctionComponent<{
  editMode: boolean;
  actionUuid: string;
  highlight: boolean;
  parentType: "station" | "poi" | "eva";
  parentLocation: AEGISPoint | null;
  parentElevation: number | null;
}> = ({ editMode, actionUuid, highlight, parentType, parentLocation, parentElevation }) => {
  const dispatch = useAppDispatch();

  const action = useAppSelector(
    (state) => state.action.actions.find((a) => a.uuid === actionUuid),
    deepEqual
  );
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

  const toggleActionExpanded = (actionUuid: string) => {
    if (actionsExpanded.includes(actionUuid)) {
      dispatch(collapseActions([actionUuid]));
    } else {
      dispatch(expandActions([actionUuid]));
    }
  };

  const crewLeftStyle = action?.crewAssigned?.includes("EV1")
    ? actionStyles.actionHeadingCrewSelected
    : undefined;

  const crewRightStyle = action?.crewAssigned?.includes("EV2")
    ? actionStyles.actionHeadingCrewSelected
    : undefined;

  return (
    <>
      {action && (
        <div
          className={`${paneStyles.panelContainer} ${actionStyles.actionPanelContainer} ${actionsStyles.actionlistitemAction}`}
        >
          <div
            className={`${actionStyles.actionsHeading} ${
              highlight && actionStyles.highlightAction
            } ${!action.enabled && actionStyles.actionsHeadingDisabled}`}
          >
            {editMode && (
              <a className={actionStyles.verticalCenter}>
                <FontAwesomeIcon
                  icon={faGripVertical}
                  className={actionStyles.reorderIcon}
                  size="sm"
                />
              </a>
            )}

            <div
              className={`${actionStyles.actionsHeadingCaret} ${actionStyles.verticalCenter}`}
              onClick={() => {
                toggleActionExpanded(action.uuid);
              }}
            >
              {actionsExpanded.includes(action.uuid) ? (
                <FontAwesomeIcon
                  icon={faCaretDown}
                  size="sm"
                  className={actionStyles.actionsHeadingCaretDown}
                />
              ) : (
                <FontAwesomeIcon
                  icon={faCaretRight}
                  size="sm"
                  className={actionStyles.actionsHeadingCaretRight}
                />
              )}
            </div>

            {!editMode ? (
              <div className={actionStyles.verticalCenter}>
                <div
                  className={actionStyles.actionsHeadingType}
                  onClick={() => {
                    toggleActionExpanded(action.uuid);
                  }}
                >
                  {action.type}
                </div>
              </div>
            ) : (
              <Dropdown
                selected={action.type}
                onChange={(val) => {
                  dispatch(upsertAction({ ...action, type: val as ActionType }));
                }}
                toolTip="Action Type"
                arrowStyle={{ color: "var(--grey5)" }}
              >
                <option value="measurement">Measurement</option>
                <option value="observation">Observation</option>
                <option value="sample">Sample</option>
                <option value="photo">Photo</option>
                <option value="other">Other</option>
              </Dropdown>
            )}

            <div className={actionStyles.actionsHeadingTitle}>
              <div className={actionStyles.verticalCenter}>
                <div className={actionStyles.actionsHeadingTitleIcon}>
                  {decodeEmoji(action.icon ? action.icon : "2800")}
                </div>
              </div>
              <div className={actionStyles.verticalCenter}>
                <InLineEditInput
                  value={action.name}
                  editing={editMode}
                  fieldProps={{
                    name: "Name",
                    style: { width: "100%" },
                    validators: [validators.required, validators.maxLength(255)],
                  }}
                  onSubmit={(value: string) => {
                    dispatch(upsertActionByField(action.uuid, "name", value));
                  }}
                  key={`${action.uuid}-name`}
                />
              </div>
            </div>

            <div
              className={actionStyles.actionHeadingRight}
              style={editMode ? { marginTop: "5px" } : undefined}
            >
              <div
                className={actionStyles.actionHeadingRightItem}
                style={{ width: "15px", textAlign: "right" }}
                data-tooltip-id="aegis-tooltip"
                data-tooltip-html={"Priority"}
              >
                {action.priority}
              </div>
              <div
                className={actionStyles.actionHeadingRightItem}
                data-tooltip-id="aegis-tooltip"
                data-tooltip-html={"Max Duration (mins)"}
              >
                {hhmmFromMinutes(action.durationUpper).slice(1)}
              </div>
              {parentType !== "poi" && (
                <div className={actionStyles.actionHeadingRightItem}>
                  <div
                    className={actionStyles.actionHeadingCrew}
                    style={{ cursor: editMode ? "pointer" : "default" }}
                  >
                    {action.enabled ? (
                      <>
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
                      </>
                    ) : (
                      <div className={actionStyles.actionHeadingCrewDisabled}></div>
                    )}
                  </div>
                </div>
              )}

              {editMode && <ActionMenu action={action} />}
            </div>
          </div>
          {actionsExpanded.includes(action.uuid) && (
            <RightActionBody
              action={action}
              editMode={editMode}
              parentType={parentType}
              parentLocation={parentLocation}
              parentElevation={parentElevation}
            />
          )}
        </div>
      )}
    </>
  );
};

export default RightAction;
