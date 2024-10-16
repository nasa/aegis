import { faCaretDown, faCaretRight, faGripVertical } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Dropdown, InLineEditInput } from "components/interface/form/globalFields";
import { FunctionComponent } from "react";
import paneStyles from "./global-pane-styles.module.css";
import actionsStyles from "./actions.module.css";
import actionStyles from "./actions-action.module.css";
import { upsertAction, upsertActionByField } from "store/action";
import { useAppDispatch } from "utils/useAppDispatch";
import { decodeEmoji, hmmFromMinutes, titleCase } from "utils/formatting";
import { useAppSelector, shallowEqual, deepEqual, refEqual } from "utils/useAppSelector";
import { validators } from "components/interface/form/formValidators";
import _ from "lodash";
import { collapseActions, expandActions } from "store/interface";
import RightActionBody from "./actions-action-body";
import { ActionMenu } from "./actions-action-menu";
import { getRexStatusDisplayProperties } from "../../utils/rex";
import { RexStatusMenu } from "./rex/rex";
import { actionTypes } from "utils/store";
import { thunkUpsertActionDefinitionSelection } from "store/thunk/thunkAction";

const RightAction: FunctionComponent<{
  editMode: boolean;
  actionUuid: string;
  highlight: boolean;
  parentType: "station" | "poi" | "eva";
  parentLocation: AEGISPoint | null;
  parentElevation: number | null;
  rexUuid: string | null;
  toFocus: boolean;
  allowEdit?: boolean;
}> = ({
  editMode,
  actionUuid,
  highlight,
  parentType,
  parentLocation,
  parentElevation,
  rexUuid,
  toFocus,
  allowEdit = true,
}) => {
  const dispatch = useAppDispatch();

  const action = useAppSelector(
    (state) => state.action.actions.find((a) => a.uuid === actionUuid),
    deepEqual
  );
  const actionsExpanded = useAppSelector((state) => state.interface.actionsExpanded, shallowEqual);
  const isRexRunning = useAppSelector(
    (state) => state.rex.rexes.find((rex) => rex.uuid === rexUuid)?.isRunning,
    refEqual
  );
  const actionRexStatusEntry = useAppSelector((state) => {
    if (!rexUuid) return;
    //find all action entry that match this action uuid for the running rex. return the status of the last one.
    const rex = state.rex.rexesFromDb.find((rex) => rex.uuid === rexUuid);
    if (!rex?.actionEntries || !rex.actionEntries[actionUuid]) {
      return null;
    } else {
      return _.last(rex.actionEntries[actionUuid]).rexStatus;
    }
  }, refEqual);

  const editPermsStore = useAppSelector(
    (state) => state.user.missionPerms.permissions.edit,
    refEqual
  );

  const editPerms = allowEdit && editPermsStore && isRexRunning;

  const actionSystemVersion = useAppSelector(
    (state) => state.mission.mission.actionSystemVersion,
    refEqual
  );

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
    ? actionStyles.actionDualButtonsSelected
    : undefined;

  const crewRightStyle = action?.crewAssigned?.includes("EV2")
    ? actionStyles.actionDualButtonsSelected
    : undefined;

  return (
    <>
      {action && (
        <>
          {rexUuid && (
            <>
              {action.enabled ? (
                <RexStatusMenu
                  rexStatus={actionRexStatusEntry}
                  divClassName={actionStyles.actionHeadingRexStatusWrapper}
                  divStyle={{ marginTop: editMode ? "6px" : "1px" }}
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
                className={actionStyles.actionHeadingCaret}
                style={{ marginTop: editMode ? "4px" : "2px" }}
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

              {actionSystemVersion === 1 && (
                <>
                  {!editMode ? (
                    <div
                      className={actionStyles.actionHeadingType}
                      onClick={() => {
                        toggleActionExpanded(action.uuid);
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
                      arrowStyle={{ color: "var(--grey5)" }}
                    >
                      {actionTypes.map((type) => (
                        <option key={type} value={type}>
                          {titleCase(type)}
                        </option>
                      ))}
                    </Dropdown>
                  )}
                </>
              )}
              <div
                className={actionStyles.actionHeadingTitleIcon}
                style={{ marginTop: editMode ? "4px" : "2px" }}
              >
                {decodeEmoji(action.icon ? action.icon : "2800")}
              </div>
              {actionSystemVersion === 1 || !action.stmAction ? (
                <div className={actionStyles.actionHeadingTitle}>
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
                      toFocus={toFocus}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className={actionStyles.actionV2Header}>
                    <ActionDefType
                      actionUuid={action.uuid}
                      type={"verbs"}
                      selectedUuid={action.actionDefinition?.verbUuid}
                      editMode={editMode}
                    />
                    <div className={actionStyles.actionDefType}>of</div>
                    <ActionDefType
                      actionUuid={action.uuid}
                      type={"nouns"}
                      selectedUuid={action.actionDefinition?.nounUuid}
                      editMode={editMode}
                    />
                    <div className={actionStyles.actionDefType}>in</div>
                    <ActionDefType
                      actionUuid={action.uuid}
                      type={"adjectives"}
                      selectedUuid={action.actionDefinition?.adjectiveUuid}
                      editMode={editMode}
                    />
                  </div>
                </>
              )}

              <div
                className={actionStyles.actionHeadingRight}
                style={editMode ? { marginTop: "5px" } : undefined}
              >
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
                      className={actionStyles.actionDualButtons}
                      style={{ cursor: editMode ? "pointer" : "default" }}
                    >
                      {action.enabled ? (
                        <>
                          <div
                            className={`${actionStyles.actionDualButtonsLeft} ${crewLeftStyle}`}
                            onClick={() => {
                              if (editMode) toggleCrewAssigned("EV1");
                            }}
                          >
                            1
                          </div>

                          <div
                            className={`${actionStyles.actionDualButtonsRight} ${crewRightStyle}`}
                            onClick={() => {
                              if (editMode) toggleCrewAssigned("EV2");
                            }}
                          >
                            2
                          </div>
                        </>
                      ) : (
                        <div className={actionStyles.actionDualButtonsDisabled}></div>
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
                rexUuid={rexUuid}
                allowRexEdit={editPerms}
              />
            )}
          </div>
        </>
      )}
    </>
  );
};

export default RightAction;

const ActionDefType: FunctionComponent<{
  actionUuid: string;
  type: ActionDefinitionType;
  selectedUuid: string;
  editMode: boolean;
}> = ({ actionUuid, type, selectedUuid, editMode }) => {
  const actionDefinitions = useAppSelector(
    (state) => state.mission.mission.actionDefinitions[type],
    deepEqual
  );

  const selectedActionDef = actionDefinitions.find((actionDef) => actionDef.uuid === selectedUuid);

  return (
    <>
      {!editMode ? (
        <span
          className={actionStyles.actionDefType}
          style={{ color: `var(--${type.slice(0, -1)})` }}
        >
          {selectedActionDef?.name ? selectedActionDef?.name : _.capitalize(type.slice(0, -1))}
        </span>
      ) : (
        <ActionDefDropdown
          actionDefinitions={actionDefinitions}
          actionUuid={actionUuid}
          type={type}
          selectedUuid={selectedUuid}
        />
      )}
    </>
  );
};

const ActionDefDropdown: FunctionComponent<{
  actionUuid: string;
  actionDefinitions: ActionDefinitionItem[];
  type: ActionDefinitionType;
  selectedUuid: string;
}> = ({ actionUuid, actionDefinitions, type, selectedUuid }) => {
  const dispatch = useAppDispatch();

  return (
    <Dropdown
      selected={selectedUuid}
      onChange={(val) => {
        dispatch(thunkUpsertActionDefinitionSelection({ actionUuid, type, typeUuid: val }));
      }}
      toolTip={`${type}`}
      arrowStyle={{ color: "var(--grey5)" }}
      containerStyle={{ width: "70px" }}
    >
      <option value="">{_.capitalize(type)}</option>
      {actionDefinitions.map((actionDef) => (
        <option
          key={actionDef.uuid}
          value={actionDef.uuid}
          selected={actionDef.uuid === selectedUuid}
        >
          {actionDef.name}
        </option>
      ))}
    </Dropdown>
  );
};
