import {
  getActionDisplayName,
  getAlertColor,
  isModified,
  makeTraverseRateString,
} from "utils/component-helpers";
import { sortActionDefinitionItems } from "components/interface/actionDefDropdown";

describe("getAlertColor", () => {
  test("returns 'var(--alert)' for reportItems with 'error'", () => {
    const reportItems: ReportItem[] = [{ message: null, type: "error" }];
    expect(getAlertColor(reportItems)).toBe("var(--alert)");
  });

  test("returns 'var(--warning)' for reportItems with 'warning'", () => {
    const reportItems: ReportItem[] = [{ message: null, type: "warning" }];
    expect(getAlertColor(reportItems)).toBe("var(--warning)");
  });

  test("returns 'white' for reportItems with 'info'", () => {
    const reportItems: ReportItem[] = [{ message: null, type: "info" }];
    expect(getAlertColor(reportItems)).toBe("white");
  });

  test("returns 'var(--alert)' for evaReportSequenceItems with 'error'", () => {
    const evaReportSequenceItems: EvaReportSequenceItem[] = [
      { uuid: "", type: "station", name: null, reportItems: [{ message: null, type: "error" }] },
    ];
    expect(getAlertColor([], evaReportSequenceItems)).toBe("var(--alert)");
  });

  test("returns 'var(--warning)' for evaReportSequenceItems with 'warning'", () => {
    const evaReportSequenceItems: EvaReportSequenceItem[] = [
      { uuid: "", type: "station", name: null, reportItems: [{ message: null, type: "warning" }] },
    ];
    expect(getAlertColor([], evaReportSequenceItems)).toBe("var(--warning)");
  });

  test("returns 'white' if no errors or warnings are present", () => {
    const reportItems: ReportItem[] = [{ message: null, type: "info" }];
    const evaReportSequenceItems: EvaReportSequenceItem[] = [
      { uuid: "", type: "station", name: null, reportItems: [{ message: null, type: "info" }] },
    ];
    expect(getAlertColor(reportItems, evaReportSequenceItems)).toBe("white");
  });
});

describe("isModified", () => {
  test("returns false when both arrays are identical", () => {
    const obj1 = [{ uuid: "1", updatedAt: "2021-01-01" }];
    const obj2 = [{ uuid: "1", updatedAt: "2021-01-01" }];
    expect(isModified(obj1, obj2)).toBe(false);
  });

  test("returns true when the arrays have different lengths", () => {
    const obj1 = [{ uuid: "1", updatedAt: "2021-01-01" }];
    const obj2 = [
      { uuid: "1", updatedAt: "2021-01-01" },
      { uuid: "2", updatedAt: "2021-01-02" },
    ];
    expect(isModified(obj1, obj2)).toBe(true);
  });

  test("returns true when updatedAt differs", () => {
    const obj1 = [{ uuid: "1", updatedAt: "2021-01-01" }];
    const obj2 = [{ uuid: "1", updatedAt: "2021-02-01" }];
    expect(isModified(obj1, obj2)).toBe(true);
  });
});

describe("getActionDisplayName", () => {
  const mission = {
    actionSystemVersion: 2,
    actionDefinitions: {
      verbs: { v1: { name: "Sample" } },
      nouns: { n1: { name: "Rock" } },
      adjectives: { a1: { name: "Crater" } },
    },
    actionDefinitionConjunctions: { verbToNoun: "on", nounToAdjective: "within" },
    actionDefinitionLabels: {
      verb: { singular: "verb", plural: "verb" },
      noun: { singular: "noun", plural: "noun" },
      adjective: { singular: "adjective", plural: "adjective" },
    },
  } as unknown as Pick<
    Mission,
    | "actionSystemVersion"
    | "actionDefinitions"
    | "actionDefinitionConjunctions"
    | "actionDefinitionLabels"
  >;

  test("builds an STM (v2) action name from the definition + custom conjunctions", () => {
    const action = {
      name: "ignored",
      stmAction: true,
      actionDefinition: { verbUuid: "v1", nounUuid: "n1", adjectiveUuid: "a1" },
    } as unknown as Action;
    expect(getActionDisplayName({ action, mission })).toBe("Sample on Rock within Crater");
  });

  test("uses the stored name for a non-STM action even in a v2 mission", () => {
    const action = {
      name: "My Action",
      stmAction: false,
      actionDefinition: { verbUuid: "v1", nounUuid: "n1", adjectiveUuid: "a1" },
    } as unknown as Action;
    expect(getActionDisplayName({ action, mission })).toBe("My Action");
  });

  test("omits the noun-to-adjective conjunction and adjective when no adjective is selected", () => {
    const action = {
      name: "ignored",
      stmAction: true,
      actionDefinition: { verbUuid: "v1", nounUuid: "n1", adjectiveUuid: null },
    } as unknown as Action;
    expect(getActionDisplayName({ action, mission })).toBe("Sample on Rock");
  });

  test("uses the stored name in a v1 mission regardless of stmAction", () => {
    const action = {
      name: "Legacy Action",
      stmAction: true,
      actionDefinition: { verbUuid: "v1", nounUuid: "n1", adjectiveUuid: "a1" },
    } as unknown as Action;
    expect(getActionDisplayName({ action, mission: { ...mission, actionSystemVersion: 1 } })).toBe(
      "Legacy Action"
    );
  });
});

describe("sortActionDefinitionItems", () => {
  test("sorts action definitions alphabetically by name", () => {
    const items = {
      z: { name: "Zebra", abbr: "z" },
      a: { name: "Alpha", abbr: "a" },
      m: { name: "Mango", abbr: "m" },
    } as ActionDefinitionItems;

    expect(sortActionDefinitionItems(items).map(([_, item]) => item.name)).toEqual([
      "Alpha",
      "Mango",
      "Zebra",
    ]);
  });
});

describe("makeTraverseRateString", () => {
  test("returns null when value is provided", () => {
    expect(makeTraverseRateString(5)).toBeNull();
  });

  test("returns EVA rate string when evaDefault is provided", () => {
    expect(makeTraverseRateString(0, 10)).toBe("Using EVA Rate: 10");
  });

  test("returns mission rate string when evaDefault is not provided but missionDefault is", () => {
    expect(makeTraverseRateString(0, undefined, 20)).toBe("Using Mission Rate: 20");
  });
});
