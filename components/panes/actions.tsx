import { FunctionComponent, useEffect, useState, CSSProperties } from "react";
import paneStyles from "./global-pane-styles.module.css";
import actionStyles from "./actions.module.css";
import { IconButton } from "components/interface/_global-elements";
import { useDispatch } from "react-redux";
import { useAppSelector, refEqual } from "utils/useAppSelector";
import { upsertAction } from "store/action";
import Action from "./actions-action";
import { starWars, uniqueNamesGenerator } from "unique-names-generator";
import { v4 as uuidv4 } from "uuid";
import "react-tooltip/dist/react-tooltip.css";
import _ from "lodash";
import { faPlusCircle, faTableList } from "@fortawesome/free-solid-svg-icons";
import ReactDragListView from "react-drag-listview";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { STM_Coverage } from "./stm-coverage";
import { displayFormattedTotalTimeObj } from "utils/component-helpers";
const profanityFilter = require("leo-profanity");

type ActionParentUuid = {
  poiUuid?: string;
  stationUuid?: string;
};

const Actions: FunctionComponent<{
  editMode: boolean;
  setEditMode: (newEditMode: boolean) => void;
  actions: Action[];
  actionColor: CSSProperties;
  actionOrderUuids: string[];
  setActionOrderUuids: (actionOrderUuids: string[]) => void;
  actionParentUuid: ActionParentUuid;
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
  const dispatch = useDispatch();
  const selectedMissionId = useAppSelector((state) => state.mission.mission?.id, refEqual);

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

  const handleCreateAction = () => {
    let randomName = "";
    while (randomName === "") {
      const name = uniqueNamesGenerator({
        dictionaries: [starWars],
        style: "capital",
      });
      const actionWithSameName = actions.find((action) => action.name === name);
      const profanityCheck = profanityFilter.check(name);
      randomName = actionWithSameName || profanityCheck ? "" : name;
    }

    const blankAction: Action = {
      ...actionParentUuid,
      missionId: selectedMissionId,
      uuid: uuidv4(),
      name: randomName,
      description: "",
      status: "Candidate",
      type: "other",
      durationLower: 5,
      durationUpper: 6,
      stmUuidRefs: null,
      inventoryItems: null,
      priorityOverride: null,
    };

    //upsert action order. new action goes on the end.
    let actionOrder: string[];
    if (actionOrderUuids && actionOrderUuids.length > 0) {
      actionOrder = _.cloneDeep(actionOrderUuids);
    } else {
      //no order defined. build a new one based on whats already there
      actionOrder = [];
      for (const action of actions) {
        actionOrder.push(action.uuid);
      }
    }
    actionOrder.push(blankAction.uuid);
    setActionOrderUuids(actionOrder);

    //upsert action
    dispatch(upsertAction(blankAction));

    setEditMode(true);
  };

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
              <div className={paneStyles.panelSectionTitle}>Actions STM Coverage</div>
              <div className={actionStyles.stmCoverage}>
                <FontAwesomeIcon icon={faTableList} size="sm" title="STM Coverage" />
                <STM_Coverage
                  actions={actions}
                  mini={true}
                  horizontal={true}
                  onInvstgHover={highlightActions}
                  uniqueKey="summaryInfo"
                />
              </div>

              <div className={paneStyles.panelSectionRow} style={{ marginTop: "8px" }}>
                <div className={paneStyles.panelSmallField}>
                  <div className={paneStyles.panelSectionTitle}># Actions</div>
                  <div className={paneStyles.panelText}>{actionsCalculatedFields?.actionCount}</div>
                </div>
                <div className={paneStyles.panelMediumField}>
                  <div className={paneStyles.panelSectionTitle}>Total Action Time</div>
                  <div className={paneStyles.panelDisplayVal}>
                    <>{displayFormattedTotalTimeObj(actionsCalculatedFields?.totalActionTime)}</>
                    &nbsp;mins
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
              <IconButton
                icon={faPlusCircle}
                label="Add Action"
                style={{ width: "100px" }}
                onClick={() => {
                  handleCreateAction();
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
