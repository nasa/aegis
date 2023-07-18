import { FunctionComponent, useEffect, useState, CSSProperties } from "react";
import paneStyles from "./global-pane-styles.module.css";
import actionStyles from "./actions.module.css";
import { SubpanelHeading } from "components/interface/_global-elements";
import { Button } from "components/interface/form/globalFields";
import Action from "./actions-action";
import _ from "lodash";
import { faPlusCircle, faTableList } from "@fortawesome/free-solid-svg-icons";
import ReactDragListView from "react-drag-listview";
import { STM_Coverage } from "./stm-coverage";
import { displayFormattedTotalTimeObj } from "utils/component-helpers";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkCreateAction } from "store/thunk/thunkAction";

const Actions: FunctionComponent<{
  editMode: boolean;
  setEditMode: (newEditMode: boolean) => void;
  actions: Action[];
  actionColor: CSSProperties;
  actionOrderUuids: string[];
  setActionOrderUuids: (actionOrderUuids: string[]) => void;
  actionParentUuid: Pick<Action, "poiUuid" | "stationUuid">;
  actionsCalculatedFields: ActionsCalculatedFields;
}> = ({
  editMode,
  setEditMode,
  actions,
  actionColor,
  actionOrderUuids,
  setActionOrderUuids,
  actionParentUuid,
  actionsCalculatedFields,
}) => {
  const dispatch = useAppDispatch();

  const [wrappedActions, setWrappedActions] = useState<WrappedAction[]>(null); //contains all actions in order

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
              <div className={paneStyles.panelSectionTitle}>
                <SubpanelHeading icon={faTableList}>Total STM Coverage</SubpanelHeading>
              </div>
              <div className={actionStyles.stmCoverage}>
                <STM_Coverage
                  actions={actions}
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
                  </div>
                  <div className={paneStyles.panelColumnTable}>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCellLeft}>
                        <div className={paneStyles.displayFieldLabel}>
                          Total Action Time (mins):
                        </div>
                      </div>
                      <div className={paneStyles.displayFieldValue}>
                        {actionsCalculatedFields?.totalActionTime?.durationLower === 0 &&
                        actionsCalculatedFields?.totalActionTime?.durationUpper === 0 ? (
                          <>N/A</>
                        ) : (
                          <>
                            {displayFormattedTotalTimeObj(actionsCalculatedFields?.totalActionTime)}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <ReactDragListView onDragEnd={reorder} nodeSelector="li" handleSelector="a">
            <ul className={actionStyles.actionlist}>
              {wrappedActions?.map((wrappedAction) => (
                <li key={wrappedAction.action.uuid} className={actionStyles.actionlistitem}>
                  <Action
                    editMode={editMode}
                    setEditMode={setEditMode}
                    action={wrappedAction.action}
                    highlight={wrappedAction.highlight}
                    actionColor={actionColor}
                  />
                </li>
              ))}
            </ul>
          </ReactDragListView>
          <div className={actionStyles.rightBodyItem}>
            {editMode && (
              <Button
                icon={faPlusCircle}
                label="Add Action"
                style={{ width: "100px" }}
                onClick={() => {
                  dispatch(
                    thunkCreateAction({
                      actionParentUuid,
                      actionOrderUuids,
                      setActionOrderUuids,
                      setEditMode,
                      actions,
                    })
                  );
                }}
              />
            )}
          </div>
        </>
      )}
    </>
  );
};

export default Actions;
