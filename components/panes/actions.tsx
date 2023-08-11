import { FunctionComponent, useEffect, useState, CSSProperties } from "react";
import paneStyles from "./global-pane-styles.module.css";
import actionsStyles from "./actions.module.css";
import { Button, Dropdown } from "components/interface/form/globalFields";
import Action from "./actions-action";
import _ from "lodash";
import { faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import ReactDragListView from "react-drag-listview";
import { STM_Coverage } from "./stm-coverage";
import { displayFormattedTotalTimeObj } from "utils/component-helpers";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkCreateAction } from "store/thunk/thunkAction";
import CalculatedDwell from "./calculated-dwell";
import { shallowEqual, useAppSelector } from "utils/useAppSelector";

const Actions: FunctionComponent<{
  editMode: boolean;
  setEditMode: (newEditMode: boolean) => void;
  actions: Action[];
  actionColor: CSSProperties;
  actionOrderUuids: string[];
  setActionOrderUuids: (actionOrderUuids: string[]) => void;
  actionParentUuid: Pick<Action, "poiUuid" | "stationUuid">;
  parentType: "poi" | "station" | "eva";
  actionsCalculatedFields: ActionsCalculatedFields;
}> = ({
  editMode,
  actions,
  actionColor,
  actionOrderUuids,
  setActionOrderUuids,
  actionParentUuid,
  parentType,
  actionsCalculatedFields,
}) => {
  const dispatch = useAppDispatch();

  const actionTemplates = useAppSelector(
    (state) => state.mission.mission.actionTemplates,
    shallowEqual
  );

  const [wrappedActions, setWrappedActions] = useState<WrappedAction[]>(null); //contains all actions in order
  const [selectedTemplateUuid, setSelectedTemplateUuid] = useState<string>("");

  //gather all actions, order, and wrap them. Calculate all calculated fields
  useEffect(() => {
    if (actions) {
      //check if action ordering is defined.
      if (actionOrderUuids && actionOrderUuids.length > 0) {
        //put any unlisted actions at the end. but there shouldn't be any unlisted actions?
        actions.sort((action1: Action, action2: Action) => {
          const index1 = actionOrderUuids.indexOf(action1.uuid);
          const index2 = actionOrderUuids.indexOf(action2.uuid);
          return (index1 > -1 ? index1 : Infinity) - (index2 > -1 ? index2 : Infinity);
        });
      } else {
        //no ordering defined. default order by name
        actions.sort((action1: Action, action2: Action) => {
          const name1 = action1.name.toUpperCase(); // ignore upper and lowercase
          const name2 = action2.name.toUpperCase();
          if (name1 < name2) {
            return -1;
          } else if (name1 > name2) {
            return 1;
          } else {
            return 0;
          }
        });
        const actionOrder: string[] = [];
        //build a new action order
        for (const action of actions) {
          actionOrder.push(action.uuid);
        }
        if (actionOrder && actionOrder.length > 0) {
          setActionOrderUuids(actionOrder);
        }
      }

      //wrap all the actions
      const actions_wrapped: WrappedAction[] = [];
      actions.forEach((action) => {
        actions_wrapped.push({ action: action, highlight: false });
      });
      setWrappedActions(actions_wrapped);
    }
    // eslint-disable-next-line
  }, [actions]);

  //set state of highlight connected actions when the STM is hovered over
  function highlightActions(invstgUUID: string) {
    if (wrappedActions) {
      const wrappedActionsCopy = _.cloneDeep(wrappedActions);
      for (const wrappedAction of wrappedActionsCopy) {
        const stmUuidRefs = wrappedAction.action.stmUuidRefs;
        if (stmUuidRefs) {
          for (const stmUuid of stmUuidRefs) {
            if (!invstgUUID) {
              wrappedAction.highlight = false;
            } else if (stmUuid === invstgUUID) {
              wrappedAction.highlight = true;
            }
          }
        }
      }
      setWrappedActions(wrappedActionsCopy);
    }
  }

  //reorder actions and save back to state.
  function reorder(fromIndex: number, toIndex: number) {
    if (wrappedActions) {
      const actionOrder: string[] = [];
      for (const wrappedAction of wrappedActions) {
        actionOrder.push(wrappedAction.action.uuid);
      }
      const actionBeingMoved = actionOrder.splice(fromIndex, 1)[0]; //remove action uuid
      actionOrder.splice(toIndex, 0, actionBeingMoved); //reinsert in new position

      //save new action ordering
      setActionOrderUuids(actionOrder);
    }
  }

  return (
    <>
      {actions && (
        <>
          <div className={paneStyles.panelContainer}>
            <div className={paneStyles.panelSection}>
              <div className={actionsStyles.stmCoverage}>
                <STM_Coverage
                  stmUuidRefs={actions.map((a) => a.stmUuidRefs)}
                  mini={true}
                  horizontal={true}
                  onInvstgHover={highlightActions}
                />
              </div>
              <div className={paneStyles.panelSectionRow} style={{ marginTop: "8px" }}>
                <div className={paneStyles.panelSection2Column}>
                  <div className={paneStyles.panelColumnTable}>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCellLeft}>
                        <div className={paneStyles.displayFieldLabel}>Number of Actions:</div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldValue}>
                          {actionsCalculatedFields?.actionCount}
                        </div>
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCellLeft}>
                        <div
                          className={paneStyles.displayFieldLabel}
                          data-tooltip-id="aegis-tooltip"
                          data-tooltip-html="Sum of all action durations, nominal to max"
                        >
                          Total Action Time (mins):
                        </div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldValue}>
                          {actionsCalculatedFields?.totalTime.durationLower === 0 ? (
                            <>0</>
                          ) : (
                            <>{displayFormattedTotalTimeObj(actionsCalculatedFields?.totalTime)}</>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTable}>
                    {parentType !== "poi" && (
                      <>
                        <CalculatedDwell actionsCalculatedFields={actionsCalculatedFields} />
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={actionsStyles.actionListContainer}>
            <div className={actionsStyles.dragableActionList}>
              {!editMode && actions.length > 0 ? (
                <div className={actionsStyles.actionListHeader}>
                  <div className={actionsStyles.actionListHeaderType}>
                    <div className={actionsStyles.actionListHeaderLabel}>Type</div>
                  </div>
                  <div className={actionsStyles.actionListHeaderTitle}>
                    <div className={actionsStyles.actionListHeaderLabel}>Title</div>
                  </div>
                  <div className={actionsStyles.actionListHeaderPriority}>
                    <div className={actionsStyles.actionListHeaderLabel}>Pri</div>
                  </div>
                  <div className={actionsStyles.actionListHeaderTime}>
                    <div className={actionsStyles.actionListHeaderLabel}>Max</div>
                  </div>
                  {parentType !== "poi" && (
                    <div className={actionsStyles.actionListHeaderCrew}>
                      <div className={actionsStyles.actionListHeaderLabel}>Crew</div>
                    </div>
                  )}
                </div>
              ) : null}

              <ReactDragListView onDragEnd={reorder} nodeSelector="li" handleSelector="a">
                <ul className={actionsStyles.actionlist}>
                  {wrappedActions?.map((wrappedAction, index) => (
                    <li key={wrappedAction.action.uuid} className={actionsStyles.actionlistitem}>
                      <div
                        className={actionsStyles.actionlistitemOrdinal}
                        style={editMode ? { marginTop: "9px" } : undefined}
                      >
                        {index + 1}
                      </div>
                      <Action
                        editMode={editMode}
                        action={wrappedAction.action}
                        highlight={wrappedAction.highlight}
                        actionColor={actionColor}
                        parentType={parentType}
                      />
                    </li>
                  ))}
                </ul>
              </ReactDragListView>
            </div>
          </div>

          <div className={actionsStyles.rightBodyItem} style={{ marginTop: "8px" }}>
            {editMode && (
              <div className={actionsStyles.addActionRow}>
                <Button
                  icon={faPlusCircle}
                  label="Add Action"
                  style={{ width: "100px" }}
                  onClick={() => {
                    const actionTemplate = selectedTemplateUuid
                      ? actionTemplates.find((t) => t.uuid === selectedTemplateUuid)
                      : null;
                    dispatch(
                      thunkCreateAction({
                        actionParentUuid,
                        actionOrderUuids,
                        setActionOrderUuids,
                        actions,
                        actionTemplate,
                      })
                    );
                  }}
                />
                <Dropdown
                  selected={selectedTemplateUuid}
                  onChange={(val) => {
                    setSelectedTemplateUuid(val);
                  }}
                  selectStyle={{ height: "2em", fontSize: "0.8em" }}
                  containerStyle={{ maxWidth: "200px" }}
                >
                  {actionTemplates?.map((template) => {
                    return (
                      <option key={template.uuid} value={template.uuid}>
                        {_.capitalize(template.type)}: {template.templateName}
                      </option>
                    );
                  })}
                  <option value="">{`<Template>`}</option>
                </Dropdown>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
};

export default Actions;
