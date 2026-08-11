import { useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { getActionDefinitionLabel } from "store/selectors";

/**
 * Measures the pixel width needed by each satisfaction-rule word column
 * (verb / noun / adjective) so every row can be sized to the *widest actual
 * entry in that column across the whole table*, rather than the legacy
 * equal-thirds `flex: 1` layout. Freeing that space lets the Action Matches
 * column grow and wrap less.
 */

type RuleColumnWidths = { verbWidth: number; nounWidth: number; adjectiveWidth: number };

/** Extra px added to the measured text: `.stmRuleSet` padding (10) + verb margin (5) + rounding. */
const BUFFER = 18;
const MIN_WIDTH = 40;
/** Safety cap so a single pathologically long name can't blow out the layout. */
const MAX_WIDTH = 320;

const EMPTY_WIDTHS: RuleColumnWidths = {
  verbWidth: MIN_WIDTH,
  nounWidth: MIN_WIDTH,
  adjectiveWidth: MIN_WIDTH,
};

// A single reused offscreen canvas for text measurement.
let measureCanvas: HTMLCanvasElement | null = null;
function getMeasureContext(): CanvasRenderingContext2D | null {
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  return measureCanvas.getContext("2d");
}

/** Builds a canvas `font` shorthand from an element's computed style. */
function fontStringFrom(el: Element): string {
  const cs = getComputedStyle(el);
  const style = cs.fontStyle || "normal";
  const weight = cs.fontWeight || "400";
  const size = cs.fontSize || "16px";
  const family = cs.fontFamily || "sans-serif";
  return `${style} ${weight} ${size} ${family}`;
}

/**
 * All strings that could render in one column, mirroring the display logic in
 * `STMRuleSet` (stm-rules-rules.tsx): `<Any Verb>` when the "any" flag is set,
 * each selected definition name otherwise, or the "...Select Verbs" placeholder.
 */
function candidateStringsForType(
  rules: STMRule[],
  actionDefinitions: ActionDefinitions,
  actionDefinitionLabels: Mission["actionDefinitionLabels"],
  type: ActionDefinitionType
): string[] {
  const singular = type.slice(0, -1);
  const anyKey = `${singular}Any` as "verbAny" | "nounAny" | "adjectiveAny";
  const uuidsKey = `${singular}Uuids` as "verbUuids" | "nounUuids" | "adjectiveUuids";
  const anyLabel = `<Any ${getActionDefinitionLabel({ actionDefinitionLabels }, type)}>`;
  const placeholder = `...Select ${getActionDefinitionLabel(
    { actionDefinitionLabels },
    type,
    "plural"
  )}`;

  const strings: string[] = [];
  for (const rule of rules) {
    if (rule[anyKey]) {
      strings.push(anyLabel);
      continue;
    }
    const uuids = rule[uuidsKey];
    if (uuids.length === 0) {
      strings.push(placeholder);
      continue;
    }
    for (const uuid of uuids) {
      const item = actionDefinitions[type]?.[uuid];
      if (item) strings.push(item.name);
    }
  }
  return strings;
}

export function measureRuleColumnWidths(
  rules: STMRule[],
  actionDefinitions: ActionDefinitions,
  actionDefinitionLabels: Mission["actionDefinitionLabels"],
  fontString: string
): RuleColumnWidths {
  const ctx = getMeasureContext();
  if (!ctx) return EMPTY_WIDTHS;
  ctx.font = fontString;

  const measure = (strings: string[]): number => {
    let max = 0;
    for (const s of strings) {
      const w = ctx.measureText(s).width;
      if (w > max) max = w;
    }
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.ceil(max) + BUFFER));
  };

  return {
    verbWidth: measure(
      candidateStringsForType(rules, actionDefinitions, actionDefinitionLabels, "verbs")
    ),
    nounWidth: measure(
      candidateStringsForType(rules, actionDefinitions, actionDefinitionLabels, "nouns")
    ),
    adjectiveWidth: measure(
      candidateStringsForType(rules, actionDefinitions, actionDefinitionLabels, "adjectives")
    ),
  };
}

/**
 * Returns the measured column widths plus a `fontRef` to attach to a hidden
 * probe element styled like the rendered rule rows — its computed font is what
 * the measurement uses, so the numbers match on-screen text exactly. Re-measures
 * whenever the rules or definitions change, and again once web fonts finish
 * loading (Inter loads async).
 */
export function useStmRuleColumnWidths(
  rules: STMRule[],
  actionDefinitions: ActionDefinitions | null,
  actionDefinitionLabels: Mission["actionDefinitionLabels"]
): { widths: RuleColumnWidths; fontRef: RefObject<HTMLDivElement> } {
  const fontRef = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState<RuleColumnWidths>(EMPTY_WIDTHS);

  useLayoutEffect(() => {
    const el = fontRef.current;
    if (!el || !actionDefinitions) return;

    const compute = () => {
      const next = measureRuleColumnWidths(
        rules,
        actionDefinitions,
        actionDefinitionLabels,
        fontStringFrom(el)
      );
      setWidths((prev) =>
        prev.verbWidth === next.verbWidth &&
        prev.nounWidth === next.nounWidth &&
        prev.adjectiveWidth === next.adjectiveWidth
          ? prev
          : next
      );
    };

    compute();

    let cancelled = false;
    document.fonts?.ready.then(
      () => {
        if (!cancelled) compute();
      },
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [rules, actionDefinitions, actionDefinitionLabels]);

  return { widths, fontRef };
}
