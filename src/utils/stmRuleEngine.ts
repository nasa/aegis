import jsonLogic, { RulesLogic } from "json-logic-js";

const getActionDefRuleLogic = ({
  rule,
  type,
}: {
  rule: STMRule;
  type: ActionDefinitionType;
}): RulesLogic[] => {
  const ruleLogics = [];
  const typeSingular = type.slice(0, -1);
  const anyKeyString = `${typeSingular}Any` as "verbAny" | "nounAny" | "adjectiveAny";
  const uuidKeyString = `${typeSingular}Uuids` as "verbUuids" | "nounUuids" | "adjectiveUuids";
  if (!rule[anyKeyString]) {
    for (const uuid of rule[uuidKeyString]) {
      const rule: RulesLogic = {
        "==": [{ var: `actionDefinition.${typeSingular}Uuid` }, uuid],
      };
      ruleLogics.push(rule);
    }
  } else {
    // handle any
    const rule: RulesLogic = {
      "!!": { var: `actionDefinition.${typeSingular}Uuid` },
    };
    ruleLogics.push(rule);
  }
  return ruleLogics;
};

export const getSatisfiedActionsByRule = ({
  rule,
  actionsToConsider,
}: {
  rule: STMRule;
  actionsToConsider: Action[];
}): Action[] => {
  // convert rule to json-logic-js
  const verbLogic = getActionDefRuleLogic({ rule, type: "verbs" });
  const nounLogic = getActionDefRuleLogic({ rule, type: "nouns" });
  const adjectiveLogic = getActionDefRuleLogic({
    rule,
    type: "adjectives",
  });

  const ruleJson: RulesLogic = {
    filter: [
      { var: "actions" },
      { and: [{ or: verbLogic }, { or: nounLogic }, { or: adjectiveLogic }] },
    ],
  };

  // convert all stmActions to json-logic-js
  const actionsJson = {
    actions: actionsToConsider as Action[],
  };

  // execute rule on data returning matching actions
  const resultActions: Action[] = jsonLogic.apply(ruleJson, actionsJson);

  return resultActions;
};
