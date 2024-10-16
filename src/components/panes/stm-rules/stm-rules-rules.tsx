import { FunctionComponent, useState } from "react";
import styles from "./stm-rules-rules.module.css";
import { deepEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { Checkbox, MultiSelectDropdown } from "components/interface/form/globalFields";
import * as _ from "lodash";
import { setRuleEditingUuid, upsertSTMRuleByField } from "store/stm";
import STMRuleDetailsModal from "./stm-rules-details-modal";
import RulesEngineSummary from "./stm-rule-count";

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
  const dispatch = useAppDispatch();
  const isEditing = false;
  const [isModalOpen, setIsModalOpen] = useState(false);
  return (
    <>
      <div
        className={styles.stmRuleRowContainer}
        onClick={() => {
          // if rule is blank, open modal in edit mode
          if (
            (rule.verbUuids.length === 0 && !rule.verbAny) ||
            (rule.nounUuids.length === 0 && !rule.nounAny) ||
            (rule.adjectiveUuids.length === 0 && !rule.adjectiveAny)
          ) {
            dispatch(setRuleEditingUuid(rule.uuid));
          }
          setIsModalOpen(true);
        }}
      >
        <div className={styles.stmRuleContainer}>
          <div className={styles.stmRuleCount}>{rule.count}</div>
          <div className={styles.stmRuleSetContainer}>
            <STMRuleSet isEditing={isEditing} stmRule={rule} type="verbs" />
          </div>
          <div className={styles.stmRuleSetConjunction}>of</div>
          <div className={styles.stmRuleSetContainer}>
            <STMRuleSet isEditing={isEditing} stmRule={rule} type="nouns" />
          </div>
          <div className={styles.stmRuleSetConjunction}>in</div>
          <div className={styles.stmRuleSetContainer}>
            <STMRuleSet isEditing={isEditing} stmRule={rule} type="adjectives" />
          </div>
        </div>
        <RulesEngineSummary rule={rule} />
      </div>
      {isModalOpen && (
        <STMRuleDetailsModal
          rule={rule}
          isModalOpen={isModalOpen}
          setIsModalOpen={setIsModalOpen}
        />
      )}
    </>
  );
};

export const STMRuleSet: FunctionComponent<{
  isEditing: boolean;
  stmRule: STMRule;
  type: ActionDefinitionType;
}> = ({ isEditing, stmRule, type }) => {
  const dispatch = useAppDispatch();
  const actionDefinitions = useAppSelector(
    (state) => state.mission.mission.actionDefinitions,
    deepEqual
  );

  const actionDefinitionItems: ActionDefinitionItem[] = [];
  const ruleItemUuidsKeyString = `${type.slice(0, -1)}Uuids` as
    | "verbUuids"
    | "nounUuids"
    | "adjectiveUuids";
  const ruleAnyKeyString = `${type.slice(0, -1)}Any` as "verbAny" | "nounAny" | "adjectiveAny";
  for (const ruleItemUuid of stmRule[ruleItemUuidsKeyString] as string[]) {
    const actionDef = actionDefinitions[type].find((def) => def.uuid === ruleItemUuid);
    const actionDefinitionItem: ActionDefinitionItem = {
      uuid: actionDef.uuid,
      name: actionDef.name,
      abbr: actionDef.abbr,
    };
    actionDefinitionItems.push(actionDefinitionItem);
  }

  const ruleSetTypeClass = styles[`stmRuleSet${_.capitalize(type.slice(0, -1))}`];

  return (
    <>
      {isEditing ? (
        <div className={`${styles.stmRuleSetEdit} ${ruleSetTypeClass}`}>
          {!stmRule[ruleAnyKeyString] && (
            <div className={styles.stmRuleSetMultiselectOutsideContainer}>
              <MultiSelectDropdown
                items={actionDefinitions[type].map((display) => ({
                  label: display.name,
                  value: display.uuid,
                }))}
                selectedItemsValues={stmRule[ruleItemUuidsKeyString]}
                toggleItem={(uuid) => {
                  const uuidKeyString = `${type.slice(0, -1)}Uuids` as
                    | "verbUuids"
                    | "nounUuids"
                    | "adjectiveUuids";
                  const uuidArray = _.cloneDeep(stmRule[uuidKeyString]);
                  const index = uuidArray.indexOf(uuid);
                  if (index > -1) {
                    uuidArray.splice(index, 1);
                  } else {
                    uuidArray.push(uuid);
                  }
                  dispatch(upsertSTMRuleByField(stmRule.uuid, uuidKeyString, uuidArray));
                }}
                titleLabel={`${_.capitalize(type)}...`}
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
              {actionDefinitionItems.length > 0 ? (
                <>
                  {actionDefinitionItems.map((display) => (
                    <div key={display.uuid}>{display.name}</div>
                  ))}
                </>
              ) : (
                <div className={styles.stmRuleSetItemName}>{`...Select ${_.capitalize(type)}`}</div>
              )}
            </>
          ) : (
            <div
              className={styles.stmRuleSetItemName}
            >{`<Any ${_.capitalize(type.slice(0, -1))}>`}</div>
          )}
        </div>
      )}
    </>
  );
};
