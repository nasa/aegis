import {
  faCaretDown,
  faCaretRight,
  faGripVertical,
  faCircle,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Dropdown } from "components/interface/form/globalFields";
import { ValidatedInputField } from "components/interface/form/globalFieldsAutomerge";
import { ActionDefDropdown } from "components/interface/actionDefDropdown";
import type { FunctionComponent } from "react";
import paneStyles from "./global-pane-styles.module.css";
import actionsStyles from "./actions.module.css";
import actionStyles from "./actions-action.module.css";
import { collapseActions, expandActions } from "store/action";
import { withMissionChange } from "client/automergeDocHandles";
import {
  applyUpdateActionByField,
  applyUpdateActionDefinitionSelection,
} from "client/automerge/apply/apply-action";
import { hmmFromMinutes, titleCase } from "utils/formatting";
import { EmojiRenderer } from "components/interface/emojis";
import { useAppSelector, shallowEqual, deepEqual, refEqual } from "utils/useAppSelector";
import { validators } from "components/interface/form/formValidators";
import capitalize from "lodash/capitalize";
import { useAppDispatch } from "utils/useAppDispatch";
import RightActionBody from "./actions-action-body";
import { ActionMenu } from "./actions-action-menu";
import { getRexStatusDisplayProperties } from "../../utils/component-helpers";
import { RexStatusMenu } from "./rex/rex-status-menu";
import { actionTypes } from "store/storeUtils/action";
import { useMissionDocSelector } from "utils/useDocSelector";

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
  const partialMission = useMissionDocSelector(
    (mission) => ({
      actionSystemVersion: mission.actionSystemVersion,
      actionDefinitions: mission.actionDefinitions,
    }),
    deepEqual
  );

  const action = useMissionDocSelector((mission) => mission.actions[actionUuid], deepEqual);
  const actionsExpanded = useAppSelector((state) => state.action.actionsExpanded, shallowEqual);
  const isRexRunning = useMissionDocSelector(
    (mission) => (rexUuid ? (mission.rexes?.[rexUuid]?.isRunning ?? false) : false),
    refEqual
  );
  const rexMaestroControlled = useMissionDocSelector((mission) => {
    if (!mission?.rexes) return false;
    return Object.values(mission.rexes).find((rex) => rex.isRunning)?.maestroControlled ?? false;
  }, refEqual);
  const actionRexStatusEntry = useMissionDocSelector((mission) => {
    if (!rexUuid || !mission?.rexes) return null;
    const rex = mission.rexes[rexUuid];
    if (!rex?.actionEntries || !rex.actionEntries[actionUuid]) return null;
    return rex.actionEntries[actionUuid].rexStatus;
  }, refEqual);

  const editPermsStore = useAppSelector(
    (state) => state.user.missionPerms.permissions.edit,
    refEqual
  );

  const editPerms = allowEdit && editPermsStore && isRexRunning;

  const toggleCrewAssigned = (crewMember: Crew) => {
    const currentCrew = action.crewAssigned || [];
    let newCrew: Crew[] = [];
    if (currentCrew.includes(crewMember)) {
      newCrew = currentCrew.filter((c) => c !== crewMember);
    } else {
      newCrew = [...currentCrew, crewMember];
    }
    withMissionChange((m) =>
      applyUpdateActionByField(m, {
        actionUuid: action.uuid,
        fieldName: "crewAssigned",
        value: newCrew,
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

  const parentPoiUuid = useMissionDocSelector((mission) => {
    if (!action || !action.parentActionUuid) return undefined;
    const parentAction = mission.actions[action.parentActionUuid];
    return parentAction?.poiUuid;
  }, refEqual);
  const actionParentPoiName = useMissionDocSelector(
    (mission) => (parentPoiUuid ? mission.pois[parentPoiUuid]?.name : undefined),
    refEqual
  );

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
              style={{
                ...(!highlight
                  ? {
                      backgroundColor: action.enabled
                        ? getRexStatusDisplayProperties(actionRexStatusEntry).headerBackgroundColor
                        : "var(--grey1)",
                    }
                  : undefined),
                ...(editMode ? { padding: "4px 0px 4px 0px" } : { padding: "2px 0px 2px 0px" }),
              }}
            >
              {editMode && (
                <a>
                  <FontAwesomeIcon
                    icon={faGripVertical}
                    className={actionStyles.reorderIcon}
                    size="sm"
                  />
                </a>
              )}

              <div
                className={actionStyles.actionHeadingCaret}
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

              {partialMission.actionSystemVersion === 1 && (
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
                        withMissionChange((m) =>
                          applyUpdateActionByField(m, {
                            actionUuid: action.uuid,
                            fieldName: "type",
                            value: val as ActionType,
                          })
                        );
                      }}
                      toolTip="Action Type"
                      arrowStyle={{ color: "var(--grey5)" }}
                      containerStyle={{ justifyContent: "flex-start", width: "inherit" }}
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
              <div className={actionStyles.actionHeadingTitleIcon}>
                <EmojiRenderer iconValue={action.icon ? action.icon : "2800"} customSizeEm={1.5} />
              </div>
              {partialMission.actionSystemVersion === 1 || !action.stmAction ? (
                <div className={actionStyles.actionHeadingTitle}>
                  <div>
                    <ValidatedInputField
                      value={action.name}
                      editMode={editMode}
                      fieldProps={{
                        name: "Name",
                        ariaLabel: "Action Name",
                        validators: [validators.required, validators.maxLength(255)],
                      }}
                      onSubmit={(value: string) => {
                        withMissionChange((m) =>
                          applyUpdateActionByField(m, {
                            actionUuid: action.uuid,
                            fieldName: "name",
                            value: value || "",
                          })
                        );
                      }}
                      key={`${action.uuid}-name`}
                      focusContents={toFocus}
                      styleContainer={{ margin: "-3px" }}
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
                      actionDefinitionItems={partialMission.actionDefinitions?.verbs}
                    />
                    <div className={actionStyles.actionDefType}>of</div>
                    <ActionDefType
                      actionUuid={action.uuid}
                      type={"nouns"}
                      selectedUuid={action.actionDefinition?.nounUuid}
                      editMode={editMode}
                      actionDefinitionItems={partialMission.actionDefinitions?.nouns}
                    />
                    <div className={actionStyles.actionDefType}>in</div>
                    <ActionDefType
                      actionUuid={action.uuid}
                      type={"adjectives"}
                      selectedUuid={action.actionDefinition?.adjectiveUuid}
                      editMode={editMode}
                      actionDefinitionItems={partialMission.actionDefinitions?.adjectives}
                    />
                  </div>
                </>
              )}

              <div className={actionStyles.actionHeadingRight}>
                {action.parentActionUuid && (
                  <div
                    className={actionStyles.actionHeadingRightItem}
                    style={{ marginRight: "0", cursor: "pointer", marginTop: "3px" }}
                    data-tooltip-id="aegis-tooltip"
                    data-tooltip-content={"Copied from POI: " + actionParentPoiName}
                  >
                    <FontAwesomeIcon icon={faCircle} />
                  </div>
                )}
                <div
                  className={actionStyles.actionHeadingRightItem}
                  data-tooltip-id="aegis-tooltip"
                  data-tooltip-content={"Duration (h:mm)"}
                  style={{
                    color: action.duration < 0 ? "var(--warning)" : "inherit",
                    marginTop: "2px",
                  }}
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
  actionDefinitionItems: ActionDefinitionItems;
}> = ({ actionUuid, type, selectedUuid, editMode, actionDefinitionItems }) => {
  const selectedName = actionDefinitionItems[selectedUuid]?.name;
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
          type={type}
          selectedUuid={selectedUuid}
          onSelect={(uuid) =>
            withMissionChange((m) =>
              applyUpdateActionDefinitionSelection(m, { actionUuid, type, typeUuid: uuid })
            )
          }
        />
      )}
    </>
  );
};
