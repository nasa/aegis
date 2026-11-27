import {
  getActionDisplayName,
  getAlertColor,
  getSequenceItemRowStyles,
  makeTraverseRateString,
  resolveDisplayedRexStatus,
} from "utils/component-helpers";
import evaStyles from "components/panes/eva/eva.module.css";
import { sortActionDefinitionItems } from "components/interface/actionDefDropdown";

describe("resolveDisplayedRexStatus", () => {
  test("reports complete when both crew members are at 100%", () => {
    // Maestro leaves an activity "in-progress" while an IV step is unchecked,
    // even though both crew members have finished it.
    expect(
      resolveDisplayedRexStatus({
        rexStatus: "in-progress",
        maestroPercentCompleteEv1: 100,
        maestroPercentCompleteEv2: 100,
      })
    ).toBe("complete");
  });

  test("stays in-progress when only one crew member is finished", () => {
    expect(
      resolveDisplayedRexStatus({
        rexStatus: "in-progress",
        maestroPercentCompleteEv1: 100,
        maestroPercentCompleteEv2: 40,
      })
    ).toBe("in-progress");
  });

  test("keeps skipped when both crew members are at 100%", () => {
    expect(
      resolveDisplayedRexStatus({
        rexStatus: "skipped",
        maestroPercentCompleteEv1: 100,
        maestroPercentCompleteEv2: 100,
      })
    ).toBe("skipped");
  });

  test("passes through the status when Maestro sends no percentages", () => {
    expect(resolveDisplayedRexStatus({ rexStatus: "skipped" })).toBe("skipped");
    expect(resolveDisplayedRexStatus(null)).toBeUndefined();
  });
});

describe("getSequenceItemRowStyles", () => {
  const rowFor = (rexActivityEntry: ActivityEntry) =>
    getSequenceItemRowStyles({
      rexActivityEntry,
      isSelected: false,
      isHovered: false,
      isRexEva: true,
    });

  test("renders a complete row rather than in-progress green when both crews are done", () => {
    // The status checkbox shows complete for this entry, so the row must too.
    const { rowClassName } = rowFor({
      rexStatus: "in-progress",
      maestroPercentCompleteEv1: 100,
      maestroPercentCompleteEv2: 100,
    });
    expect(rowClassName).toBe(evaStyles.evaItemRexComplete);
  });

  test("keeps in-progress green while a crew member is still working", () => {
    const { rowClassName } = rowFor({
      rexStatus: "in-progress",
      maestroPercentCompleteEv1: 100,
      maestroPercentCompleteEv2: 0,
    });
    expect(rowClassName).toBe(evaStyles.evaItemRexInProgress);
  });

  test("renders a skipped row when skipped with both crews at 100%", () => {
    const skippedAtFullCompletion: ActivityEntry = {
      rexStatus: "skipped",
      maestroPercentCompleteEv1: 100,
      maestroPercentCompleteEv2: 100,
    };
    expect(rowFor(skippedAtFullCompletion).rowClassName).toBe(evaStyles.evaItemRexSkipped);
    const selectedRow = getSequenceItemRowStyles({
      rexActivityEntry: skippedAtFullCompletion,
      isSelected: true,
      isHovered: false,
      isRexEva: true,
    });
    expect(selectedRow.rowClassName).toBe(evaStyles.evaItemRexSkippedSelected);
  });

  test("still renders a complete row from rexStatus alone", () => {
    expect(rowFor({ rexStatus: "complete" }).rowClassName).toBe(evaStyles.evaItemRexComplete);
  });
});

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
