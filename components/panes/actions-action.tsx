import {
  faArrowsDownToLine,
  faArrowsUpToLine,
  faAtlas,
  faCaretDown,
  faCaretRight,
  faClock,
  faGripVertical,
  faMessage,
  faPersonWalkingLuggage,
  faTableList,
  faTrashAlt,
  faUser,
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
import { FunctionComponent, CSSProperties, useCallback, useState, useEffect } from "react";
import paneStyles from "./global-pane-styles.module.css";
import actionStyles from "./actions-action.module.css";
import { deleteActionByUuid, upsertAction } from "store/action";
import { useAppDispatch } from "utils/useAppDispatch";
import { hhmmFromMinutes, longdateFromDateString, toDecimal } from "utils/formatting";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
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
  parentType: "station" | "poi" | "eva";
}> = ({ editMode, setEditMode, action, highlight, actionColor, parentType }) => {
  const dispatch = useAppDispatch();
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

  const ev1ButtonStyle = action.crewAssigned?.includes("EV1")
    ? { width: "50px", color: "#000", backgroundColor: "#fff" }
    : { width: "50px" };
  const ev2ButtonStyle = action.crewAssigned?.includes("EV2")
    ? { width: "50px", color: "#000", backgroundColor: "#fff" }
    : { width: "50px" };

  const crewLeftStyle = action.crewAssigned?.includes("EV1")
    ? paneStyles.actionHeadingCrewSelected
    : undefined;

  const crewRightStyle = action.crewAssigned?.includes("EV2")
    ? paneStyles.actionHeadingCrewSelected
    : undefined;

  return (
    <div className={`${paneStyles.panelContainer} ${actionStyles.actionPanelContainer}`}>
      <div className={`${paneStyles.actionsHeading} ${highlight && actionStyles.highlightAction}`}>
        {editMode && (
          <a style={{ marginTop: "3px" }}>
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
            <FontAwesomeIcon
              icon={faCaretDown}
              size="sm"
              className={paneStyles.actionsHeadingCaretDown}
              style={editMode && { marginTop: "5px" }}
            />
          ) : (
            <FontAwesomeIcon
              icon={faCaretRight}
              size="sm"
              className={paneStyles.actionsHeadingCaretRight}
              style={editMode && { marginTop: "5px" }}
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
        <div className={paneStyles.actionHeadingRight}>
          {parentType !== "poi" && (
            <>
              <div
                className={paneStyles.actionHeadingRightItem}
                style={{ marginTop: "3px" }}
                data-tooltip-id="aegis-tooltip"
                data-tooltip-html={"Max Duration (mins)"}
              >
                {hhmmFromMinutes(action.durationUpper).slice(1)}
              </div>
              <div className={paneStyles.actionHeadingRightItem}>
                <div className={paneStyles.actionHeadingCrew}>
                  <div
                    className={`${paneStyles.actionHeadingCrewLeft} ${crewLeftStyle}`}
                    onClick={() => {
                      if (editMode) toggleCrewAssigned("EV1");
                    }}
                  >
                    1
                  </div>

                  <div
                    className={`${paneStyles.actionHeadingCrewRight} ${crewRightStyle}`}
                    onClick={() => {
                      if (editMode) toggleCrewAssigned("EV2");
                    }}
                  >
                    2
                  </div>
                </div>
              </div>
            </>
          )}

          {editMode && (
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
              style={{ marginTop: "3px" }}
            />
          )}
        </div>
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
                                validators.maxLength(4),
                                validators.mustBeInteger,
                                validators.required,
                                validators.mustBeNumberGTZero,
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
                                validators.maxLength(4),
                                validators.mustBeInteger,
                                validators.required,
                                validators.mustBeNumberGTZero,
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
            {parentType !== "poi" && (
              <>
                <div className={paneStyles.panelSection}>
                  <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
                    <SubpanelHeading icon={faUser}>Crew Assignment</SubpanelHeading>
                  </div>
                  <div className={paneStyles.panelSectionRow}>
                    <div className={paneStyles.crewSelectorContainer}>
                      {editMode ? (
                        <>
                          <Button
                            onClick={() => {
                              toggleCrewAssigned("EV1");
                            }}
                            label="EV1"
                            icon={null}
                            style={ev1ButtonStyle}
                            toolTip="Assign to EV1"
                          />
                          <Button
                            onClick={() => {
                              toggleCrewAssigned("EV2");
                            }}
                            label="EV2"
                            icon={null}
                            style={ev2ButtonStyle}
                            toolTip="Assign to EV2"
                          />
                        </>
                      ) : (
                        <div className={paneStyles.inputFieldValue}>
                          {action.crewAssigned
                            ? action.crewAssigned.map((crew) => `${crew} `)
                            : "None"}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
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
                <SubpanelHeading icon={faAtlas}>Associated Geographic Units</SubpanelHeading>
              </div>
              <div className={paneStyles.panelSectionRow}>
                <GeographicUnitSelector action={action} editMode={editMode} />
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
                                  mass: toDecimal(value),
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
              <div className={paneStyles.displayFieldLabel}>Last Edited:</div>
            </div>
            <div className={paneStyles.lastEditedContainer}>
              <div className={paneStyles.displayFieldValue}>
                <LastEdited updatedAt={action?.updatedAt} />
              </div>
              {action.parentActionUuid && (
                <div style={{ flex: "0 0 20px" }}>
                  <FontAwesomeIcon
                    id={`${action.uuid}-${action.parentActionUuid}`}
                    icon={faCircleDot}
                    size="sm"
                    className={actionStyles.iconFaded}
                    data-tooltip-id="aegis-tooltip"
                    data-tooltip-html={buildActionTooltip()}
                  />
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default RightAction;

const EquipmentSelector: FunctionComponent<{
  action: Action;
  editMode: boolean;
}> = ({ action, editMode }) => {
  const dispatch = useAppDispatch();
  const equipmentItems = useAppSelector(
    (state: RootState) => state.mission.mission.equipmentItems,
    shallowEqual
  );

  type EquipmentItemDisplay = {
    name: string;
    quantityUsed: number;
  };

  const [equipmentItemDisplayList, setEquipmentItemDisplayList] = useState<EquipmentItemDisplay[]>(
    []
  );

  // create sorted list of equipment item display objects. Used to show the list when not in edit mode
  useEffect(() => {
    const newEquipmentItemDisplayList = action.equipmentItemsUsage?.map((equipmentItemUsage) => {
      const equipmentItem = equipmentItems?.find(
        (equipmentItem) => equipmentItem.uuid === equipmentItemUsage.uuid
      );
      return {
        name: equipmentItem.name,
        quantityUsed: equipmentItemUsage.quantityUsed,
      } as EquipmentItemDisplay;
    });

    // sort by name
    newEquipmentItemDisplayList?.sort((a, b) => {
      return a.name.localeCompare(b.name);
    });

    setEquipmentItemDisplayList(newEquipmentItemDisplayList);
  }, [action.equipmentItemsUsage, equipmentItems]);

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
      <div className={actionStyles.propertyListDoubleColumn}>
        <div className={actionStyles.propertyListColumn}>
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
        <div className={paneStyles.propertyListColumn}>
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
      <div className={actionStyles.propertyList}>
        {equipmentItemDisplayList?.map((equipmentItemDisplay, index) => {
          return (
            <div
              key={`${equipmentItemDisplay.name}${index}`}
              className={actionStyles.propertyItemLabel}
            >
              {equipmentItemDisplay.name}
              {equipmentItemDisplay.quantityUsed > 1
                ? `(${equipmentItemDisplay.quantityUsed})`
                : null}
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
    <div key={equipmentItem.uuid} className={actionStyles.propertyItem}>
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
      <div className={actionStyles.propertyItemLabel}>{equipmentItem.name}</div>
    </div>
  );
};

const GeographicUnitSelector: FunctionComponent<{
  action: Action;
  editMode: boolean;
}> = ({ action, editMode }) => {
  const dispatch = useAppDispatch();

  const geographicUnits = useAppSelector(
    (state: RootState) => state.mission.mission.geographicUnits,
    refEqual
  );

  const [geographicUnitDisplayList, setGeographicUnitDisplayList] = useState<string[]>([]);

  // create sorted list of geographic units. Used to show the list when not in edit mode
  useEffect(() => {
    const newGeographicUnitDisplayList = action.geographicUnitsUsage?.map((geographicUnitUuid) => {
      const geographicUnit = geographicUnits?.find(
        (geographicUnit) => geographicUnit.uuid === geographicUnitUuid
      );
      return geographicUnit?.name;
    });

    // sort by name
    newGeographicUnitDisplayList?.sort((a, b) => {
      return a.localeCompare(b);
    });

    setGeographicUnitDisplayList(newGeographicUnitDisplayList);
  }, [action.geographicUnitsUsage, geographicUnits]);

  const addGeographicUnit = (geographicUnitUuid: string) => {
    let newGeographicUnitsUsage: string[] = [];
    if (action.geographicUnitsUsage) {
      // remove any existing geographic unit with the same uuid
      newGeographicUnitsUsage = action.geographicUnitsUsage.filter(
        (uuid) => uuid !== geographicUnitUuid
      );

      newGeographicUnitsUsage = [...newGeographicUnitsUsage, geographicUnitUuid];
    } else {
      newGeographicUnitsUsage = [geographicUnitUuid];
    }
    dispatch(
      upsertAction({
        ...action,
        geographicUnitsUsage: newGeographicUnitsUsage,
      })
    );
  };

  const removenewGeographicUnit = useCallback(
    (geographicUnitUuid: string) => {
      const newGeographicUnitsUsage = action.geographicUnitsUsage.filter(
        (geographicUnitUsage) => geographicUnitUsage !== geographicUnitUuid
      );
      dispatch(
        upsertAction({
          ...action,
          geographicUnitsUsage: newGeographicUnitsUsage,
        })
      );
    },
    [dispatch, action]
  );

  if (editMode) {
    // split equipment items into two columns
    const geographicUnitsColumn1 = geographicUnits?.slice(0, Math.ceil(geographicUnits.length / 2));
    const geographicUnitsColumn2 = geographicUnits?.slice(Math.ceil(geographicUnits.length / 2));

    return (
      <div className={actionStyles.propertyListDoubleColumn}>
        <div className={actionStyles.propertyListColumn}>
          {geographicUnitsColumn1 &&
            geographicUnitsColumn1.map((geographicUnit) => {
              return GeographicUnitCheckbox({
                action,
                editMode,
                geographicUnit,
                addgeographicUnit: addGeographicUnit,
                removegeographicUnit: removenewGeographicUnit,
              });
            })}
        </div>
        <div className={paneStyles.propertyListColumn}>
          {geographicUnitsColumn2 &&
            geographicUnitsColumn2.map((geographicUnit) => {
              return GeographicUnitCheckbox({
                action,
                editMode,
                geographicUnit,
                addgeographicUnit: addGeographicUnit,
                removegeographicUnit: removenewGeographicUnit,
              });
            })}
        </div>
      </div>
    );
  } else {
    return (
      <div className={actionStyles.propertyList}>
        {geographicUnitDisplayList?.map((geographicUnitDisplay, index) => {
          return (
            <div
              key={`${geographicUnitDisplay}${index}`}
              className={actionStyles.propertyItemLabel}
            >
              {geographicUnitDisplay}
            </div>
          );
        })}
      </div>
    );
  }
};

const GeographicUnitCheckbox: FunctionComponent<{
  action: Action;
  editMode: boolean;
  geographicUnit: GeographicUnit;
  addgeographicUnit: (geographicUnitUuid: string, quantity: number) => void;
  removegeographicUnit: (geographicUnitUuid: string) => void;
}> = ({ action, editMode, geographicUnit, addgeographicUnit, removegeographicUnit }) => {
  // return true if geographicUnit.uuid is in action.geographicUnits
  let checked = false;
  if (action.geographicUnitsUsage) {
    checked = action.geographicUnitsUsage.some(
      (geographicUnitUsage) => geographicUnitUsage === geographicUnit.uuid
    );
  }

  return (
    <div key={geographicUnit.uuid} className={actionStyles.propertyItem}>
      <Checkbox
        checked={checked}
        editable={editMode}
        onChange={(e) => {
          if (e.target.checked) {
            addgeographicUnit(geographicUnit.uuid, 1);
          } else {
            removegeographicUnit(geographicUnit.uuid);
          }
        }}
      />
      <div className={actionStyles.propertyItemLabel}>{geographicUnit.name}</div>
    </div>
  );
};

export const ExpandCollapseActionsButtons: FunctionComponent<{ actionList: Action[] }> = ({
  actionList,
}) => {
  const dispatch = useAppDispatch();

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
