import type { FunctionComponent } from "react";
import { memo, useRef } from "react";
import paneStyles from "../global-pane-styles.module.css";
import missionStyles from "./mission.module.css";
import { deepEqual } from "utils/useAppSelector";
import { SubpanelHeading } from "components/interface/_global-elements";
import { faList, faPlusCircle, faTrashAlt } from "@fortawesome/free-solid-svg-icons";
import { Button } from "components/interface/form/globalFields";
import { ValidatedInputField } from "components/interface/form/globalFieldsAutomerge";
import { validators } from "components/interface/form/formValidators";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkDeleteActionDefItem } from "store/thunk/thunkActionDefinitions";
import capitalize from "lodash/capitalize";
import { useMissionDocSelector } from "utils/useDocSelector";
import {
  crudCreateActionDefinitionItem,
  crudUpdateActionDefinitionItemByField,
} from "client/crud/crud-mission-actionDefinition";

const ActionDefinitions_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle} aria-label="rightBodyTitle">
        STM Action Definitions
      </div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <ActionDefinitions type={"verbs"} editMode={editMode} />
        </div>
        <div className={paneStyles.panelContainer}>
          <ActionDefinitions type={"nouns"} editMode={editMode} />
        </div>
        <div className={paneStyles.panelContainer}>
          <ActionDefinitions type={"adjectives"} editMode={editMode} />
        </div>
      </div>
    </div>
  );
};

export default ActionDefinitions_Panel;

const ActionDefinitions: FunctionComponent<{
  type: ActionDefinitionType;
  editMode: boolean;
}> = ({ type, editMode }) => {
  const divRef = useRef<HTMLDivElement>(null);
  const actionDefinitions = useMissionDocSelector((doc) => doc.actionDefinitions, deepEqual);

  // Makes a 2nd sorted array of the key value object map
  const actionDefinitionItemsSorted = Object.entries(actionDefinitions?.[type] || {}).sort(
    ([, a], [, b]) => a.name.localeCompare(b.name)
  );

  let buttonWidth = "135px";
  if (type === "nouns") {
    buttonWidth = "140px";
  } else if (type === "adjectives") {
    buttonWidth = "150px";
  }

  return (
    <div className={paneStyles.panelSection}>
      <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
        <SubpanelHeading icon={faList}>{capitalize(type)}</SubpanelHeading>
      </div>
      <div ref={divRef}>
        <ul className={missionStyles.propertyList}>
          <li className={missionStyles.propertyListItem}>
            <div>
              <div
                className={missionStyles.propertyRowHeader}
                style={{ backgroundColor: "var(--grey2)" }}
              >
                <div className={missionStyles.propertyRowName}>Name</div>
                <div className={missionStyles.propertyRowLongAbbr}>Abbreviation</div>
                <div className={missionStyles.propertyRowTrashContainer}></div>
              </div>
            </div>
          </li>
          {actionDefinitionItemsSorted.map((actionDefinitionKeyValue, index) => (
            <li
              key={actionDefinitionKeyValue[0]}
              className={missionStyles.propertyListItem}
              aria-label="actionDefs-item"
            >
              <MemoizedActionDefinitionItem
                type={type}
                actionDefinitionKeyValue={actionDefinitionKeyValue}
                editMode={editMode}
                evenRow={index % 2 === 0}
              />
            </li>
          ))}
        </ul>

        {editMode && (
          <Button
            icon={faPlusCircle}
            label={`Add Action ${capitalize(type.slice(0, -1))}`}
            style={{ width: buttonWidth, marginLeft: "18px", marginTop: "8px" }}
            onClick={async () => {
              crudCreateActionDefinitionItem(type);
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
  actionDefinitionKeyValue: [string, { name: string; abbr: string }];
  editMode: boolean;
  evenRow: boolean;
}> = ({ type, actionDefinitionKeyValue, editMode, evenRow }) => {
  const dispatch = useAppDispatch();

  let backgroundColor: string = "var(--grey2)";
  backgroundColor = evenRow ? "var(--grey2)" : "var(--grey1)";

  return (
    <div>
      <div className={missionStyles.propertyRow} style={{ backgroundColor }}>
        <div className={missionStyles.propertyRowName}>
          <ValidatedInputField
            editMode={editMode}
            fieldProps={{
              name: "actionDefinitionName",
              ariaLabel: `${capitalize(type)} name`,
              validators: [validators.maxLength(255), validators.required],
            }}
            value={actionDefinitionKeyValue[1].name}
            onSubmit={(val: string) => {
              crudUpdateActionDefinitionItemByField(type, actionDefinitionKeyValue[0], "name", val);
            }}
            focusContents={
              actionDefinitionKeyValue[1].name === `(${capitalize(type.slice(0, -1))} Name)`
            }
          />
        </div>
        <div className={missionStyles.propertyRowLongAbbr}>
          <ValidatedInputField
            editMode={editMode}
            fieldProps={{
              name: "actionDefinitionNameAbbr",
              ariaLabel: `${capitalize(type)} abbreviation`,
              validators: [validators.maxLength(10), validators.required],
            }}
            value={actionDefinitionKeyValue[1].abbr}
            onSubmit={(val: string) => {
              crudUpdateActionDefinitionItemByField(type, actionDefinitionKeyValue[0], "abbr", val);
            }}
            key={`${actionDefinitionKeyValue[0]}-abbr`}
            focusContents={actionDefinitionKeyValue[1].abbr === "abbr"}
          />
        </div>

        <div className={missionStyles.propertyRowTrashContainer}>
          <div className={missionStyles.propertyRowTrash}>
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
                      uuid: actionDefinitionKeyValue[0],
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

/**
 * Memoized version of the ActionDefinitionItem component to prevent unnecessary re-renders
 * when the props haven't changed.
 * This is especially useful when the component is part of a list.
 * The memoization is based on the props passed to the component.
 * The component will only re-render if the props change.
 */
const MemoizedActionDefinitionItem = memo(ActionDefinitionItem);
