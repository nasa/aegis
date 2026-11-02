import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankStmRule } from "store/storeUtils/stm";
import { getSatisfiedActionsByRule } from "utils/stmRuleEngine";

const makeRule = (partial: Partial<STMRule> = {}): STMRule => ({
  ...generateBlankStmRule({ stmUuid: "stm1" }),
  verbUuids: ["v1"],
  nounUuids: ["n1"],
  adjectiveUuids: ["a1"],
  ...partial,
});

const fullDefinition: ActionDefinition = {
  verbUuid: "v1",
  nounUuid: "n1",
  adjectiveUuid: "a1",
};

describe("getSatisfiedActionsByRule()", () => {
  test.each([
    ["verbAny", "verbUuid"],
    ["nounAny", "nounUuid"],
    ["adjectiveAny", "adjectiveUuid"],
  ] as const)("%s ignores populated, null, empty, and missing %s values", (anyKey, uuidKey) => {
    const missingDimension = { ...fullDefinition };
    delete missingDimension[uuidKey];
    const actions = [
      generateBlankAction({ actionDefinition: fullDefinition }),
      generateBlankAction({ actionDefinition: { ...fullDefinition, [uuidKey]: "other" } }),
      generateBlankAction({ actionDefinition: { ...fullDefinition, [uuidKey]: null } }),
      generateBlankAction({ actionDefinition: { ...fullDefinition, [uuidKey]: "" } }),
      generateBlankAction({ actionDefinition: missingDimension }),
    ];

    expect(
      getSatisfiedActionsByRule({ rule: makeRule({ [anyKey]: true }), actionsToConsider: actions })
    ).toEqual(actions);
  });

  test("all Any fields also match a null or empty actionDefinition", () => {
    const actions = [null, {}, fullDefinition].map((actionDefinition) =>
      generateBlankAction({ actionDefinition })
    );
    const rule = makeRule({
      verbAny: true,
      nounAny: true,
      adjectiveAny: true,
      verbUuids: [],
      nounUuids: [],
      adjectiveUuids: [],
    });

    expect(getSatisfiedActionsByRule({ rule, actionsToConsider: actions })).toEqual(actions);
  });

  test("Any fields leave the other fields' explicit constraints in place", () => {
    const matching = generateBlankAction({ actionDefinition: { verbUuid: "v2" } });
    const actions = [
      matching,
      generateBlankAction({ actionDefinition: { verbUuid: "other" } }),
      generateBlankAction({ actionDefinition: { verbUuid: null } }),
      generateBlankAction({ actionDefinition: {} }),
      generateBlankAction({ actionDefinition: null }),
    ];
    const rule = makeRule({ verbUuids: ["v1", "v2"], nounAny: true, adjectiveAny: true });

    expect(getSatisfiedActionsByRule({ rule, actionsToConsider: actions })).toEqual([matching]);
  });

  test("an empty selection with Any disabled matches no actions", () => {
    const rule = makeRule({ verbUuids: [], nounAny: true, adjectiveAny: true });
    const actions = [
      generateBlankAction({ actionDefinition: fullDefinition }),
      generateBlankAction({ actionDefinition: null }),
    ];

    expect(getSatisfiedActionsByRule({ rule, actionsToConsider: actions })).toEqual([]);
  });
});
