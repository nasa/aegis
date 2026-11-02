import { from, change } from "@automerge/automerge";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankStmLvl3, generateBlankStmRule } from "store/storeUtils/stm";
import { applyImportStmRules, exportStmRules, parseStmRules } from "utils/stmRulesImportExport";

const fixture = () => {
  const mission = generateBlankMission();
  const level = generateBlankStmLvl3();
  const rule = generateBlankStmRule({ stmUuid: level.uuid });
  mission.stmLevel3s = { [level.uuid]: level };
  mission.stmRules = { [rule.uuid]: rule };
  return { mission, rule };
};

describe("mission rules import/export", () => {
  it("round trips all fields and replaces rules in an Automerge change", () => {
    const { mission, rule } = fixture();
    const json = exportStmRules(mission);
    expect(parseStmRules(json, mission)).toEqual([rule]);
    const doc = from({ ...mission });
    const imported = change(doc, (draft) => {
      applyImportStmRules(draft, json);
    });
    expect(imported.stmRules).toEqual(mission.stmRules);
    expect(doc.stmRules).toEqual(mission.stmRules);
    const cleared = change(imported, (draft) => {
      applyImportStmRules(draft, '{"version":1,"stmRules":[]}');
    });
    expect(cleared.stmRules).toEqual({});
    expect(cleared.stmLevel3s).toEqual(mission.stmLevel3s);
  });

  it.each([
    { count: 0 },
    { count: 1.5 },
    { verbAny: "true" },
    { nounUuids: ["missing"] },
    { stmUuid: "missing" },
    { adjectiveUuids: ["x", "x"] },
    { updatedAt: null },
    { uuid: "__proto__" },
  ])("rejects invalid rules without modifying the mission: %j", (override) => {
    const { mission, rule } = fixture();
    const before = JSON.stringify(mission);
    expect(() =>
      applyImportStmRules(
        mission,
        JSON.stringify({ version: 1, stmRules: [rule, { ...rule, uuid: "another", ...override }] })
      )
    ).toThrow();
    expect(JSON.stringify(mission)).toBe(before);
  });

  it("rejects duplicates, malformed JSON and unsupported versions", () => {
    const { mission, rule } = fixture();
    for (const json of [
      "{",
      "null",
      '{"version":2,"stmRules":[]}',
      JSON.stringify({ version: 1, stmRules: [rule, rule] }),
    ]) {
      expect(() => parseStmRules(json, mission)).toThrow();
    }
  });
});
