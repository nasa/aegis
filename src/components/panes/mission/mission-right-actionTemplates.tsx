import { FunctionComponent, memo, useRef, useState } from "react";
import { ActionDefDropdown } from "components/interface/actionDefDropdown";
import paneStyles from "../global-pane-styles.module.css";
import missionStyles from "./mission.module.css";
import actionsStyles from "../actions.module.css";
import actionStyles from "../actions-action.module.css";
import { useAppSelector, shallowEqual, deepEqual } from "utils/useAppSelector";
import { LastEditedNumeric, SubpanelHeading } from "components/interface/_global-elements";
import {
  faAtlas,
  faCaretDown,
  faCaretRight,
  faClock,
  faFont,
  faIcons,
  faMessage,
  faPersonDigging,
  faPersonWalkingLuggage,
  faPlusCircle,
  faWeightHanging,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "components/interface/form/globalFields";
import {
  ValidatedInputField,
  ValidatedTextArea,
} from "components/interface/form/globalFieldsAutomerge";
import { useAppDispatch } from "utils/useAppDispatch";
import {
  EquipmentSelector,
  ExpandCollapseActionsButtons,
  GeographicUnitSelector,
} from "../actions-action-body-multiselectors";
import { collapseActions, expandActions } from "store/action";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { validators, regExValidators } from "components/interface/form/formValidators";
import { toDecimal } from "utils/formatting";
import { EmojiPicker, EmojiRenderer } from "components/interface/emojis";
import { ActionTemplateMenu } from "./mission-actionTemplates-menu";
import capitalize from "lodash/capitalize";
import { useMissionDocSelector } from "utils/useDocSelector";
import {
  crudCreateActionTemplate,
  crudUpdateActionTemplateActionDefinition,
  crudUpdateActionTemplateByField,
} from "client/crud/crud-mission-actionTemplate";

const ActionTemplates_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const actionTemplates = useMissionDocSelector((doc) => doc.actionTemplates, deepEqual);

  const sortedActionTemplates: [string, ActionTemplate][] = actionTemplates
    ? Object.entries(actionTemplates).sort(([, a], [, b]) =>
        a.templateName.localeCompare(b.templateName)
      )
    : [];

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitleContainer}>
        <div className={paneStyles.rightBodyTitle} aria-label="rightBodyTitle">
          Action Templates
        </div>
        <ExpandCollapseActionsButtons
          actionUuids={sortedActionTemplates.map((sat) => sat[0]) || []}
        />
      </div>
      <div className={paneStyles.rightBodyBody}>
        <div
          className={`${actionsStyles.actionListContainer} ${missionStyles.templateActionListContainer}`}
        >
          <ul className={actionsStyles.actionlist}>
            {sortedActionTemplates?.map(([uuid, actionTemplate]) => (
              <li
                key={uuid}
                className={actionsStyles.actionlistitem}
                aria-label="templateList-item"
              >
                <MemoizedActionTemplateItem
                  key={uuid}
                  actionTemplateUuid={uuid}
                  actionTemplate={actionTemplate}
                  editMode={editMode}
                />
              </li>
            ))}
          </ul>
        </div>

        <div className={actionsStyles.rightBodyItem} style={{ marginTop: "8px" }}>
          {editMode && (
            <Button
              icon={faPlusCircle}
              label="Add Template"
              style={{ width: "120px" }}
              ariaLabel="addNewTemplateButton"
              onClick={async () => {
                crudCreateActionTemplate();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ActionTemplates_Panel;

const ActionTemplateItem: FunctionComponent<{
  actionTemplateUuid: string;
  actionTemplate: ActionTemplate;
  editMode: boolean;
}> = ({ actionTemplateUuid, actionTemplate, editMode }) => {
  const dispatch = useAppDispatch();
  const divRef = useRef<HTMLDivElement>(null);
  const partialMission = useMissionDocSelector(
    (doc) => ({
      actionSystemVersion: doc.actionSystemVersion,
      actionDefinitions: doc.actionDefinitions,
    }),
    deepEqual
  );

  const actionsExpanded = useAppSelector((state) => state.action.actionsExpanded, shallowEqual);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  return (
    <div
      className={`${paneStyles.panelContainer} ${actionStyles.actionPanelContainer}  ${actionsStyles.actionlistitemAction}`}
      style={{ marginLeft: "6px" }}
      ref={divRef}
    >
      <div className={actionStyles.actionHeading}>
        <div
          className={actionStyles.actionHeadingCaret}
          onClick={() => {
            if (actionsExpanded.includes(actionTemplateUuid)) {
              dispatch(collapseActions([actionTemplateUuid]));
            } else {
              dispatch(expandActions([actionTemplateUuid]));
            }
          }}
          aria-label="Expand Button"
          style={{ marginTop: "2px" }}
        >
          {actionsExpanded.includes(actionTemplateUuid) ? (
            <FontAwesomeIcon
              icon={faCaretDown}
              size="sm"
              className={actionStyles.actionHeadingCaretDown}
              style={editMode ? { marginTop: "5px" } : undefined}
            />
          ) : (
            <FontAwesomeIcon
              icon={faCaretRight}
              size="sm"
              className={actionStyles.actionHeadingCaretRight}
              style={editMode ? { marginTop: "5px" } : undefined}
            />
          )}
        </div>
        {!editMode ? (
          <div
            className={actionStyles.actionHeadingTitle}
            style={{ color: "white", width: "100%", fontSize: "0.85rem" }}
            onClick={() => {
              if (actionsExpanded.includes(actionTemplateUuid)) {
                dispatch(collapseActions([actionTemplateUuid]));
              } else {
                dispatch(expandActions([actionTemplateUuid]));
              }
            }}
          >
            <div className={actionStyles.verticalCenter}>
              <div className={actionStyles.actionsHeadingTitleIcon} aria-label="Emoji Display">
                <EmojiRenderer iconValue={actionTemplate.icon ? actionTemplate.icon : "2754"} />
              </div>
            </div>
            <div className={actionStyles.verticalCenter}>
              <div style={{ marginLeft: "5px" }}>
                <span aria-label="Template Name">{actionTemplate.templateName}</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className={actionStyles.verticalCenter}>
              <div className={actionStyles.actionsHeadingTitleIcon}>
                <EmojiRenderer iconValue={actionTemplate.icon ? actionTemplate.icon : "2754"} />
              </div>
            </div>
            <div className={actionStyles.verticalCenter}>
              <ValidatedInputField
                value={actionTemplate.templateName ?? ""}
                editMode={editMode}
                fieldProps={{
                  name: "type",
                  ariaLabel: "Template Name",
                  validators: [validators.maxLength(255), validators.required],
                }}
                onSubmit={(value: string) => {
                  crudUpdateActionTemplateByField(actionTemplateUuid, "templateName", value || "");
                }}
                key={`${actionTemplateUuid}-templateName`}
              />
            </div>
          </>
        )}
        <div className={actionStyles.actionsHeadingTitle}></div>
        <div className={actionStyles.actionHeadingRight}>
          {editMode && <ActionTemplateMenu uuid={actionTemplateUuid} />}
        </div>
      </div>
      {actionsExpanded.includes(actionTemplateUuid) && (
        <>
          <div className={actionStyles.actionIndent}>
            <div className={paneStyles.panelSection}>
              <div className={paneStyles.panelSectionTitle}>
                <SubpanelHeading icon={faFont}>Title</SubpanelHeading>
              </div>
              <div className={paneStyles.panelSectionRow}>
                <div className={paneStyles.panelSection2Column}>
                  {partialMission.actionSystemVersion === 1 || !actionTemplate.stmAction ? (
                    <div className={paneStyles.inputFieldValue}>
                      <ValidatedInputField
                        value={actionTemplate.name ?? ""}
                        editMode={editMode}
                        fieldProps={{
                          name: "name",
                          ariaLabel: "Action Title",
                          validators: [validators.maxLength(255)],
                        }}
                        onSubmit={(value: string) => {
                          crudUpdateActionTemplateByField(actionTemplateUuid, "name", value || "");
                        }}
                        key={`${actionTemplateUuid}-name`}
                      />
                    </div>
                  ) : (
                    <>
                      <div className={actionStyles.actionV2Header}>
                        <ActionDefType
                          type={"verbs"}
                          actionDefinitionUuid={actionTemplate.actionDefinition?.verbUuid ?? ""}
                          editMode={editMode}
                          actionDefinitions={partialMission.actionDefinitions?.verbs}
                          actionTemplateUuid={actionTemplateUuid}
                        />
                        <div className={actionStyles.actionDefType}>of</div>
                        <ActionDefType
                          type={"nouns"}
                          actionDefinitionUuid={actionTemplate.actionDefinition?.nounUuid}
                          editMode={editMode}
                          actionDefinitions={partialMission.actionDefinitions?.nouns}
                          actionTemplateUuid={actionTemplateUuid}
                        />
                        <div className={actionStyles.actionDefType}>in</div>
                        <ActionDefType
                          type={"adjectives"}
                          actionDefinitionUuid={actionTemplate.actionDefinition?.adjectiveUuid}
                          editMode={editMode}
                          actionDefinitions={partialMission.actionDefinitions?.adjectives}
                          actionTemplateUuid={actionTemplateUuid}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            {partialMission.actionSystemVersion === 2 && (
              <div className={paneStyles.panelSection}>
                <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
                  <SubpanelHeading icon={faPersonDigging}>Action Type</SubpanelHeading>
                </div>
                <div className={paneStyles.descriptionContainer}>
                  {editMode ? (
                    <div
                      className={actionStyles.actionDualButtons}
                      style={{ cursor: editMode ? "pointer" : "default" }}
                    >
                      <div
                        className={`${actionStyles.actionDualButtonsLeft} ${actionTemplate.stmAction ? actionStyles.actionDualButtonsSelected : undefined}`}
                        onClick={() => {
                          if (editMode) {
                            crudUpdateActionTemplateByField(actionTemplateUuid, "stmAction", true);
                          }
                        }}
                      >
                        STM
                      </div>

                      <div
                        className={`${actionStyles.actionDualButtonsRight} ${!actionTemplate.stmAction ? actionStyles.actionDualButtonsSelected : undefined}`}
                        onClick={() => {
                          if (editMode) {
                            crudUpdateActionTemplateByField(actionTemplateUuid, "stmAction", false);
                          }
                        }}
                      >
                        Non-STM
                      </div>
                    </div>
                  ) : (
                    <div className={paneStyles.displayFieldValue}>
                      {actionTemplate.stmAction ? "STM" : "Non-STM"}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className={paneStyles.panelSection}>
              <div className={paneStyles.panelSectionTitle}>
                <SubpanelHeading icon={faMessage}>Description</SubpanelHeading>
              </div>
              <div className={paneStyles.descriptionContainer}>
                <ValidatedTextArea
                  key={`${actionTemplateUuid}-description`}
                  value={actionTemplate.description || ""}
                  editMode={editMode}
                  onSubmit={(value: string) => {
                    crudUpdateActionTemplateByField(actionTemplateUuid, "description", value || "");
                  }}
                  fieldProps={{
                    name: "templateDescription",
                    ariaLabel: "Template Description",
                  }}
                />
              </div>
            </div>
            <div className={paneStyles.panelSection}>
              <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
                <SubpanelHeading icon={faClock}>Estimated Action Time</SubpanelHeading>
              </div>
              <div className={paneStyles.panelSectionRow}>
                <div className={paneStyles.panelSection2Column}>
                  <div className={paneStyles.panelColumnTable}>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.inputFieldLabel}>Duration (mins):</div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.inputFieldValue}>
                          <ValidatedInputField
                            value={actionTemplate.duration?.toString()}
                            editMode={editMode}
                            fieldProps={{
                              name: "duration",
                              ariaLabel: "Duration in minutes",
                              validators: [
                                validators.maxLength(4),
                                validators.mustBeInteger,
                                // validators.mustBeNumberGTZero,
                              ],
                            }}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              e.target.value = e.target.value.replace(
                                regExValidators.regExNumber,
                                ""
                              );
                            }}
                            onSubmit={(value: string) => {
                              crudUpdateActionTemplateByField(
                                actionTemplateUuid,
                                "duration",
                                toDecimal(value)
                              );
                            }}
                            key={`${actionTemplateUuid}-duration`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className={paneStyles.panelSection}>
              <div className={missionStyles.templateTitle}>
                <SubpanelHeading icon={faWeightHanging}>Mass</SubpanelHeading>
              </div>
              <div className={paneStyles.panelSectionRow}>
                <div className={paneStyles.panelSection2Column}>
                  <div className={paneStyles.panelColumnTable}>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.inputFieldLabel}>Expected Sample Mass (g):</div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.inputFieldValue}>
                          <ValidatedInputField
                            value={actionTemplate.mass?.toString()}
                            editMode={editMode}
                            fieldProps={{
                              name: "mass",
                              ariaLabel: "Expected Sample Mass",
                              validators: [
                                validators.mustBeNumber,
                                validators.maxLength(4),
                                validators.mustBeInteger,
                              ],
                            }}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              e.target.value = e.target.value.replace(
                                regExValidators.regExNumber,
                                ""
                              );
                            }}
                            onSubmit={(value: string) => {
                              crudUpdateActionTemplateByField(
                                actionTemplateUuid,
                                "mass",
                                toDecimal(value)
                              );
                            }}
                            key={`${actionTemplateUuid}-mass`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className={paneStyles.panelSection}>
              <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
                <SubpanelHeading icon={faPersonWalkingLuggage}>Equipment Required</SubpanelHeading>
              </div>
              <div className={paneStyles.panelSectionRow}>
                <EquipmentSelector
                  equipmentItemsUsage={actionTemplate.equipmentItemsUsage}
                  actionTemplateUuid={actionTemplateUuid}
                  editMode={editMode}
                  uniqueId={actionTemplateUuid}
                />
              </div>
            </div>
            {partialMission.actionSystemVersion === 1 && (
              <div className={paneStyles.panelSection}>
                <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
                  <SubpanelHeading icon={faAtlas}>Associated Geographic Units</SubpanelHeading>
                </div>
                <div className={paneStyles.panelSectionRow}>
                  <GeographicUnitSelector
                    geographicUnitsUsage={actionTemplate.geographicUnitsUsage}
                    actionTemplateUuid={actionTemplateUuid}
                    editMode={editMode}
                    uniqueId={actionTemplateUuid}
                  />
                </div>
              </div>
            )}

            <div className={paneStyles.panelSection}>
              <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
                <SubpanelHeading icon={faIcons}>Icon</SubpanelHeading>
              </div>

              <div className={paneStyles.panelSectionRow} style={{ marginLeft: "18px" }}>
                <div className={paneStyles.rightTopTitleIcon}>
                  <EmojiRenderer iconValue={actionTemplate.icon ? actionTemplate.icon : "2754"} />
                </div>
                {editMode && (
                  <>
                    <div className={actionStyles.iconDisplayButton}>
                      <Button
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        label={!showEmojiPicker ? "Pick Icon" : "Close"}
                        style={{ width: "75px" }}
                        ariaLabel="Emoji Menu Toggle"
                      />
                    </div>
                    <div className={actionStyles.iconPickerContainer}>
                      {showEmojiPicker && (
                        <div className={actionStyles.iconPicker}>
                          <EmojiPicker
                            emojiButtonSize={30}
                            emojiSize={20}
                            perLine={10}
                            darkMode={true}
                            onEmojiSelect={(e) => {
                              // Handle both standard emojis (unified) and custom emojis (id)
                              const iconValue = e.unified || e.id;
                              crudUpdateActionTemplateByField(
                                actionTemplateUuid,
                                "icon",
                                iconValue
                              );
                              setShowEmojiPicker(false);
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className={paneStyles.panelSection}>
              <div className={paneStyles.displayFieldLabel}>Last Edited:</div>
            </div>
            <div className={paneStyles.lastEditedContainer}>
              <div className={paneStyles.displayFieldValue}>
                <LastEditedNumeric
                  updatedAt={actionTemplate?.updatedAt}
                  createdAt={actionTemplate?.createdAt}
                  infoString={`Action Template UUID: ${actionTemplateUuid}`}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const ActionDefType: FunctionComponent<{
  type: ActionDefinitionType;
  actionDefinitionUuid: string | undefined;
  editMode: boolean;
  actionDefinitions: ActionDefinitionItems;
  actionTemplateUuid: string;
}> = ({ type, actionDefinitionUuid, editMode, actionDefinitions, actionTemplateUuid }) => {
  const selectedActionDefItem = actionDefinitions[actionDefinitionUuid];

  return (
    <>
      {!editMode ? (
        <span
          className={actionStyles.actionDefType}
          style={{ color: `var(--${type.slice(0, -1)})` }}
        >
          {selectedActionDefItem?.name
            ? selectedActionDefItem?.name
            : capitalize(type.slice(0, -1))}
        </span>
      ) : (
        <ActionDefDropdown
          actionDefinitionItems={actionDefinitions || {}}
          type={type}
          selectedUuid={actionDefinitionUuid}
          onSelect={(uuid) => {
            crudUpdateActionTemplateActionDefinition(
              actionTemplateUuid,
              `${type.slice(0, -1)}Uuid` as keyof ActionDefinition,
              uuid
            );
          }}
        />
      )}
    </>
  );
};

/**
 * Memoized version of the ActionTemplateItem component to prevent unnecessary re-renders
 * when the props haven't changed.
 * This is especially useful when the component is part of a list.
 * The memoization is based on the props passed to the component.
 * The component will only re-render if the props change.
 */
const MemoizedActionTemplateItem = memo(ActionTemplateItem);
