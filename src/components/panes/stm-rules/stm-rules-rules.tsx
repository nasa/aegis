import type { FunctionComponent } from "react";
import styles from "./stm-rules-rules.module.css";
import { shallowEqual, deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { Button, Checkbox, MultiSelectDropdown } from "components/interface/form/globalFields";
import {
  setRuleEditingUuid,
  setStmRulesActiveTab,
  setStmRulesSelectedRuleUuid,
  setStmRulesSelectedStmUuid,
  upsertSTMRuleByField,
} from "store/stm";
import {
  thunkCancelStmRuleByUuid,
  thunkDeleteStmRuleByUuid,
  thunkSaveStmRule,
} from "store/thunk/thunkStmRules";
import RulesEngineSummary from "./stm-rule-count";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBan,
  faEdit,
  faFloppyDisk,
  faMagnifyingGlass,
  faSquareMinus,
  faSquarePlus,
  faTrashAlt,
} from "@fortawesome/free-solid-svg-icons";
import cloneDeep from "lodash/cloneDeep";
import capitalize from "lodash/capitalize";
import { useMissionDocSelector } from "utils/useDocSelector";

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
  const rules = useAppSelector(
    (state) => state.stm.rules.filter((rule) => rule.stmUuid === stmUuid),
    shallowEqual
  );
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
  const isEditing = useAppSelector((state) => state.stm.ruleEditingUuid === rule.uuid, refEqual);
  return (
    <div className={styles.stmRuleRowContainer}>
      <div className={styles.stmRuleContainer}>
        <STMRuleCount isEditing={isEditing} rule={rule} />
        <div className={ruleSetContainerClass(styles.stmRuleSetContainerVerb, isEditing)}>
          <STMRuleSet isEditing={isEditing} stmRule={rule} type="verbs" />
        </div>
        <div className={styles.stmRuleSetConjunction}>of</div>
        <div className={ruleSetContainerClass(styles.stmRuleSetContainerNoun, isEditing)}>
          <STMRuleSet isEditing={isEditing} stmRule={rule} type="nouns" />
        </div>
        <div className={styles.stmRuleSetConjunction}>in</div>
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
  const dispatch = useAppDispatch();
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
          dispatch(upsertSTMRuleByField(rule.uuid, "count", rule.count - 1));
        }}
      />
      <div className={styles.stmRuleCount}>{rule.count}</div>
      <FontAwesomeIcon
        icon={faSquarePlus}
        className={styles.stmRuleIcon}
        onClick={() => {
          dispatch(upsertSTMRuleByField(rule.uuid, "count", rule.count + 1));
        }}
      />
    </div>
  );
};

/**
 * Per-rule action buttons. The Edit/Save/Cancel interaction is transitional:
 * once STM rules move to Automerge, editing will switch to the universal
 * header edit mode and these buttons will be removed.
 */
const STMRuleButtons: FunctionComponent<{ rule: STMRule; isEditing: boolean }> = ({
  rule,
  isEditing,
}) => {
  const dispatch = useAppDispatch();
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const buttonStyle = { width: "26px", fontSize: "0.9em", paddingLeft: "8px" };
  return (
    <div className={styles.stmRuleButtonsContainer}>
      {!isEditing ? (
        <>
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
          {editPerms && (
            <>
              <Button
                ariaLabel="editRule"
                icon={faEdit}
                onClick={() => {
                  dispatch(setRuleEditingUuid(rule.uuid));
                }}
                toolTip="Edit Rule"
                style={buttonStyle}
              />
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
            </>
          )}
        </>
      ) : (
        <>
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
          <Button
            ariaLabel="saveRule"
            icon={faFloppyDisk}
            onClick={() => {
              dispatch(thunkSaveStmRule({ stmRule: rule }));
            }}
            toolTip="Save Rule"
            style={{ ...buttonStyle, backgroundColor: "var(--alert)", color: "white" }}
          />
          <Button
            ariaLabel="cancelRuleEdit"
            icon={faBan}
            onClick={() => {
              dispatch(thunkCancelStmRuleByUuid({ stmRuleUuid: rule.uuid }));
            }}
            toolTip="Cancel Edit"
            style={buttonStyle}
          />
        </>
      )}
    </div>
  );
};

export const STMRuleSet: FunctionComponent<{
  isEditing: boolean;
  stmRule: STMRule;
  type: ActionDefinitionType;
}> = ({ isEditing, stmRule, type }) => {
  const dispatch = useAppDispatch();
  const actionDefinitions = useMissionDocSelector(
    (mission) => mission.actionDefinitions,
    deepEqual
  );

  const actionDefinitionItemsToDisplay: { uuid: string; name: string; abbr: string }[] = [];
  const ruleItemUuidsKeyString = `${type.slice(0, -1)}Uuids` as
    | "verbUuids"
    | "nounUuids"
    | "adjectiveUuids";
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
                    | "verbUuids"
                    | "nounUuids"
                    | "adjectiveUuids";
                  const uuidArray = cloneDeep(stmRule[uuidKeyString]);
                  const index = uuidArray.indexOf(uuid);
                  if (index > -1) {
                    uuidArray.splice(index, 1);
                  } else {
                    uuidArray.push(uuid);
                  }
                  dispatch(upsertSTMRuleByField(stmRule.uuid, uuidKeyString, uuidArray));
                }}
                titleLabel={`${capitalize(type)}...`}
                containerStyle={{ zIndex: 10, width: "170px" }}
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
                  | "verbAny"
                  | "nounAny"
                  | "adjectiveAny";
                dispatch(upsertSTMRuleByField(stmRule.uuid, anyKeyString, e.target.checked));
              }}
              onClick={() => {
                const anyKeyString = `${type.slice(0, -1)}Any` as
                  | "verbAny"
                  | "nounAny"
                  | "adjectiveAny";
                dispatch(
                  upsertSTMRuleByField(stmRule.uuid, anyKeyString, !stmRule[ruleAnyKeyString])
                );
              }}
              toolTip={`Any ${type.slice(0, -1)}`}
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
                <div className={styles.stmRuleSetItemName}>{`...Select ${capitalize(type)}`}</div>
              )}
            </>
          ) : (
            <div
              className={styles.stmRuleSetItemName}
            >{`<Any ${capitalize(type.slice(0, -1))}>`}</div>
          )}
        </div>
      )}
    </>
  );
};
