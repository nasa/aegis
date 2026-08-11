/**
 * Tests for measureRuleColumnWidths (the pure sizing logic) and
 * useStmRuleColumnWidths (the hook that wires it to a mounted probe element).
 *
 * jsdom's canvas doesn't implement 2D text measurement, so
 * HTMLCanvasElement.prototype.getContext is mocked with a deterministic
 * measureText: width = text.length * CHAR_WIDTH. The mock never reads the
 * `font` argument, so a direct call to measureRuleColumnWidths with any font
 * string produces the same result as the hook's real (computed-style-derived)
 * font string — that equivalence is what the hook test relies on.
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import {
  measureRuleColumnWidths,
  useStmRuleColumnWidths,
} from "components/panes/stm-rules/stm-rule-column-widths";
import { generateBlankStmRule } from "store/storeUtils/stm";
import { DEFAULT_ACTION_DEFINITION_LABELS } from "store/storeUtils/mission";

const CHAR_WIDTH = 10;
const MIN_WIDTH = 40;
const MAX_WIDTH = 320;
const BUFFER = 18;

const measureTextMock = vi.fn((text: string) => ({ width: text.length * CHAR_WIDTH }));

beforeEach(() => {
  measureTextMock.mockClear();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      ({
        measureText: measureTextMock,
        font: "",
      }) as unknown as CanvasRenderingContext2D
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

const actionDefinitions: ActionDefinitions = {
  verbs: {
    v1: { name: "AB", abbr: "AB" }, // 2 chars -> 20 + 18 = 38 -> floors to MIN_WIDTH
    v2: { name: "LongVerbName", abbr: "LVN" }, // 12 chars -> 120 + 18 = 138
  },
  nouns: {
    n1: { name: "Rock", abbr: "RCK" }, // 4 chars -> 40 + 18 = 58
  },
  adjectives: {
    a1: { name: "Basaltic", abbr: "BAS" }, // 8 chars -> 80 + 18 = 98
  },
};

const makeRule = (partial: Partial<STMRule>): STMRule => ({
  ...generateBlankStmRule({ stmUuid: "stm1" }),
  verbUuids: [],
  nounUuids: [],
  adjectiveUuids: [],
  ...partial,
});

describe("measureRuleColumnWidths", () => {
  test("floors every column to MIN_WIDTH when there are no rules", () => {
    const widths = measureRuleColumnWidths(
      [],
      actionDefinitions,
      DEFAULT_ACTION_DEFINITION_LABELS,
      "14px Inter"
    );
    expect(widths).toEqual({
      verbWidth: MIN_WIDTH,
      nounWidth: MIN_WIDTH,
      adjectiveWidth: MIN_WIDTH,
    });
  });

  test("measures each column from its own selected action definition names", () => {
    const rule = makeRule({ verbUuids: ["v1"], nounUuids: ["n1"], adjectiveUuids: ["a1"] });
    const widths = measureRuleColumnWidths(
      [rule],
      actionDefinitions,
      DEFAULT_ACTION_DEFINITION_LABELS,
      "14px Inter"
    );
    expect(widths).toEqual({
      verbWidth: MIN_WIDTH, // "AB": 2*10+18=38 -> floored to 40
      nounWidth: 4 * CHAR_WIDTH + BUFFER, // "Rock": 58
      adjectiveWidth: 8 * CHAR_WIDTH + BUFFER, // "Basaltic": 98
    });
  });

  test("does not let a wide value in one column affect the others", () => {
    const rule = makeRule({ verbUuids: ["v2"], nounUuids: ["n1"] });
    const widths = measureRuleColumnWidths(
      [rule],
      actionDefinitions,
      DEFAULT_ACTION_DEFINITION_LABELS,
      "14px Inter"
    );
    expect(widths.verbWidth).toBe(12 * CHAR_WIDTH + BUFFER);
    expect(widths.nounWidth).toBe(4 * CHAR_WIDTH + BUFFER);
    // adjectiveUuids is empty on this rule -> falls back to the placeholder,
    // not MIN_WIDTH; the point of this test is verb/noun stay independent.
    expect(widths.adjectiveWidth).toBe(20 * CHAR_WIDTH + BUFFER);
  });

  test("uses the '<Any X>' label when the any flag is set, ignoring selected uuids", () => {
    const rule = makeRule({ verbAny: true, verbUuids: ["v1"] });
    const widths = measureRuleColumnWidths(
      [rule],
      actionDefinitions,
      DEFAULT_ACTION_DEFINITION_LABELS,
      "14px Inter"
    );
    // "<Any Verb>" is 10 chars
    expect(widths.verbWidth).toBe(10 * CHAR_WIDTH + BUFFER);
  });

  test("uses the placeholder text when no uuids are selected and any is false", () => {
    const rule = makeRule({});
    const widths = measureRuleColumnWidths(
      [rule],
      actionDefinitions,
      DEFAULT_ACTION_DEFINITION_LABELS,
      "14px Inter"
    );
    // "...Select Verbs" is 15 chars
    expect(widths.verbWidth).toBe(15 * CHAR_WIDTH + BUFFER);
    // "...Select Nouns" is 15 chars
    expect(widths.nounWidth).toBe(15 * CHAR_WIDTH + BUFFER);
    // "...Select Adjectives" is 20 chars
    expect(widths.adjectiveWidth).toBe(20 * CHAR_WIDTH + BUFFER);
  });

  test("skips uuids that no longer resolve to an action definition", () => {
    const rule = makeRule({ verbUuids: ["deleted-uuid"] });
    const widths = measureRuleColumnWidths(
      [rule],
      actionDefinitions,
      DEFAULT_ACTION_DEFINITION_LABELS,
      "14px Inter"
    );
    // no candidate strings survive -> measured max is 0 -> floors to MIN_WIDTH
    expect(widths.verbWidth).toBe(MIN_WIDTH);
  });

  test("uses the widest candidate across all rules, not the sum", () => {
    const shortRule = makeRule({ verbUuids: ["v1"] });
    const longRule = makeRule({ verbUuids: ["v2"] });
    const widths = measureRuleColumnWidths(
      [shortRule, longRule],
      actionDefinitions,
      DEFAULT_ACTION_DEFINITION_LABELS,
      "14px Inter"
    );
    expect(widths.verbWidth).toBe(12 * CHAR_WIDTH + BUFFER);
  });

  test("caps a pathologically long name at MAX_WIDTH", () => {
    const longDefinitions: ActionDefinitions = {
      verbs: { v1: { name: "X".repeat(50), abbr: "X" } },
      nouns: {},
      adjectives: {},
    };
    const rule = makeRule({ verbUuids: ["v1"] });
    const widths = measureRuleColumnWidths(
      [rule],
      longDefinitions,
      DEFAULT_ACTION_DEFINITION_LABELS,
      "14px Inter"
    );
    expect(widths.verbWidth).toBe(MAX_WIDTH);
  });

  test("returns the floored defaults when a 2D canvas context is unavailable", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const rule = makeRule({ verbUuids: ["v2"] });
    const widths = measureRuleColumnWidths(
      [rule],
      actionDefinitions,
      DEFAULT_ACTION_DEFINITION_LABELS,
      "14px Inter"
    );
    expect(widths).toEqual({
      verbWidth: MIN_WIDTH,
      nounWidth: MIN_WIDTH,
      adjectiveWidth: MIN_WIDTH,
    });
  });

  test("measures custom category labels for empty and any rule sets", () => {
    const customLabels: Mission["actionDefinitionLabels"] = {
      verb: { singular: "Task", plural: "Tasks" },
      noun: { singular: "Focus", plural: "Foci" },
      adjective: { singular: "Context", plural: "Contexts" },
    };
    const rule = makeRule({ verbAny: true });

    const widths = measureRuleColumnWidths([rule], actionDefinitions, customLabels, "14px Inter");

    expect(widths.verbWidth).toBe(10 * CHAR_WIDTH + BUFFER); // "<Any Task>"
    expect(widths.nounWidth).toBe(14 * CHAR_WIDTH + BUFFER); // "...Select Foci"
    expect(widths.adjectiveWidth).toBe(18 * CHAR_WIDTH + BUFFER); // "...Select Contexts"
  });
});

describe("useStmRuleColumnWidths", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test("measures widths from the mounted probe element on mount", () => {
    const rules = [makeRule({ verbUuids: ["v2"], nounUuids: ["n1"], adjectiveUuids: ["a1"] })];
    let latestWidths: { verbWidth: number; nounWidth: number; adjectiveWidth: number } | undefined;

    function Harness(): React.ReactElement {
      const { widths, fontRef } = useStmRuleColumnWidths(
        rules,
        actionDefinitions,
        DEFAULT_ACTION_DEFINITION_LABELS
      );
      latestWidths = widths;
      return React.createElement("div", { ref: fontRef });
    }

    act(() => {
      root.render(React.createElement(Harness));
    });

    // The mock measureText ignores the font string, so this is directly comparable.
    const expected = measureRuleColumnWidths(
      rules,
      actionDefinitions,
      DEFAULT_ACTION_DEFINITION_LABELS,
      "unused"
    );
    expect(latestWidths).toEqual(expected);
  });

  test("returns MIN_WIDTH for every column while actionDefinitions is null", () => {
    let latestWidths: { verbWidth: number; nounWidth: number; adjectiveWidth: number } | undefined;

    function Harness(): React.ReactElement {
      const { widths, fontRef } = useStmRuleColumnWidths(
        [makeRule({})],
        null,
        DEFAULT_ACTION_DEFINITION_LABELS
      );
      latestWidths = widths;
      return React.createElement("div", { ref: fontRef });
    }

    act(() => {
      root.render(React.createElement(Harness));
    });

    expect(latestWidths).toEqual({
      verbWidth: MIN_WIDTH,
      nounWidth: MIN_WIDTH,
      adjectiveWidth: MIN_WIDTH,
    });
  });

  test("re-measures when the rules change", () => {
    let latestWidths: { verbWidth: number; nounWidth: number; adjectiveWidth: number } | undefined;

    function Harness({ rules }: { rules: STMRule[] }): React.ReactElement {
      const { widths, fontRef } = useStmRuleColumnWidths(
        rules,
        actionDefinitions,
        DEFAULT_ACTION_DEFINITION_LABELS
      );
      latestWidths = widths;
      return React.createElement("div", { ref: fontRef });
    }

    act(() => {
      root.render(React.createElement(Harness, { rules: [makeRule({ verbUuids: ["v1"] })] }));
    });
    expect(latestWidths?.verbWidth).toBe(MIN_WIDTH);

    act(() => {
      root.render(React.createElement(Harness, { rules: [makeRule({ verbUuids: ["v2"] })] }));
    });
    expect(latestWidths?.verbWidth).toBe(12 * CHAR_WIDTH + BUFFER);
  });
});
