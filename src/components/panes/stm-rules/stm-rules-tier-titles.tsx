import type { FunctionComponent } from "react";
import styles from "./stm-rules-page.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { stmRulesToggleTierExpansion } from "store/stm";
import { useMissionDocSelector } from "utils/useDocSelector";

/**
 * Pixel widths shared across the v2 STM tabs' JS layout code (grid-template-
 * columns strings, the Firefox writing-mode workaround in
 * reports/shared/report-column-header.tsx) and the CSS modules that also
 * hard-code them (stm-rules-list-table.module.css,
 * reports/shared/report-grid.module.css). Consumers
 * feed these into CSS custom properties rather than duplicating the numbers.
 */
export const STM_LEVEL3_NAME_COLUMN_WIDTH = 285;
export const STM_COVERAGE_STATION_CELL_WIDTH = 22;
export const STM_COVERAGE_SUMMARY_CELL_WIDTH = 40;
/**
 * EVA Comparison station/traverse sub-cells hold metric values (e.g. "1,367"),
 * not the small match counts of EVA STM Coverage, so they need the wider summary
 * width instead of the 22px count cell.
 */
export const EVA_COMPARISON_STATION_CELL_WIDTH = STM_COVERAGE_SUMMARY_CELL_WIDTH;

/**
 * Shared tier-expansion state for the v2 STM tabs (Rules and EVA Coverage).
 * Returns the per-tier grid column widths for the level1/level2 name columns so
 * headers and table rows stay aligned across both tabs.
 */
export const useStmTierExpansion = (): {
  tierExpansion: StmRulesTierExpansion;
  stmLevel1Enabled: boolean;
  tierColumns: string[];
} => {
  const tierExpansion = useAppSelector((state) => state.stm.stmRulesTierExpansion, deepEqual);
  const stmLevel1Enabled = useMissionDocSelector((mission) => mission.stmLevel1Enabled, refEqual);

  const tierColumns: string[] = [];
  if (stmLevel1Enabled) tierColumns.push(tierExpansion.level1 ? "155px" : "20px");
  tierColumns.push(tierExpansion.level2 ? "175px" : "20px");
  return { tierExpansion, stmLevel1Enabled: !!stmLevel1Enabled, tierColumns };
};

/**
 * Clickable column header for the level1/level2 tier columns. Clicking toggles
 * that tier between full names and bare ordinals (replaces the old top-left
 * expand/collapse button).
 */
export const StmTierTitle: FunctionComponent<{ tier: "level1" | "level2" }> = ({ tier }) => {
  const dispatch = useAppDispatch();
  const isExpanded = useAppSelector((state) => state.stm.stmRulesTierExpansion[tier], refEqual);
  const tierName = useMissionDocSelector(
    (mission) => (tier === "level1" ? mission.stmLevel1Name : mission.stmLevel2Name),
    refEqual
  );

  return (
    <div
      className={`${styles.listTableTitle} ${styles.tierTitleClickable}`}
      onClick={() => dispatch(stmRulesToggleTierExpansion(tier))}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html={`${isExpanded ? "Collapse" : "Expand"} ${tierName} column`}
    >
      <span>{isExpanded ? `${tierName}s` : `${tierName?.substring(0, 1)}.`}</span>
      <FontAwesomeIcon
        icon={isExpanded ? faChevronLeft : faChevronRight}
        className={styles.tierTitleChevron}
      />
    </div>
  );
};
