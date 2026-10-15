import {
  getMissionDocHandle,
  setMissionAutomergeDocHandle,
  withMissionChange,
} from "client/automergeDocHandles";
import {
  applyDeleteStmLevel,
  applyDeleteStmRule,
  applyReplaceStmTree,
  applyUpdateStmLevelByField,
  applyUpdateStmRuleByField,
  applyUpsertStmLevel,
  applyUpsertStmRule,
  getStmLevelDeleteBlocker,
} from "operations/apply/apply-mission-stm";
import {
  generateBlankStmLvl1,
  generateBlankStmLvl2,
  generateBlankStmLvl3,
  generateBlankStmRule,
} from "store/storeUtils/stm";
import { generateBlankAction } from "store/storeUtils/action";

const getMission = (): Mission => getMissionDocHandle().doc();

let level1: STMLevel1;
let level2: STMLevel2;
let level3: STMLevel3;
let action: Action;

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  level1 = generateBlankStmLvl1({ name: "L1", numbering: "1" });
  level2 = generateBlankStmLvl2({ name: "L2", numbering: "a", level1Uuid: level1.uuid });
  level3 = generateBlankStmLvl3({ name: "L3", numbering: "1", level2Uuid: level2.uuid });
  action = generateBlankAction({ name: "Vitest Action", stmPriorities: { [level3.uuid]: 1 } });
  getMissionDocHandle().change((m) => {
    m.stmLevel1s = {};
    m.stmLevel2s = {};
    m.stmLevel3s = {};
    m.stmRules = {};
    m.actions = { [action.uuid]: action };
  });
  withMissionChange((m) => {
    applyUpsertStmLevel(m, { collection: "stmLevel1s", level: level1 });
    applyUpsertStmLevel(m, { collection: "stmLevel2s", level: level2 });
    applyUpsertStmLevel(m, { collection: "stmLevel3s", level: level3 });
  });
});

describe("apply-mission-stm", () => {
  it("applyUpdateStmLevelByField() updates the name and numbering", () => {
    withMissionChange((m) =>
      applyUpdateStmLevelByField(m, {
        collection: "stmLevel2s",
        uuid: level2.uuid,
        fieldName: "numbering",
        value: "b",
      })
    );
    expect(getMission().stmLevel2s[level2.uuid].numbering).toBe("b");
  });

  it("does not delete a level that has children or rules", () => {
    const rule = generateBlankStmRule({ stmUuid: level3.uuid });
    withMissionChange((m) => applyUpsertStmRule(m, rule));

    expect(
      getStmLevelDeleteBlocker(getMission(), { collection: "stmLevel1s", uuid: level1.uuid })
    ).toBe("STM has a level 2 child");
    expect(
      getStmLevelDeleteBlocker(getMission(), { collection: "stmLevel3s", uuid: level3.uuid })
    ).toBe("STM has a rule assigned");
    withMissionChange((m) =>
      applyDeleteStmLevel(m, { collection: "stmLevel1s", uuid: level1.uuid })
    );
    expect(getMission().stmLevel1s[level1.uuid]).toBeDefined();
  });

  it("deleting a level 3 removes it from every action STM priority", () => {
    withMissionChange((m) =>
      applyDeleteStmLevel(m, { collection: "stmLevel3s", uuid: level3.uuid })
    );
    expect(getMission().stmLevel3s[level3.uuid]).toBeUndefined();
    expect(getMission().actions[action.uuid].stmPriorities).toEqual({});
  });

  it("applyReplaceStmTree() replaces the levels and drops stale rules and priorities", () => {
    const rule = generateBlankStmRule({ stmUuid: level3.uuid });
    withMissionChange((m) => applyUpsertStmRule(m, rule));
    const newLevel1 = generateBlankStmLvl1({ numbering: "9" });

    withMissionChange((m) =>
      applyReplaceStmTree(m, { level1s: [newLevel1], level2s: [], level3s: [] })
    );
    const mission = getMission();
    expect(Object.keys(mission.stmLevel1s)).toEqual([newLevel1.uuid]);
    expect(mission.stmLevel3s).toEqual({});
    expect(mission.stmRules).toEqual({});
    expect(mission.actions[action.uuid].stmPriorities).toEqual({});
  });

  it("creates, updates, and deletes an STM rule", () => {
    const rule = generateBlankStmRule({ stmUuid: level3.uuid });
    withMissionChange((m) => applyUpsertStmRule(m, rule));
    withMissionChange((m) =>
      applyUpdateStmRuleByField(m, { ruleUuid: rule.uuid, fieldName: "count", value: 3 })
    );
    expect(getMission().stmRules[rule.uuid].count).toBe(3);

    withMissionChange((m) => applyDeleteStmRule(m, rule.uuid));
    expect(getMission().stmRules[rule.uuid]).toBeUndefined();
  });
});
