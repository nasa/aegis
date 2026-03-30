import { getAlertColor, isModified, makeTraverseRateString } from "utils/component-helpers";

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
