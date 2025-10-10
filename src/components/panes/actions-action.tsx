import {
  faCaretDown,
  faCaretRight,
  faGripVertical,
  faCircle,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Dropdown, InLineEditInput } from "components/interface/form/globalFields";
import { FunctionComponent } from "react";
import paneStyles from "./global-pane-styles.module.css";
import actionsStyles from "./actions.module.css";
import actionStyles from "./actions-action.module.css";
import { upsertActions, upsertActionByField } from "store/action";
import { useAppDispatch } from "utils/useAppDispatch";
import { hmmFromMinutes, titleCase } from "utils/formatting";
import { EmojiRenderer } from "components/interface/emojis";
import { useAppSelector, shallowEqual, deepEqual, refEqual } from "utils/useAppSelector";
import { validators } from "components/interface/form/formValidators";
import capitalize from "lodash/capitalize";
import { collapseActions, expandActions } from "store/interface";
import RightActionBody from "./actions-action-body";
import { ActionMenu } from "./actions-action-menu";
import {
  getRexStatusDisplayProperties,
  getActionDefinitionName,
} from "../../utils/component-helpers";
import { RexStatusMenu } from "./rex/rex-status-menu";
import { actionTypes } from "store/storeUtils/store";
import { thunkUpsertActionDefinitionSelection } from "store/thunk/thunkAction";

const RightAction: FunctionComponent<{
  editMode: boolean;
  actionUuid: string;
  highlight: boolean;
  parentType: ActionParentType;
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
  const rexMaestroControlled = useAppSelector(
    (state) => state.rex.rexesFromDb.find((rex) => rex.isRunning)?.maestroControlled,
    refEqual
  );
  const actionRexStatusEntry = useAppSelector((state) => {
    if (!rexUuid) return;
    //find all action entry that match this action uuid for the running rex. return the status of the last one.
    const rex = state.rex.rexesFromDb.find((rex) => rex.uuid === rexUuid);
    if (!rex?.actionEntries || !rex.actionEntries[actionUuid]) {
      return null;
    } else {
      return rex.actionEntries[actionUuid].rexStatus;
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
      upsertActions([
        {
          ...action,
          crewAssigned: newCrew,
        },
      ])
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

  const actionParentPoiName = useAppSelector((state) => {
    if (!action || !action.parentActionUuid) return undefined;
    const parentAction = state.action.actions.find((a) => a.uuid === action.parentActionUuid);
    if (!parentAction || !parentAction.poiUuid) return undefined;
    const poi = state.poi.pois.find((p) => p.uuid === parentAction.poiUuid);
    return poi?.name;
  }, refEqual);

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
                  divStyle={{ marginTop: editMode ? "5px" : "3px" }}
                  entryType="action"
                  uuid={action.uuid}
                  editPerms={editPerms}
                  maestroControlled={rexMaestroControlled}
                />
              ) : (
                <div className={actionStyles.actionHeadingRexStatusWrapper}></div>
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
                        dispatch(upsertActions([{ ...action, type: val as ActionType }]));
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
                <EmojiRenderer iconValue={action.icon ? action.icon : "2800"} customSizeEm={1.5} />
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
                {action.parentActionUuid && (
                  <div
                    className={actionStyles.actionHeadingRightItem}
                    style={{ marginRight: "0", cursor: "pointer" }}
                    data-tooltip-id="aegis-tooltip"
                    data-tooltip-html={"Copied from POI: " + actionParentPoiName}
                  >
                    <FontAwesomeIcon icon={faCircle} />
                  </div>
                )}
                <div
                  className={actionStyles.actionHeadingRightItem}
                  data-tooltip-id="aegis-tooltip"
                  data-tooltip-html={"Duration (h:mm)"}
                  style={{ color: action.duration < 0 ? "var(--warning)" : "inherit" }}
                >
                  {hmmFromMinutes(action.duration)}
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

export const ActionDefType: FunctionComponent<{
  actionUuid: string;
  type: ActionDefinitionType;
  selectedUuid: string;
  editMode: boolean;
}> = ({ actionUuid, type, selectedUuid, editMode }) => {
  const actionDefinitionItems = useAppSelector(
    (state) => state.mission.mission.actionDefinitions[type],
    deepEqual
  );

  const selectedName = getActionDefinitionName({ actionDefinitionItems, uuid: selectedUuid });

  return (
    <>
      {!editMode ? (
        <span
          className={actionStyles.actionDefType}
          style={{ color: `var(--${type.slice(0, -1)})` }}
        >
          {selectedName || capitalize(type.slice(0, -1))}
        </span>
      ) : (
        <ActionDefDropdown
          actionDefinitionItems={actionDefinitionItems}
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
  actionDefinitionItems: ActionDefinitionItem[];
  type: ActionDefinitionType;
  selectedUuid: string;
}> = ({ actionUuid, actionDefinitionItems, type, selectedUuid }) => {
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
      <option value="">{capitalize(type)}</option>
      {actionDefinitionItems.map((actionDef) => (
        <option key={actionDef.uuid} value={actionDef.uuid}>
          {actionDef.name}
        </option>
      ))}
    </Dropdown>
  );
};
