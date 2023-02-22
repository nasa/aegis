import { FunctionComponent, useEffect, useState } from "react";
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
const profanityFilter = require("leo-profanity");

const Actions: FunctionComponent<{
  editMode: boolean;
  setEditMode: (newEditMode: boolean) => void;
  actions: Action[];
  actionColor: React.CSSProperties;
  setActionOrderUuids: (actionOrderUuids: string[]) => void;
  actionParent: Object;
}> = ({ editMode, setEditMode, actions, actionColor, setActionOrderUuids, actionParent }) => {
  const dispatch = useDispatch();
  const selectedMissionId = useAppSelector((state) => state.mission.mission?.id, refEqual);
  const [wrappedActions, setWrappedActions] = useState<WrappedAction[]>(null); //contains all actions

  //gather all actions, wrap, then order them
  useEffect(() => {
    if (actions) {
      //wrap all the actions
      const actions_wrapped: WrappedAction[] = [];
      actions.forEach((action) => {
        actions_wrapped.push({ action: action, highlight: false });
      });
      setWrappedActions(actions_wrapped);
    }
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
      ...actionParent,
      missionId: selectedMissionId,
      uuid: uuidv4(),
      name: "A-" + randomName,
      description: "",
      status: "Candidate",
      type: "other",
      durationLower: 5,
      durationUpper: null,
      stmUuidRefs: null,
      inventoryItems: null,
      priorityOverride: null,
    };

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

  //reorder actions and save back to state
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
