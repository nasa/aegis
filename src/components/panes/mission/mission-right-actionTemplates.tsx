import { FunctionComponent, useState, useEffect } from "react";
import { ActionDefDropdown } from "components/interface/actionDefDropdown";
import paneStyles from "../global-pane-styles.module.css";
import missionStyles from "./mission.module.css";
import actionsStyles from "../actions.module.css";
import actionStyles from "../actions-action.module.css";
import { useAppSelector, shallowEqual, deepEqual, refEqual } from "utils/useAppSelector";
import { LastEdited, SubpanelHeading } from "components/interface/_global-elements";
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
import { Button, InLineEditInput, TextArea } from "components/interface/form/globalFields";
import { useAppDispatch } from "utils/useAppDispatch";
import {
  EquipmentSelector,
  ExpandCollapseActionsButtons,
  GeographicUnitSelector,
} from "../actions-action-body-multiselectors";
import { thunkCreateActionTemplate, thunkUpdateActionTemplate } from "store/thunk/thunkMission";
import { collapseActions, expandActions } from "store/interface";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { validators, regExValidators } from "components/interface/form/formValidators";
import { toDecimal } from "utils/formatting";
import { EmojiPicker, EmojiRenderer } from "components/interface/emojis";
import { ActionTemplateMenu } from "../mission-actionTemplates-menu";
import capitalize from "lodash/capitalize";

const ActionTemplates_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const sortedActionTemplates: [string, ActionTemplate][] = useAppSelector((state) => {
    if (!state.mission.mission.actionTemplates) return [];
    return Object.entries(state.mission.mission.actionTemplates).sort(([, a], [, b]) =>
      a.templateName.localeCompare(b.templateName)
    );
  }, deepEqual);
  const actionsExpanded = useAppSelector((state) => state.interface.actionsExpanded, shallowEqual);
  const actionSystemVersion = useAppSelector(
    (state) => state.mission.mission.actionSystemVersion,
    refEqual
  );

  const [newTemplateUuid, setNewTemplateUuid] = useState(undefined);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Un-marks newest list item as "new" after a short timeout (for auto-focusing)
  useEffect(() => {
    if (newTemplateUuid !== undefined) {
      setTimeout(() => {
        setNewTemplateUuid(undefined);
      }, 300);
    }
  }, [newTemplateUuid]);

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitleContainer}>
        <div className={paneStyles.rightBodyTitle} aria-label="rightBodyTitle">
          Action Templates
        </div>
        <ExpandCollapseActionsButtons actionUuids={sortedActionTemplates.map((sat) => sat[0])} />
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
                <div
                  className={`${paneStyles.panelContainer} ${actionStyles.actionPanelContainer}  ${actionsStyles.actionlistitemAction}`}
                  style={{ marginLeft: "6px" }}
                >
                  <div className={actionStyles.actionHeading}>
                    <div
                      className={actionStyles.actionHeadingCaret}
                      onClick={() => {
                        if (actionsExpanded.includes(uuid)) {
                          dispatch(collapseActions([uuid]));
                        } else {
                          dispatch(expandActions([uuid]));
                        }
                      }}
                      aria-label="Expand Button"
                      style={{ marginTop: "2px" }}
                    >
                      {actionsExpanded.includes(uuid) ? (
                        <FontAwesomeIcon
                          icon={faCaretDown}
                          size="sm"
                          className={actionStyles.actionHeadingCaretDown}
                          style={editMode && { marginTop: "5px" }}
                        />
                      ) : (
                        <FontAwesomeIcon
                          icon={faCaretRight}
                          size="sm"
                          className={actionStyles.actionHeadingCaretRight}
                          style={editMode && { marginTop: "5px" }}
                        />
                      )}
                    </div>
                    {!editMode ? (
                      <div
                        className={actionStyles.actionHeadingTitle}
                        style={{ color: "white", width: "100%", fontSize: "0.85rem" }}
                        onClick={() => {
                          if (actionsExpanded.includes(uuid)) {
                            dispatch(collapseActions([uuid]));
                          } else {
                            dispatch(expandActions([uuid]));
                          }
                        }}
                      >
                        <div className={actionStyles.verticalCenter}>
                          <div
                            className={actionStyles.actionsHeadingTitleIcon}
                            aria-label="Emoji Display"
                          >
                            <EmojiRenderer
                              iconValue={actionTemplate.icon ? actionTemplate.icon : "2754"}
                            />
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
                            <EmojiRenderer
                              iconValue={actionTemplate.icon ? actionTemplate.icon : "2754"}
                            />
                          </div>
                        </div>
                        <div className={actionStyles.verticalCenter}>
                          <InLineEditInput
                            value={actionTemplate.templateName}
                            editing={editMode}
                            fieldProps={{
                              name: "type",
                              ariaLabel: "Template Name",
                              style: { width: "100%" },
                              validators: [validators.required, validators.maxLength(255)],
                            }}
                            onSubmit={(value: string) => {
                              dispatch(
                                thunkUpdateActionTemplate({
                                  uuid: uuid,
                                  fieldName: "templateName",
                                  value: value,
                                })
                              );
                            }}
                            key={`${uuid}-templateName`}
                            toFocus={uuid === newTemplateUuid}
                          />
                        </div>
                      </>
                    )}
                    <div className={actionStyles.actionsHeadingTitle}></div>
                    <div className={actionStyles.actionHeadingRight}>
                      {editMode && <ActionTemplateMenu uuid={uuid} />}
                    </div>
                  </div>
                  {actionsExpanded.includes(uuid) && (
                    <>
                      <div className={actionStyles.actionIndent}>
                        <div className={paneStyles.panelSection}>
                          <div className={paneStyles.panelSectionTitle}>
                            <SubpanelHeading icon={faFont}>Title</SubpanelHeading>
                          </div>
                          <div className={paneStyles.panelSectionRow}>
                            <div className={paneStyles.panelSection2Column}>
                              {actionSystemVersion === 1 || !actionTemplate.stmAction ? (
                                <div className={paneStyles.inputFieldValue}>
                                  <InLineEditInput
                                    value={actionTemplate.name}
                                    editing={editMode}
                                    fieldProps={{
                                      name: "name",
                                      ariaLabel: "Action Title",
                                      style: { width: "250px" },
                                      validators: [validators.maxLength(255)],
                                    }}
                                    onSubmit={(value: string) => {
                                      dispatch(
                                        thunkUpdateActionTemplate({
                                          uuid: uuid,
                                          fieldName: "name",
                                          value: value,
                                        })
                                      );
                                    }}
                                    key={`${uuid}-name`}
                                  />
                                </div>
                              ) : (
                                <>
                                  <div className={actionStyles.actionV2Header}>
                                    <ActionDefType
                                      actionTemplateUuid={uuid}
                                      actionTemplate={actionTemplate}
                                      type={"verbs"}
                                      selectedUuid={actionTemplate.actionDefinition?.verbUuid}
                                      editMode={editMode}
                                    />
                                    <div className={actionStyles.actionDefType}>of</div>
                                    <ActionDefType
                                      actionTemplateUuid={uuid}
                                      actionTemplate={actionTemplate}
                                      type={"nouns"}
                                      selectedUuid={actionTemplate.actionDefinition?.nounUuid}
                                      editMode={editMode}
                                    />
                                    <div className={actionStyles.actionDefType}>in</div>
                                    <ActionDefType
                                      actionTemplateUuid={uuid}
                                      actionTemplate={actionTemplate}
                                      type={"adjectives"}
                                      selectedUuid={actionTemplate.actionDefinition?.adjectiveUuid}
                                      editMode={editMode}
                                    />
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        {actionSystemVersion === 2 && (
                          <div className={paneStyles.panelSection}>
                            <div
                              className={paneStyles.panelSectionTitle}
                              style={{ marginBottom: "8px" }}
                            >
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
                                      if (editMode)
                                        dispatch(
                                          thunkUpdateActionTemplate({
                                            uuid: uuid,
                                            fieldName: "stmAction",
                                            value: true,
                                          })
                                        );
                                    }}
                                  >
                                    STM
                                  </div>

                                  <div
                                    className={`${actionStyles.actionDualButtonsRight} ${!actionTemplate.stmAction ? actionStyles.actionDualButtonsSelected : undefined}`}
                                    onClick={() => {
                                      if (editMode)
                                        dispatch(
                                          thunkUpdateActionTemplate({
                                            uuid: uuid,
                                            fieldName: "stmAction",
                                            value: false,
                                          })
                                        );
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
                            <TextArea
                              key={uuid}
                              value={actionTemplate.description}
                              editing={editMode}
                              onSubmit={(value: string) => {
                                dispatch(
                                  thunkUpdateActionTemplate({
                                    uuid: uuid,
                                    fieldName: "description",
                                    value: value,
                                  })
                                );
                              }}
                              fieldProps={{
                                name: "templateDescription",
                                ariaLabel: "Template Description",
                              }}
                            />
                          </div>
                        </div>
                        <div className={paneStyles.panelSection}>
                          <div
                            className={paneStyles.panelSectionTitle}
                            style={{ marginBottom: "8px" }}
                          >
                            <SubpanelHeading icon={faClock}>Estimated Action Time</SubpanelHeading>
                          </div>
                          <div className={paneStyles.panelSectionRow}>
                            <div className={paneStyles.panelSection2Column}>
                              <div className={paneStyles.panelColumnTable}>
                                <div className={paneStyles.panelColumnTableRow}>
                                  <div className={paneStyles.panelColumnTableCell}>
                                    <div className={paneStyles.inputFieldLabel}>
                                      Duration (mins):
                                    </div>
                                  </div>
                                  <div className={paneStyles.panelColumnTableCell}>
                                    <div className={paneStyles.inputFieldValue}>
                                      <InLineEditInput
                                        value={actionTemplate.duration?.toString()}
                                        editing={editMode}
                                        fieldProps={{
                                          name: "duration",
                                          ariaLabel: "Duration in minutes",
                                          style: { width: "45px" },
                                          validators: [
                                            validators.maxLength(4),
                                            validators.mustBeInteger,
                                            // validators.mustBeNumberGTZero,
                                          ],
                                          onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                                            e.target.value = e.target.value.replace(
                                              regExValidators.regExNumber,
                                              ""
                                            );
                                          },
                                        }}
                                        onSubmit={(value: string) => {
                                          dispatch(
                                            thunkUpdateActionTemplate({
                                              uuid: uuid,
                                              fieldName: "duration",
                                              value: toDecimal(value),
                                            })
                                          );
                                        }}
                                        key={`${uuid}-duration`}
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
                                    <div className={paneStyles.inputFieldLabel}>
                                      Expected Sample Mass (g):
                                    </div>
                                  </div>
                                  <div className={paneStyles.panelColumnTableCell}>
                                    <div className={paneStyles.inputFieldValue}>
                                      <InLineEditInput
                                        value={actionTemplate.mass?.toString()}
                                        editing={editMode}
                                        fieldProps={{
                                          name: "mass",
                                          ariaLabel: "Expected Sample Mass",
                                          style: { width: "45px" },
                                          validators: [
                                            validators.mustBeNumber,
                                            validators.maxLength(4),
                                            validators.mustBeInteger,
                                          ],
                                          onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                                            e.target.value = e.target.value.replace(
                                              regExValidators.regExNumber,
                                              ""
                                            );
                                          },
                                        }}
                                        onSubmit={(value: string) => {
                                          dispatch(
                                            thunkUpdateActionTemplate({
                                              uuid: uuid,
                                              fieldName: "mass",
                                              value: toDecimal(value),
                                            })
                                          );
                                        }}
                                        key={`${uuid}-mass`}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className={paneStyles.panelSection}>
                          <div
                            className={paneStyles.panelSectionTitle}
                            style={{ marginBottom: "8px" }}
                          >
                            <SubpanelHeading icon={faPersonWalkingLuggage}>
                              Equipment Required
                            </SubpanelHeading>
                          </div>
                          <div className={paneStyles.panelSectionRow}>
                            <EquipmentSelector
                              equipmentItemsUsage={actionTemplate.equipmentItemsUsage}
                              editMode={editMode}
                              onChange={(e) => {
                                dispatch(
                                  thunkUpdateActionTemplate({
                                    uuid: uuid,
                                    fieldName: "equipmentItemsUsage",
                                    value: e,
                                  })
                                );
                              }}
                              uniqueId={uuid}
                            />{" "}
                          </div>
                        </div>
                        {actionSystemVersion === 1 && (
                          <div className={paneStyles.panelSection}>
                            <div
                              className={paneStyles.panelSectionTitle}
                              style={{ marginBottom: "8px" }}
                            >
                              <SubpanelHeading icon={faAtlas}>
                                Associated Geographic Units
                              </SubpanelHeading>
                            </div>
                            <div className={paneStyles.panelSectionRow}>
                              <GeographicUnitSelector
                                geographicUnitsUsage={actionTemplate.geographicUnitsUsage}
                                editMode={editMode}
                                onChange={(e) => {
                                  dispatch(
                                    thunkUpdateActionTemplate({
                                      uuid: uuid,
                                      fieldName: "geographicUnitsUsage",
                                      value: e,
                                    })
                                  );
                                }}
                                uniqueId={uuid}
                              />{" "}
                            </div>
                          </div>
                        )}

                        <div className={paneStyles.panelSection}>
                          <div
                            className={paneStyles.panelSectionTitle}
                            style={{ marginBottom: "8px" }}
                          >
                            <SubpanelHeading icon={faIcons}>Icon</SubpanelHeading>
                          </div>

                          <div
                            className={paneStyles.panelSectionRow}
                            style={{ marginLeft: "18px" }}
                          >
                            <div className={paneStyles.rightTopTitleIcon}>
                              <EmojiRenderer
                                iconValue={actionTemplate.icon ? actionTemplate.icon : "2754"}
                              />
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
                                          dispatch(
                                            thunkUpdateActionTemplate({
                                              uuid: uuid,
                                              fieldName: "icon",
                                              value: iconValue,
                                            })
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
                            <LastEdited updatedAt={actionTemplate?.updatedAt} />
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
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
                setNewTemplateUuid((await dispatch(thunkCreateActionTemplate())).payload);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ActionTemplates_Panel;

const ActionDefType: FunctionComponent<{
  actionTemplateUuid: string;
  actionTemplate: ActionTemplate;
  type: ActionDefinitionType;
  selectedUuid: string;
  editMode: boolean;
}> = ({ actionTemplateUuid, type, selectedUuid, editMode }) => {
  const dispatch = useAppDispatch();
  const actionTemplates = useAppSelector(
    (state) => state.mission.mission.actionTemplates,
    deepEqual
  );
  const actionDefinitions = useAppSelector(
    (state) => state.mission.mission.actionDefinitions[type],
    deepEqual
  );

  const selectedActionDef = actionDefinitions?.[selectedUuid];

  return (
    <>
      {!editMode ? (
        <span
          className={actionStyles.actionDefType}
          style={{ color: `var(--${type.slice(0, -1)})` }}
        >
          {selectedActionDef?.name ? selectedActionDef?.name : capitalize(type.slice(0, -1))}
        </span>
      ) : (
        <ActionDefDropdown
          actionDefinitionItems={actionDefinitions}
          type={type}
          selectedUuid={selectedUuid}
          onSelect={(uuid) => {
            const actionTemplate = actionTemplates[actionTemplateUuid];
            const newActionDefinition = {
              ...actionTemplate.actionDefinition,
              [`${type.slice(0, -1)}Uuid`]: uuid,
            };
            dispatch(
              thunkUpdateActionTemplate({
                uuid: actionTemplateUuid,
                fieldName: "actionDefinition",
                value: newActionDefinition,
              })
            );
          }}
        />
      )}
    </>
  );
};
