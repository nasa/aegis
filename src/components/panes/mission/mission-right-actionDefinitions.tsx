import type { FunctionComponent } from "react";
import { memo, useRef } from "react";
import paneStyles from "../global-pane-styles.module.css";
import missionStyles from "./mission.module.css";
import { deepEqual, shallowEqual } from "utils/useAppSelector";
import { SubpanelHeading } from "components/interface/_global-elements";
import { faList, faPlusCircle, faTrashAlt } from "@fortawesome/free-solid-svg-icons";
import { Button } from "components/interface/form/globalFields";
import { ValidatedInputField } from "components/interface/form/globalFieldsAutomerge";
import { validators } from "components/interface/form/formValidators";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkDocDeleteActionDefItem } from "store/thunk/thunkActionDefinitions";
import capitalize from "lodash/capitalize";
import { useMissionDocSelector } from "utils/useDocSelector";
import {
  applyCreateActionDefinitionItem,
  applyUpdateActionDefinitionItemByField,
  applyUpdateActionDefinitionLabel,
  applyUpdateActionDefinitionConjunction,
} from "operations/apply/apply-mission-actionDefinition";

import { withMissionChange } from "client/automergeDocHandles";
import { getActionDefinitionLabel } from "store/selectors";

const ActionDefinitions_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle} aria-label="rightBodyTitle">
        STM Action Definitions
      </div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <WordingEditor editMode={editMode} />
        </div>
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

/**
 * Editor for the customizable category labels (verb/noun/adjective, singular + plural) and the
 * sentence conjunctions ("of"/"in"). Rendered as a live sentence so the impact of each field is
 * obvious. Fields always show the effective value (custom or default) and are editable only in
 * edit mode; leaving a field at its default keeps the mission on the shared fallback.
 */
const WordingEditor: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const actionDefinitionLabels = useMissionDocSelector(
    (mission) => mission.actionDefinitionLabels,
    deepEqual
  );
  const conjunctions = useMissionDocSelector(
    (mission) => mission.actionDefinitionConjunctions,
    deepEqual
  );

  const labelField = (type: ActionDefinitionType, form: "singular" | "plural") => {
    const key = type.slice(0, -1) as "verb" | "noun" | "adjective";
    return (
      <ValidatedInputField
        editMode={editMode}
        fieldProps={{
          name: `${key}-${form}`,
          ariaLabel: `${capitalize(key)} ${form} label`,
          validators: [validators.maxLength(50), validators.required],
        }}
        value={getActionDefinitionLabel({ actionDefinitionLabels }, type, form)}
        displayStyle={{ color: `var(--${key})`, fontWeight: 600 }}
        styleContainer={{ display: "inline-block", minWidth: "60px" }}
        onSubmit={(val: string) =>
          withMissionChange((m) =>
            applyUpdateActionDefinitionLabel(m, { type: key, form, value: val })
          )
        }
        key={`${key}-${form}`}
      />
    );
  };

  const conjunctionField = (mapKey: "verbToNoun" | "nounToAdjective") => (
    <ValidatedInputField
      editMode={editMode}
      fieldProps={{
        name: mapKey,
        ariaLabel:
          mapKey === "verbToNoun" ? "Verb-to-noun conjunction" : "Noun-to-adjective conjunction",
        validators: [validators.maxLength(20), validators.required],
      }}
      value={conjunctions[mapKey]}
      styleContainer={{ display: "inline-block", minWidth: "40px" }}
      onSubmit={(val: string) =>
        withMissionChange((m) =>
          applyUpdateActionDefinitionConjunction(m, { key: mapKey, value: val })
        )
      }
      key={mapKey}
    />
  );

  return (
    <div className={paneStyles.panelSection}>
      <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
        <SubpanelHeading icon={faList}>Wording</SubpanelHeading>
      </div>
      <div style={{ padding: "0 18px" }}>
        <div style={{ marginBottom: "8px" }}>Actions read as:</div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "6px",
            marginBottom: "12px",
          }}
        >
          {labelField("verbs", "singular")}
          {conjunctionField("verbToNoun")}
          {labelField("nouns", "singular")}
          {conjunctionField("nounToAdjective")}
          {labelField("adjectives", "singular")}
        </div>
        <div style={{ marginBottom: "8px" }}>Plural labels (menus &amp; lists):</div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>
          {labelField("verbs", "plural")}
          {labelField("nouns", "plural")}
          {labelField("adjectives", "plural")}
        </div>
      </div>
    </div>
  );
};

const ActionDefinitions: FunctionComponent<{
  type: ActionDefinitionType;
  editMode: boolean;
}> = ({ type, editMode }) => {
  const divRef = useRef<HTMLDivElement>(null);
  const actionDefinitions = useMissionDocSelector(
    (mission) => mission.actionDefinitions,
    deepEqual
  );
  const actionDefinitionLabels = useMissionDocSelector((mission) => {
    const key = type.slice(0, -1) as "verb" | "noun" | "adjective";
    return mission?.actionDefinitionLabels[key];
  }, shallowEqual);

  // Makes a 2nd sorted array of the key value object map
  const actionDefinitionItemsSorted = Object.entries(actionDefinitions?.[type] || {}).sort(
    ([, a], [, b]) => a.name.localeCompare(b.name)
  );

  let buttonWidth = "90px";
  if (type === "nouns") {
    buttonWidth = "100px";
  } else if (type === "adjectives") {
    buttonWidth = "120px";
  }

  return (
    <div className={paneStyles.panelSection}>
      <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
        <SubpanelHeading icon={faList}>{actionDefinitionLabels.plural}</SubpanelHeading>
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
                namePlaceholder={`(${actionDefinitionLabels.singular} Name)`}
              />
            </li>
          ))}
        </ul>

        {editMode && (
          <Button
            icon={faPlusCircle}
            label={`Add ${actionDefinitionLabels.singular}`}
            style={{ width: buttonWidth, marginLeft: "8px", marginTop: "8px" }}
            onClick={async () => {
              withMissionChange((m) => applyCreateActionDefinitionItem(m, { type }));
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
  namePlaceholder: string;
}> = ({ type, actionDefinitionKeyValue, editMode, evenRow, namePlaceholder }) => {
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
              withMissionChange((m) =>
                applyUpdateActionDefinitionItemByField(m, {
                  type,
                  uuid: actionDefinitionKeyValue[0],
                  fieldName: "name",
                  value: val,
                })
              );
            }}
            focusContents={actionDefinitionKeyValue[1].name === namePlaceholder}
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
              withMissionChange((m) =>
                applyUpdateActionDefinitionItemByField(m, {
                  type,
                  uuid: actionDefinitionKeyValue[0],
                  fieldName: "abbr",
                  value: val,
                })
              );
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
                    thunkDocDeleteActionDefItem({
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
