import type { FunctionComponent } from "react";
import styles from "./stm-rules-rules.module.css";
import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { Button, Checkbox, MultiSelectDropdown } from "components/interface/form/globalFields";
import {
  setStmRulesActiveTab,
  setStmRulesSelectedRuleUuid,
  setStmRulesSelectedStmUuid,
} from "store/stm";
import { thunkDeleteStmRuleByUuid } from "store/thunk/thunkStmRules";
import { withMissionChange } from "client/automergeDocHandles";
import { applyUpdateStmRuleByField } from "operations/apply/apply-mission-stm";
import RulesEngineSummary from "./stm-rule-count";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass,
  faSquareMinus,
  faSquarePlus,
  faTrashAlt,
} from "@fortawesome/free-solid-svg-icons";
import cloneDeep from "lodash/cloneDeep";
import capitalize from "lodash/capitalize";
import { useMissionDocSelector } from "utils/useDocSelector";
import { getActionDefinitionLabel, selectStmRules } from "store/selectors";

/** Write one STM rule field to the mission doc. */
const updateRuleField = <K extends keyof STMRule>(
  ruleUuid: string,
  fieldName: K,
  value: STMRule[K]
): void => {
  withMissionChange((m) => applyUpdateStmRuleByField(m, { ruleUuid, fieldName, value }));
};

/**
 * className for a rule word-column wrapper: the base container plus its
 * measured content-fit width — or the auto-width override while the row is being
 * edited so the multiselect dropdown fits. Shared with the Rule Matches tab.
 */
export const ruleSetContainerClass = (widthClass: string, isEditing: boolean): string =>
  isEditing
    ? `${styles.stmRuleSetContainer} ${styles.stmRuleSetContainerEditing}`
    : `${styles.stmRuleSetContainer} ${widthClass}`;

const STMRules: FunctionComponent<{ stmUuid: string }> = ({ stmUuid }) => {
  const rules =
    useMissionDocSelector(
      (mission) => selectStmRules(mission).filter((rule) => rule.stmUuid === stmUuid),
      deepEqual
    ) ?? [];
  return (
    <div>
      {rules.map((rule) => (
        <STMRule key={rule.uuid} rule={rule} />
      ))}
    </div>
  );
};

export default STMRules;

const STMRule: FunctionComponent<{ rule: STMRule }> = ({ rule }) => {
  const isEditing = useAppSelector(
    (state) => state.user.missionPerms.permissions.edit && state.mission.isInEditMode,
    refEqual
  );
  const conjunctions = useMissionDocSelector(
    (mission) => mission.actionDefinitionConjunctions,
    refEqual
  );
  return (
    <div className={styles.stmRuleRowContainer}>
      <div className={styles.stmRuleContainer}>
        <STMRuleCount isEditing={isEditing} rule={rule} />
        <div className={ruleSetContainerClass(styles.stmRuleSetContainerVerb, isEditing)}>
          <STMRuleSet isEditing={isEditing} stmRule={rule} type="verbs" />
        </div>
        <div className={styles.stmRuleSetConjunction}>{conjunctions.verbToNoun}</div>
        <div className={ruleSetContainerClass(styles.stmRuleSetContainerNoun, isEditing)}>
          <STMRuleSet isEditing={isEditing} stmRule={rule} type="nouns" />
        </div>
        <div className={styles.stmRuleSetConjunction}>{conjunctions.nounToAdjective}</div>
        <div className={ruleSetContainerClass(styles.stmRuleSetContainerAdjective, isEditing)}>
          <STMRuleSet isEditing={isEditing} stmRule={rule} type="adjectives" />
        </div>
      </div>
      <div className={styles.stmRuleRight}>
        <RulesEngineSummary rule={rule} />
        <STMRuleButtons rule={rule} isEditing={isEditing} />
      </div>
    </div>
  );
};

/**
 * Rule match count: plain number when reading, +/- stepper when editing.
 */
export const STMRuleCount: FunctionComponent<{ isEditing: boolean; rule: STMRule }> = ({
  isEditing,
  rule,
}) => {
  if (!isEditing) {
    return <div className={styles.stmRuleCount}>{rule.count}</div>;
  }
  return (
    <div className={styles.stmRuleCountContainer}>
      <FontAwesomeIcon
        icon={faSquareMinus}
        className={styles.stmRuleIcon}
        onClick={() => {
          if (rule.count <= 1) return;
          updateRuleField(rule.uuid, "count", rule.count - 1);
        }}
      />
      <div className={styles.stmRuleCount}>{rule.count}</div>
      <FontAwesomeIcon
        icon={faSquarePlus}
        className={styles.stmRuleIcon}
        onClick={() => {
          updateRuleField(rule.uuid, "count", rule.count + 1);
        }}
      />
    </div>
  );
};

/**
 * Per-rule action buttons. Rule fields save as they are edited; delete is only
 * available in edit mode.
 */
const STMRuleButtons: FunctionComponent<{ rule: STMRule; isEditing: boolean }> = ({
  rule,
  isEditing,
}) => {
  const dispatch = useAppDispatch();

  const buttonStyle = { width: "26px", fontSize: "0.9em", paddingLeft: "8px" };
  return (
    <div className={styles.stmRuleButtonsContainer}>
      <Button
        ariaLabel="viewRuleMatches"
        icon={faMagnifyingGlass}
        onClick={() => {
          dispatch(setStmRulesSelectedStmUuid(rule.stmUuid));
          dispatch(setStmRulesSelectedRuleUuid(rule.uuid));
          dispatch(setStmRulesActiveTab("matches"));
        }}
        toolTip="View Rule Matches"
        style={buttonStyle}
      />
      {isEditing && (
        <Button
          ariaLabel="deleteRule"
          icon={faTrashAlt}
          onClick={() => {
            if (window.confirm("Are you sure you want to delete this rule?")) {
              dispatch(thunkDeleteStmRuleByUuid({ stmRuleUuid: rule.uuid }));
            }
          }}
          toolTip="Delete Rule"
          style={buttonStyle}
        />
      )}
    </div>
  );
};

export const STMRuleSet: FunctionComponent<{
  isEditing: boolean;
  stmRule: STMRule;
  type: ActionDefinitionType;
}> = ({ isEditing, stmRule, type }) => {
  const actionDefinitions = useMissionDocSelector(
    (mission) => mission.actionDefinitions,
    deepEqual
  );
  const actionDefinitionLabels = useMissionDocSelector(
    (mission) => mission.actionDefinitionLabels,
    deepEqual
  );
  const singularLabel = getActionDefinitionLabel({ actionDefinitionLabels }, type);
  const pluralLabel = getActionDefinitionLabel({ actionDefinitionLabels }, type, "plural");

  const actionDefinitionItemsToDisplay: { uuid: string; name: string; abbr: string }[] = [];
  const ruleItemUuidsKeyString = `${type.slice(0, -1)}Uuids` as
    "verbUuids" | "nounUuids" | "adjectiveUuids";
  const ruleAnyKeyString = `${type.slice(0, -1)}Any` as "verbAny" | "nounAny" | "adjectiveAny";
  for (const ruleItemUuid of stmRule[ruleItemUuidsKeyString] as string[]) {
    const actionDef = actionDefinitions[type][ruleItemUuid];
    if (actionDef) {
      const actionDefinitionItem = {
        uuid: ruleItemUuid,
        name: actionDef.name,
        abbr: actionDef.abbr,
      };
      actionDefinitionItemsToDisplay.push(actionDefinitionItem);
    }
  }

  const ruleSetTypeClass = styles[`stmRuleSet${capitalize(type.slice(0, -1))}`];

  return (
    <>
      {isEditing ? (
        <div className={`${styles.stmRuleSetEdit} ${ruleSetTypeClass}`}>
          {!stmRule[ruleAnyKeyString] && (
            <div className={styles.stmRuleSetMultiselectOutsideContainer}>
              <MultiSelectDropdown
                items={Object.entries(actionDefinitions[type]).map(([uuid, display]) => ({
                  label: display.name,
                  value: uuid,
                }))}
                selectedItemsValues={stmRule[ruleItemUuidsKeyString]}
                toggleItem={(uuid) => {
                  const uuidKeyString = `${type.slice(0, -1)}Uuids` as
                    "verbUuids" | "nounUuids" | "adjectiveUuids";
                  const uuidArray = cloneDeep(stmRule[uuidKeyString]);
                  const index = uuidArray.indexOf(uuid);
                  if (index > -1) {
                    uuidArray.splice(index, 1);
                  } else {
                    uuidArray.push(uuid);
                  }
                  updateRuleField(stmRule.uuid, uuidKeyString, uuidArray);
                }}
                titleLabel={
                  actionDefinitionItemsToDisplay.map((item) => item.name).join(", ") ||
                  `${pluralLabel}...`
                }
                containerStyle={{ width: "170px" }}
                containerClassName={styles.stmRuleSetMultiselectContainer}
                headerClassName={styles.multiselectDropdownHeader}
              />
            </div>
          )}
          <div className={styles.stmRuleAnyCheckbox}>
            <Checkbox
              checked={stmRule[ruleAnyKeyString]}
              editable={isEditing}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const anyKeyString = `${type.slice(0, -1)}Any` as
                  "verbAny" | "nounAny" | "adjectiveAny";
                updateRuleField(stmRule.uuid, anyKeyString, e.target.checked);
              }}
              onClick={() => {
                const anyKeyString = `${type.slice(0, -1)}Any` as
                  "verbAny" | "nounAny" | "adjectiveAny";
                updateRuleField(stmRule.uuid, anyKeyString, !stmRule[ruleAnyKeyString]);
              }}
              toolTip={`Any ${singularLabel}`}
              label={`Any`}
            />
          </div>
        </div>
      ) : (
        <div className={`${styles.stmRuleSet} ${ruleSetTypeClass}`}>
          {!stmRule[ruleAnyKeyString] ? (
            <>
              {actionDefinitionItemsToDisplay.length > 0 ? (
                <>
                  {actionDefinitionItemsToDisplay.map((display) => (
                    <div key={display.uuid}>{display.name}</div>
                  ))}
                </>
              ) : (
                <div className={styles.stmRuleSetItemName}>{`...Select ${pluralLabel}`}</div>
              )}
            </>
          ) : (
            <div className={styles.stmRuleSetItemName}>{`<Any ${singularLabel}>`}</div>
          )}
        </div>
      )}
    </>
  );
};
