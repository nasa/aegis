import { faCaretDown, faCaretRight, faGripVertical } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Dropdown, InLineEditInput } from "components/interface/form/globalFields";
import { FunctionComponent } from "react";
import paneStyles from "./global-pane-styles.module.css";
import actionsStyles from "./actions.module.css";
import actionStyles from "./actions-action.module.css";
import { upsertAction, upsertActionByField } from "store/action";
import { useAppDispatch } from "utils/useAppDispatch";
import { decodeEmoji, hmmFromMinutes } from "utils/formatting";
import { useAppSelector, shallowEqual, deepEqual, refEqual } from "utils/useAppSelector";
import { validators } from "components/interface/form/formValidators";
import _ from "lodash";
import { collapseActions, expandActions } from "store/interface";
import { RightActionBody } from "./actions-action-body";
import { ActionMenu } from "./actions-action-menu";
import { getRexStatusDisplayProperties } from "../../utils/rex";
import { RexStatusMenu } from "./rex/rex";

const RightAction: FunctionComponent<{
  editMode: boolean;
  actionUuid: string;
  highlight: boolean;
  parentType: "station" | "poi" | "eva";
  parentLocation: AEGISPoint | null;
  parentElevation: number | null;
  isRexRunning: boolean;
}> = ({
  editMode,
  actionUuid,
  highlight,
  parentType,
  parentLocation,
  parentElevation,
  isRexRunning,
}) => {
  const dispatch = useAppDispatch();

  const action = useAppSelector(
    (state) => state.action.actions.find((a) => a.uuid === actionUuid),
    deepEqual
  );
  const actionsExpanded = useAppSelector((state) => state.interface.actionsExpanded, shallowEqual);
  const actionRexStatusEntry = useAppSelector((state) => {
    //find all action entry that match this action uuid for the running rex. return the status of the last one.
    const runningRexFromDb = state.rex.rexesFromDb.find((rex) => rex.isRunning);
    if (!runningRexFromDb?.actionEntries || !runningRexFromDb.actionEntries[actionUuid]) {
      return null;
    } else {
      return _.last(runningRexFromDb.actionEntries[actionUuid]).rexStatus;
    }
  }, refEqual);

  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

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
        <>
          {isRexRunning && (
            <>
              {action.enabled ? (
                <RexStatusMenu
                  rexStatus={actionRexStatusEntry}
                  divClassName={actionStyles.actionHeadingRexStatusWrapper}
                  entryType="action"
                  uuid={action.uuid}
                  editPerms={editPerms}
                />
              ) : (
                <div className={actionStyles.actionHeadingRexStatusWrapper}>
                  <div className={actionStyles.actionHeadingRexStatusIconBlank}></div>
                </div>
              )}
            </>
          )}
          <div
            className={`${paneStyles.panelContainer} ${actionStyles.actionPanelContainer} ${actionsStyles.actionlistitemAction} `}
            style={{
              backgroundColor:
                getRexStatusDisplayProperties(actionRexStatusEntry).bodyBackgroundColor,
              borderRadius: "var(--radius)",
            }}
          >
            <div
              className={`${actionStyles.actionHeading} ${
                highlight && actionStyles.highlightAction
              } ${!action.enabled && actionStyles.actionHeadingDisabled} ${
                getRexStatusDisplayProperties(actionRexStatusEntry).customTextClassName
              }`}
              style={
                !highlight
                  ? {
                      backgroundColor: action.enabled
                        ? getRexStatusDisplayProperties(actionRexStatusEntry).headerBackgroundColor
                        : "var(--grey1)",
                    }
                  : undefined
              }
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
                className={`${actionStyles.actionHeadingCaret} ${actionStyles.verticalCenter}`}
                onClick={() => {
                  toggleActionExpanded(action.uuid);
                }}
              >
                {actionsExpanded.includes(action.uuid) ? (
                  <FontAwesomeIcon
                    icon={faCaretDown}
                    size="sm"
                    className={actionStyles.actionHeadingCaretDown}
                  />
                ) : (
                  <FontAwesomeIcon
                    icon={faCaretRight}
                    size="sm"
                    className={actionStyles.actionHeadingCaretRight}
                  />
                )}
              </div>

              {!editMode ? (
                <div className={actionStyles.verticalCenter}>
                  <div
                    className={actionStyles.actionHeadingType}
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

              <div className={actionStyles.actionHeadingTitle}>
                <div className={actionStyles.verticalCenter}>
                  <div className={actionStyles.actionHeadingTitleIcon}>
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
                  data-tooltip-html={"Max Duration (h:mm)"}
                  style={{ color: action.durationUpper < 0 ? "var(--warning)" : "inherit" }}
                >
                  {hmmFromMinutes(action.durationUpper)}
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
        </>
      )}
    </>
  );
};

export default RightAction;
