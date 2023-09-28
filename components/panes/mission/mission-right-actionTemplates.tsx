import { FunctionComponent, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import missionStyles from "./mission.module.css";
import actionStyles from "../actions.module.css";
import actionActionStyles from "../actions-action.module.css";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import { LastEdited, SubpanelHeading } from "components/interface/_global-elements";
import {
  faAtlas,
  faCaretDown,
  faCaretRight,
  faClock,
  faDigging,
  faFont,
  faIcons,
  faListOl,
  faMessage,
  faPersonWalkingLuggage,
  faPlusCircle,
  faTableList,
  faTrashAlt,
  faWeightHanging,
} from "@fortawesome/free-solid-svg-icons";
import { Button, Dropdown, InLineEditInput } from "components/interface/form/globalFields";
import { useAppDispatch } from "utils/useAppDispatch";
import {
  EquipmentSelector,
  ExpandCollapseActionsButtons,
  GeographicUnitSelector,
} from "../actions-action-body-multiselectors";
import {
  thunkCreateActionTemplate,
  thunkDeleteActionTemplate,
  thunkUpdateActionTemplate,
} from "store/thunk/thunkMission";
import { collapseActions, expandActions } from "store/interface";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { validators, regExValidators } from "components/interface/form/formValidators";
import { WysiwygTextArea } from "components/interface/form/wysiwyg";
import { decodeEmoji, toDecimal } from "utils/formatting";
import Picker from "@emoji-mart/react";
import emojiPickerData from "@emoji-mart/data";
import STMSelector from "../stm/stm-selector";

const ActionTemplates_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const mission = useAppSelector((state) => state.mission.mission, shallowEqual);
  const actionsExpanded = useAppSelector((state) => state.interface.actionsExpanded, shallowEqual);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitleContainer}>
        <div className={paneStyles.rightBodyTitle}>Action Templates</div>
        <ExpandCollapseActionsButtons
          actionUuids={mission?.actionTemplates?.map((action) => action.uuid)}
        />
      </div>
      <div className={paneStyles.rightBodyBody}>
        <div
          className={`${actionStyles.actionListContainer} ${missionStyles.templateActionListContainer}`}
        >
          <ul className={actionStyles.actionlist}>
            {mission?.actionTemplates?.map((actionTemplate) => (
              <li key={actionTemplate.uuid} className={actionStyles.actionlistitem}>
                <div
                  className={`${paneStyles.panelContainer} ${actionActionStyles.actionPanelContainer}  ${actionStyles.actionlistitemAction}`}
                  style={{ marginLeft: "6px" }}
                >
                  <div className={actionActionStyles.actionHeading}>
                    <div
                      className={actionActionStyles.actionHeadingCaret}
                      onClick={() => {
                        if (actionsExpanded.includes(actionTemplate.uuid)) {
                          dispatch(collapseActions([actionTemplate.uuid]));
                        } else {
                          dispatch(expandActions([actionTemplate.uuid]));
                        }
                      }}
                      style={{ marginTop: "2px" }}
                    >
                      {actionsExpanded.includes(actionTemplate.uuid) ? (
                        <FontAwesomeIcon
                          icon={faCaretDown}
                          size="sm"
                          className={actionActionStyles.actionHeadingCaretDown}
                          style={editMode && { marginTop: "5px" }}
                        />
                      ) : (
                        <FontAwesomeIcon
                          icon={faCaretRight}
                          size="sm"
                          className={actionActionStyles.actionHeadingCaretRight}
                          style={editMode && { marginTop: "5px" }}
                        />
                      )}
                    </div>
                    {!editMode ? (
                      <div
                        className={actionActionStyles.actionHeadingTitle}
                        style={{ color: "white", width: "100%", fontSize: "0.85rem" }}
                        onClick={() => {
                          if (actionsExpanded.includes(actionTemplate.uuid)) {
                            dispatch(collapseActions([actionTemplate.uuid]));
                          } else {
                            dispatch(expandActions([actionTemplate.uuid]));
                          }
                        }}
                      >
                        <div className={actionActionStyles.verticalCenter}>
                          <div className={actionActionStyles.actionsHeadingTitleIcon}>
                            {decodeEmoji(actionTemplate.icon ? actionTemplate.icon : "2754")}
                          </div>
                        </div>
                        <div className={actionActionStyles.verticalCenter}>
                          <div style={{ marginLeft: "5px" }}>
                            <span style={{ textTransform: "capitalize" }}>
                              {actionTemplate.type}
                            </span>{" "}
                            : {actionTemplate.templateName}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className={actionActionStyles.verticalCenter}>
                          <div className={actionActionStyles.actionsHeadingTitleIcon}>
                            {decodeEmoji(actionTemplate.icon ? actionTemplate.icon : "2754")}
                          </div>
                        </div>
                        <div className={actionActionStyles.verticalCenter}>
                          <div
                            className={missionStyles.templateActionTitle}
                            style={{ textTransform: "capitalize", marginLeft: "2px" }}
                          >
                            {actionTemplate.type}:&nbsp;
                          </div>
                        </div>
                        <div className={actionActionStyles.verticalCenter}>
                          <InLineEditInput
                            value={actionTemplate.templateName}
                            editing={editMode}
                            fieldProps={{
                              name: "type",
                              ariaLabel: "Template Name",
                              style: { width: "100%" },
                              validators: [validators.maxLength(255)],
                            }}
                            onSubmit={(value: string) => {
                              dispatch(
                                thunkUpdateActionTemplate({
                                  uuid: actionTemplate.uuid,
                                  fieldName: "templateName",
                                  value: value,
                                })
                              );
                            }}
                            key={`${actionTemplate.uuid}-templateName`}
                          />
                        </div>
                      </>
                    )}
                    <div className={actionActionStyles.actionsHeadingTitle}></div>
                    <div className={actionActionStyles.actionHeadingRight}>
                      {editMode && (
                        <FontAwesomeIcon
                          icon={faTrashAlt}
                          size="sm"
                          onClick={(e) => {
                            if (window.confirm("Are you sure you want to delete this Template?")) {
                              dispatch(
                                thunkDeleteActionTemplate({
                                  actionTemplateUuid: actionTemplate.uuid,
                                })
                              );
                              e.stopPropagation();
                            }
                          }}
                          style={{ marginTop: "3px" }}
                        />
                      )}
                    </div>
                  </div>
                  {actionsExpanded.includes(actionTemplate.uuid) && (
                    <>
                      <div className={actionActionStyles.actionIndent}>
                        <div className={paneStyles.panelSection}>
                          <div className={paneStyles.panelSectionTitle}>
                            <SubpanelHeading icon={faDigging}>Action Type</SubpanelHeading>
                          </div>
                          <div className={paneStyles.panelSectionRow}>
                            <div className={paneStyles.panelSection2Column}>
                              <div className={paneStyles.panelColumnTable}>
                                <div className={paneStyles.panelColumnTableRow}>
                                  <div className={paneStyles.panelColumnTableCell}>
                                    {!editMode ? (
                                      <div className={missionStyles.templateActionType}>
                                        {actionTemplate.type}
                                      </div>
                                    ) : (
                                      <div className={missionStyles.templateActionTypeDropdown}>
                                        <Dropdown
                                          selected={actionTemplate.type}
                                          onChange={(val) => {
                                            dispatch(
                                              thunkUpdateActionTemplate({
                                                uuid: actionTemplate.uuid,
                                                fieldName: "type",
                                                value: val as ActionType,
                                              })
                                            );
                                          }}
                                          toolTip="Action Type"
                                        >
                                          <option value="measurement">Measurement</option>
                                          <option value="observation">Observation</option>
                                          <option value="sample">Sample</option>
                                          <option value="photo">Photo</option>
                                          <option value="other">Other</option>
                                        </Dropdown>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className={paneStyles.panelSection}>
                          <div className={paneStyles.panelSectionTitle}>
                            <SubpanelHeading icon={faFont}>Title</SubpanelHeading>
                          </div>
                          <div className={paneStyles.panelSectionRow}>
                            <div className={paneStyles.panelSection2Column}>
                              <div className={paneStyles.panelColumnTable}>
                                <div className={paneStyles.panelColumnTableRow}>
                                  <div className={paneStyles.panelColumnTableCell}>
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
                                              uuid: actionTemplate.uuid,
                                              fieldName: "name",
                                              value: value,
                                            })
                                          );
                                        }}
                                        key={`${actionTemplate.uuid}-name`}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className={paneStyles.panelSection}>
                          <div className={paneStyles.panelSectionTitle}>
                            <SubpanelHeading icon={faMessage}>Description</SubpanelHeading>
                          </div>
                          <div className={paneStyles.descriptionContainer}>
                            <WysiwygTextArea
                              key={actionTemplate.uuid}
                              value={actionTemplate.description}
                              editing={editMode}
                              onChange={(value) => {
                                dispatch(
                                  thunkUpdateActionTemplate({
                                    uuid: actionTemplate.uuid,
                                    fieldName: "description",
                                    value: value,
                                  })
                                );
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
                                  <div className={paneStyles.panelColumnTableCellLeft}>
                                    <div className={paneStyles.inputFieldLabel}>
                                      Nominal Duration (mins):
                                    </div>
                                  </div>
                                  <div className={paneStyles.panelColumnTableCell}>
                                    <div className={paneStyles.inputFieldValue}>
                                      <InLineEditInput
                                        value={actionTemplate.durationLower?.toString()}
                                        editing={editMode}
                                        fieldProps={{
                                          name: "durationLower",
                                          ariaLabel: "Minimum Time in minutes",
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
                                              uuid: actionTemplate.uuid,
                                              fieldName: "durationLower",
                                              value: toDecimal(value),
                                            })
                                          );
                                        }}
                                        key={`${actionTemplate.uuid}-durationLower`}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className={paneStyles.panelColumnTable}>
                                <div className={paneStyles.panelColumnTableRow}>
                                  <div className={paneStyles.panelColumnTableCellLeft}>
                                    <div className={paneStyles.inputFieldLabel}>
                                      Max Duration (mins):
                                    </div>
                                  </div>
                                  <div className={paneStyles.panelColumnTableCell}>
                                    <div className={paneStyles.inputFieldValue}>
                                      <InLineEditInput
                                        value={actionTemplate.durationUpper?.toString()}
                                        editing={editMode}
                                        fieldProps={{
                                          name: "durationUpper",
                                          ariaLabel: "Maximum Time in minutes",
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
                                              uuid: actionTemplate.uuid,
                                              fieldName: "durationUpper",
                                              value: toDecimal(value),
                                            })
                                          );
                                        }}
                                        key={`${actionTemplate.uuid}-durationUpper`}
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
                            <SubpanelHeading icon={faListOl}>Priority</SubpanelHeading>
                          </div>
                          <div className={paneStyles.panelSectionRow}>
                            <div className={paneStyles.panelSection2Column}>
                              <div className={paneStyles.panelColumnTable}>
                                <div className={paneStyles.panelColumnTableRow}>
                                  <div className={paneStyles.panelColumnTableCellLeft}>
                                    <div className={paneStyles.inputFieldLabel}>
                                      Priority (1-99):
                                    </div>
                                  </div>
                                  <div className={paneStyles.panelColumnTableCell}>
                                    <div className={paneStyles.inputFieldValue}>
                                      <InLineEditInput
                                        value={actionTemplate.priority?.toString()}
                                        editing={editMode}
                                        fieldProps={{
                                          name: "priority",
                                          ariaLabel: "Priority",
                                          style: { width: "45px" },
                                          validators: [
                                            validators.maxLength(2),
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
                                              uuid: actionTemplate.uuid,
                                              fieldName: "priority",
                                              value: toDecimal(value),
                                            })
                                          );
                                        }}
                                        key={`${actionTemplate.uuid}-priority`}
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
                                  <div className={paneStyles.panelColumnTableCellLeft}>
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
                                              uuid: actionTemplate.uuid,
                                              fieldName: "mass",
                                              value: toDecimal(value),
                                            })
                                          );
                                        }}
                                        key={`${actionTemplate.uuid}-mass`}
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
                                    uuid: actionTemplate.uuid,
                                    fieldName: "equipmentItemsUsage",
                                    value: e,
                                  })
                                );
                              }}
                              uniqueId={actionTemplate.uuid}
                            />{" "}
                          </div>
                        </div>
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
                                    uuid: actionTemplate.uuid,
                                    fieldName: "geographicUnitsUsage",
                                    value: e,
                                  })
                                );
                              }}
                              uniqueId={actionTemplate.uuid}
                            />{" "}
                          </div>
                        </div>

                        <div className={paneStyles.panelSection}>
                          <div
                            className={paneStyles.panelSectionTitle}
                            style={{ marginBottom: "8px" }}
                          >
                            <SubpanelHeading icon={faTableList}>STM Coverage</SubpanelHeading>
                          </div>
                          <div className={actionActionStyles.selectorContainer}>
                            <STMSelector
                              editMode={editMode}
                              stmUuidRefs={actionTemplate.stmUuidRefs}
                              onSTMChange={(stmUuidRefs: string[]) => {
                                dispatch(
                                  thunkUpdateActionTemplate({
                                    uuid: actionTemplate.uuid,
                                    fieldName: "stmUuidRefs",
                                    value: stmUuidRefs,
                                  })
                                );
                              }}
                            />
                          </div>
                        </div>

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
                              <>{decodeEmoji(actionTemplate.icon ? actionTemplate.icon : "2754")}</>
                            </div>
                            {editMode && (
                              <>
                                <div className={actionActionStyles.iconDisplayButton}>
                                  <Button
                                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                    label={!showEmojiPicker ? "Pick Icon" : "Close"}
                                    style={{ width: "75px" }}
                                  />
                                </div>
                                <div className={actionActionStyles.iconPickerContainer}>
                                  {showEmojiPicker && (
                                    <div className={actionActionStyles.iconPicker}>
                                      <Picker
                                        data={emojiPickerData}
                                        emojiButtonSize={30}
                                        emojiSize={20}
                                        perLine={10}
                                        darkMode={true}
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        onEmojiSelect={(e: any) => {
                                          dispatch(
                                            thunkUpdateActionTemplate({
                                              uuid: actionTemplate.uuid,
                                              fieldName: "icon",
                                              value: e.unified,
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

        <div className={actionStyles.rightBodyItem} style={{ marginTop: "8px" }}>
          {editMode && (
            <Button
              icon={faPlusCircle}
              label="Add Template"
              style={{ width: "120px" }}
              onClick={() => {
                dispatch(thunkCreateActionTemplate());
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ActionTemplates_Panel;
