import {
  faArrowsDownToLine,
  faArrowsUpToLine,
  faCaretDown,
  faCaretRight,
  faClock,
  faGripVertical,
  faMessage,
  faPersonWalkingLuggage,
  faTableList,
  faTrashAlt,
  faWeightHanging,
} from "@fortawesome/free-solid-svg-icons";
import { faCircleDot } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { LastEdited, SubpanelHeading } from "components/interface/_global-elements";
import {
  Button,
  Checkbox,
  Dropdown,
  InLineEditInput,
} from "components/interface/form/globalFields";
import { WysiwygTextArea } from "components/interface/form/wysiwyg";
import { FunctionComponent, CSSProperties, useCallback } from "react";
import paneStyles from "./global-pane-styles.module.css";
import actionStyles from "./actions-action.module.css";
import { deleteActionByUuid, upsertAction } from "store/action";
import { longdateFromDateString, toDecimal } from "utils/formatting";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import ReactDOMServer from "react-dom/server";
import STMSelector from "./stm-selector";
import { validators, regExValidators } from "components/interface/form/formValidators";
import { RootState } from "store";
import _ from "lodash";
import { collapseActions, expandActions } from "store/interface";

const RightAction: FunctionComponent<{
  editMode: boolean;
  setEditMode: (newEditMode: boolean) => void;
  action: Action;
  highlight: boolean;
  actionColor: CSSProperties;
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

  const actionsCollapsed = useAppSelector(
    (state) => state.interface.actionsCollapsed,
    shallowEqual
  );

  const buildActionTooltip = () => {
    if (parentAction && parentPoi) {
      const dateString = longdateFromDateString(action.parentCopyDate) + "Z";
      return ReactDOMServer.renderToStaticMarkup(
        <>
          Copied from POI {parentPoi.name} - {parentAction.name}
          <br />
          on {dateString}
        </>
      );
    } else {
      return <></>;
    }
  };

  return (
    <div className={`${paneStyles.panelContainer} ${actionStyles.actionPanelContainer}`}>
      <div className={`${paneStyles.actionsHeading} ${highlight && actionStyles.highlightAction}`}>
        {editMode && (
          <a>
            <FontAwesomeIcon icon={faGripVertical} className={actionStyles.reorderIcon} size="sm" />
          </a>
        )}

        <div
          className={`${paneStyles.actionsHeadingCaret} ${
            editMode && actionStyles.actionsHeadingCaret
          } `}
          onClick={() => {
            if (actionsCollapsed.includes(action.uuid)) {
              dispatch(expandActions([action.uuid]));
            } else {
              dispatch(collapseActions([action.uuid]));
            }
          }}
        >
          {!actionsCollapsed.includes(action.uuid) ? (
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
          <div
            className={`${paneStyles.actionsHeadingTitle}`}
            style={actionColor}
            onClick={() => {
              if (actionsCollapsed.includes(action.uuid)) {
                dispatch(expandActions([action.uuid]));
              } else {
                dispatch(collapseActions([action.uuid]));
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

        <div className={paneStyles.actionsHeadingSubTitle}>
          <InLineEditInput
            value={action.name}
            editing={editMode}
            fieldProps={{
              name: "name",
              ariaLabel: "Action Title",
              style: { width: "100%" },
              validators: [validators.required, validators.maxLength(255)],
            }}
            onSubmit={(value: string) => {
              dispatch(upsertAction({ ...action, name: value }));
            }}
          />
        </div>
        {editMode ? (
          <div className={paneStyles.actionHeadingIcons}>
            <FontAwesomeIcon
              icon={faTrashAlt}
              size="sm"
              onClick={(e) => {
                if (window.confirm("Are you sure you want to delete this Action?")) {
                  dispatch(deleteActionByUuid(action.uuid));
                  setEditMode(true);
                  e.stopPropagation();
                }
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
                data-tooltip-id="aegis-tooltip"
                data-tooltip-html={buildActionTooltip()}
              />
            </div>
          )
        )}
      </div>
      {!actionsCollapsed.includes(action.uuid) && (
        <>
          <div className={paneStyles.actionIndent}>
            <div className={paneStyles.panelSection}>
              <div className={paneStyles.panelSectionTitle}>
                <SubpanelHeading icon={faMessage}>Description</SubpanelHeading>
              </div>
              <div className={paneStyles.descriptionContainer}>
                <WysiwygTextArea
                  value={action.description}
                  editing={editMode}
                  onChange={(value) => {
                    const updatedAction: Action = { ...action, description: value };
                    dispatch(upsertAction(updatedAction));
                  }} // handle innerHTML change
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
                      <div className={paneStyles.panelColumnTableCellLeft}>
                        <div className={paneStyles.inputFieldLabel}>Nominal Duration (mins):</div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.inputFieldValue}>
                          <InLineEditInput
                            value={action.durationLower?.toString()}
                            editing={editMode}
                            fieldProps={{
                              name: "durationLower",
                              ariaLabel: "Minimum Time in minutes",
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
                                upsertAction({
                                  ...action,
                                  durationLower: toDecimal(value),
                                })
                              );
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTable}>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCellLeft}>
                        <div className={paneStyles.inputFieldLabel}>Max Duration (mins):</div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.inputFieldValue}>
                          <InLineEditInput
                            value={action.durationUpper?.toString()}
                            editing={editMode}
                            fieldProps={{
                              name: "durationUpper",
                              ariaLabel: "Maximum Time in minutes",
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
                                upsertAction({
                                  ...action,
                                  durationUpper: toDecimal(value),
                                })
                              );
                            }}
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
                <EquipmentSelector action={action} editMode={editMode} />
              </div>
            </div>
            <div className={paneStyles.panelSection}>
              <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
                <SubpanelHeading icon={faWeightHanging}>Mass</SubpanelHeading>
              </div>
              <div className={paneStyles.panelSectionRow}>
                <div className={paneStyles.panelSection2Column}>
                  <div className={paneStyles.panelColumnTable}>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCellLeft}>
                        <div className={paneStyles.inputFieldLabel}>Expected Sample Mass (g):</div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.inputFieldValue}>
                          <InLineEditInput
                            value={action.mass?.toString()}
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
                                upsertAction({
                                  ...action,
                                  durationLower: toDecimal(value),
                                })
                              );
                            }}
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
                <SubpanelHeading icon={faTableList}>STM Coverage</SubpanelHeading>
              </div>
              <div className={actionStyles.selectorContainer}>
                <STMSelector
                  editMode={editMode}
                  action={action}
                  onSTMChange={(stmUuidRefs: string[]) => {
                    const updatedAction: Action = { ...action, stmUuidRefs: stmUuidRefs };
                    dispatch(upsertAction(updatedAction));
                  }}
                />
              </div>
            </div>

            <div className={paneStyles.panelSection}>
              <div className={paneStyles.panelSection2Column}>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.displayFieldLabel}>Last Edited:</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        <LastEdited updatedAt={action?.updatedAt} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const EquipmentSelector: FunctionComponent<{
  action: Action;
  editMode: boolean;
}> = ({ action, editMode }) => {
  const dispatch = useDispatch();
  const equipmentItems = useAppSelector(
    (state: RootState) => state.mission.mission.equipmentItems,
    shallowEqual
  );

  const addEquipmentItem = (equipmentItemUuid: string, quantity: number) => {
    const newEquipmentItemUsage: EquipmentItemUsage = {
      uuid: equipmentItemUuid,
      quantityUsed: quantity,
    };

    let newEquipmentItemsUsage: EquipmentItemUsage[] = [];
    if (action.equipmentItemsUsage) {
      // remove any existing equipment item usage with the same uuid
      newEquipmentItemsUsage = action.equipmentItemsUsage.filter(
        (equipmentItemUsage) => equipmentItemUsage.uuid !== equipmentItemUuid
      );

      newEquipmentItemsUsage = [...newEquipmentItemsUsage, newEquipmentItemUsage];
    } else {
      newEquipmentItemsUsage = [newEquipmentItemUsage];
    }
    dispatch(
      upsertAction({
        ...action,
        equipmentItemsUsage: newEquipmentItemsUsage,
      })
    );
  };

  const removeEquipmentItem = useCallback(
    (equipmentItemUuid: string) => {
      const newEquipmentItemsUsage = action.equipmentItemsUsage.filter(
        (equipmentItemUsage) => equipmentItemUsage.uuid !== equipmentItemUuid
      );
      dispatch(
        upsertAction({
          ...action,
          equipmentItemsUsage: newEquipmentItemsUsage,
        })
      );
    },
    [dispatch, action]
  );

  if (editMode) {
    // split equipment items into two columns
    const equipmentItemsColumn1 = equipmentItems?.slice(0, Math.ceil(equipmentItems.length / 2));
    const equipmentItemsColumn2 = equipmentItems?.slice(Math.ceil(equipmentItems.length / 2));

    return (
      <div className={actionStyles.equipmentListDoubleColumn}>
        <div className={actionStyles.equipmentListColumn}>
          {equipmentItemsColumn1 &&
            equipmentItemsColumn1.map((equipmentItem) => {
              return EquipmentCheckbox({
                action,
                editMode,
                equipmentItem,
                addEquipmentItem,
                removeEquipmentItem,
              });
            })}
        </div>
        <div className={paneStyles.equipmentListColumn}>
          {equipmentItemsColumn2 &&
            equipmentItemsColumn2.map((equipmentItem) => {
              return EquipmentCheckbox({
                action,
                editMode,
                equipmentItem,
                addEquipmentItem,
                removeEquipmentItem,
              });
            })}
        </div>
      </div>
    );
  } else {
    return (
      <div className={actionStyles.equipmentList}>
        {action.equipmentItemsUsage?.map((equipmentItemUsage) => {
          const equipmentItem = equipmentItems?.find(
            (equipmentItem) => equipmentItem.uuid === equipmentItemUsage.uuid
          );
          return (
            <div key={equipmentItem?.uuid} className={actionStyles.equipmentItemLabel}>
              {equipmentItem?.name}
              {equipmentItemUsage.quantityUsed > 1 ? `(${equipmentItemUsage.quantityUsed})` : null}
            </div>
          );
        })}
      </div>
    );
  }
};

const EquipmentCheckbox: FunctionComponent<{
  action: Action;
  editMode: boolean;
  equipmentItem: EquipmentItem;
  addEquipmentItem: (equipmentItemUuid: string, quantity: number) => void;
  removeEquipmentItem: (equipmentItemUuid: string) => void;
}> = ({ action, editMode, equipmentItem, addEquipmentItem, removeEquipmentItem }) => {
  // return true if equipmentItem.uuid is in action.equipmentItems
  let checked = false;
  if (action.equipmentItemsUsage) {
    checked = action.equipmentItemsUsage.some(
      (equipmentItemUsage) => equipmentItemUsage.uuid === equipmentItem.uuid
    );
  }

  return (
    <div key={equipmentItem.uuid} className={actionStyles.equipmentItem}>
      <Checkbox
        checked={checked}
        editable={editMode}
        onChange={(e) => {
          if (e.target.checked) {
            addEquipmentItem(equipmentItem.uuid, 1);
          } else {
            removeEquipmentItem(equipmentItem.uuid);
          }
        }}
      />
      <div className={actionStyles.equipmentItemLabel}>{equipmentItem.name}</div>
    </div>
  );
};

export default RightAction;

export const ExpandCollapseActionsButtons: FunctionComponent<{ actionList: Action[] }> = ({
  actionList,
}) => {
  const dispatch = useDispatch();

  return (
    <div className={paneStyles.rightBodyTitleIcons}>
      <Button
        icon={faArrowsDownToLine}
        onClick={() => {
          const actionUuids = actionList.map((action) => {
            return action.uuid;
          });
          dispatch(expandActions(actionUuids));
        }}
        toolTip="Expand all actions"
        style={{ width: "30px", fontSize: "0.8em", paddingLeft: "8px" }}
      />
      <Button
        icon={faArrowsUpToLine}
        onClick={() => {
          const actionUuids = actionList.map((action) => {
            return action.uuid;
          });
          dispatch(collapseActions(actionUuids));
        }}
        toolTip="Collapse all actions"
        style={{ width: "30px", fontSize: "0.8em", paddingLeft: "8px" }}
      />
    </div>
  );
};
