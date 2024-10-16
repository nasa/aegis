import { FunctionComponent, useEffect, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import styles from "./mission.module.css";
import { useAppSelector, deepEqual } from "utils/useAppSelector";
import { SubpanelHeading } from "components/interface/_global-elements";
import { faList, faPlusCircle, faTrashAlt } from "@fortawesome/free-solid-svg-icons";
import { Button, InLineEditInput } from "components/interface/form/globalFields";
import { validators } from "components/interface/form/formValidators";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAppDispatch } from "utils/useAppDispatch";
import _ from "lodash";
import {
  thunkCreateActionDefItem,
  thunkDeleteActionDefItem,
  thunkUpdateActionDefItem,
} from "store/thunk/thunkActionDefinitions";

const ActionDefinitions_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const actionDefinitions = useAppSelector((state) => {
    const actionDefinitions = state.mission.mission.actionDefinitions;
    const sortedVerbs = _.sortBy(actionDefinitions.verbs, [(verb) => verb.name.toLowerCase()]);
    const sortedNouns = _.sortBy(actionDefinitions.nouns, [(noun) => noun.name.toLowerCase()]);
    const sortedAdjectives = _.sortBy(actionDefinitions.adjectives, [
      (adjective) => adjective.name.toLowerCase(),
    ]);
    return { verbs: sortedVerbs, nouns: sortedNouns, adjectives: sortedAdjectives };
  }, deepEqual);
  const [newActionDefUuid, setNewActionDefUuid] = useState(undefined);

  // Unmarks newest list item as "new" after a short timeout (for autofocusing)
  useEffect(() => {
    if (newActionDefUuid !== undefined) {
      setTimeout(() => {
        setNewActionDefUuid(undefined);
      }, 300);
    }
  }, [newActionDefUuid]);

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle} aria-label="rightBodyTitle">
        Action Definitions
      </div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <ActionDefinitions
            type={"verbs"}
            actionDefinitionItems={actionDefinitions?.verbs}
            editMode={editMode}
            newActionDefUuid={newActionDefUuid}
            setNewActionDefUuid={setNewActionDefUuid}
          />
        </div>
        <div className={paneStyles.panelContainer}>
          <ActionDefinitions
            type={"nouns"}
            actionDefinitionItems={actionDefinitions?.nouns}
            editMode={editMode}
            newActionDefUuid={newActionDefUuid}
            setNewActionDefUuid={setNewActionDefUuid}
          />
        </div>
        <div className={paneStyles.panelContainer}>
          <ActionDefinitions
            type={"adjectives"}
            actionDefinitionItems={actionDefinitions?.adjectives}
            editMode={editMode}
            newActionDefUuid={newActionDefUuid}
            setNewActionDefUuid={setNewActionDefUuid}
          />
        </div>
      </div>
    </div>
  );
};

export default ActionDefinitions_Panel;

const ActionDefinitions: FunctionComponent<{
  type: ActionDefinitionType;
  actionDefinitionItems: ActionDefinitionItem[];
  editMode: boolean;
  newActionDefUuid: string;
  setNewActionDefUuid: (actionDef: string) => void;
}> = ({ type, actionDefinitionItems, editMode, newActionDefUuid, setNewActionDefUuid }) => {
  const dispatch = useAppDispatch();
  let buttonWidth = "135px";
  if (type === "nouns") {
    buttonWidth = "140px";
  } else if (type === "adjectives") {
    buttonWidth = "150px";
  }

  return (
    <div className={paneStyles.panelSection}>
      <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
        <SubpanelHeading icon={faList}>{_.capitalize(type)}</SubpanelHeading>
      </div>
      <div className={paneStyles.panelSectionBody}>
        <ul className={styles.propertyList}>
          <li className={styles.propertyListItem}>
            <div className={paneStyles.descriptionContainer}>
              <div className={styles.propertyRowHeader} style={{ backgroundColor: "var(--grey2)" }}>
                <div className={styles.propertyRowName}>Name</div>
                <div className={styles.propertyRowLongAbbr}>Abbreviation</div>
                <div className={styles.propertyRowTrashContainer}></div>
              </div>
            </div>
          </li>

          {actionDefinitionItems &&
            actionDefinitionItems.map((actionDefinitionItem, index) => (
              <li
                key={actionDefinitionItem.uuid}
                className={styles.propertyListItem}
                aria-label="actionDefs-item"
              >
                <ActionDefinitionItem
                  type={type}
                  actionDefinitionItem={actionDefinitionItem}
                  editMode={editMode}
                  evenRow={index % 2 === 0}
                  toFocus={newActionDefUuid === actionDefinitionItem.uuid}
                />
              </li>
            ))}
        </ul>

        {editMode && (
          <Button
            icon={faPlusCircle}
            label={`Add Action ${_.capitalize(type.slice(0, -1))}`}
            style={{ width: buttonWidth, marginLeft: "18px", marginTop: "8px" }}
            onClick={async () => {
              setNewActionDefUuid((await dispatch(thunkCreateActionDefItem({ type }))).payload);
            }}
            ariaLabel="addGeoUnitButton"
          />
        )}
      </div>
    </div>
  );
};

const ActionDefinitionItem: FunctionComponent<{
  type: ActionDefinitionType;
  actionDefinitionItem: ActionDefinitionItem;
  editMode: boolean;
  evenRow: boolean;
  toFocus: boolean;
}> = ({ type, actionDefinitionItem, editMode, evenRow, toFocus }) => {
  const dispatch = useAppDispatch();

  let backgroundColor: string = "var(--grey2)";
  if (!editMode) {
    backgroundColor = evenRow ? "var(--grey2)" : "var(--grey1)";
  }

  return (
    <div className={paneStyles.descriptionContainer}>
      <div className={styles.propertyRow} style={{ backgroundColor }}>
        <div className={styles.propertyRowName}>
          <InLineEditInput
            editing={editMode}
            fieldProps={{
              name: "actionDefinitionName",
              ariaLabel: `${_.capitalize(type)} name`,
              style: { width: "100%" },
              validators: [validators.maxLength(255), validators.required],
            }}
            value={actionDefinitionItem.name}
            onSubmit={(val: string) => {
              dispatch(
                thunkUpdateActionDefItem({
                  type,
                  uuid: actionDefinitionItem.uuid,
                  fieldName: "name",
                  value: val,
                })
              );
            }}
            toFocus={toFocus}
          />
        </div>
        <div className={styles.propertyRowLongAbbr}>
          <InLineEditInput
            editing={editMode}
            fieldProps={{
              name: "actionDefinitionNameAbbr",
              ariaLabel: `${_.capitalize(type)} abbreviation`,
              style: { width: "90px" },
              validators: [validators.maxLength(10), validators.required],
            }}
            value={actionDefinitionItem.abbr}
            onSubmit={(val: string) => {
              dispatch(
                thunkUpdateActionDefItem({
                  type,
                  uuid: actionDefinitionItem.uuid,
                  fieldName: "abbr",
                  value: val,
                })
              );
            }}
            key={`${actionDefinitionItem.uuid}-abbr`}
            toFocus={toFocus}
          />
        </div>

        <div className={styles.propertyRowTrashContainer}>
          <div className={styles.propertyRowTrash}>
            {editMode && (
              <FontAwesomeIcon
                icon={faTrashAlt}
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dispatch(
                    thunkDeleteActionDefItem({
                      type,
                      uuid: actionDefinitionItem.uuid,
                    })
                  );
                }}
                aria-label="deleteButton"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
