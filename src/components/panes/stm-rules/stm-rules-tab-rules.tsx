import type { CSSProperties, FunctionComponent } from "react";
import styles from "./stm-rules-page.module.css";
import tableStyles from "./stm-rules-list-table.module.css";
import STMRulesTable from "./stm-rules-list-table";
import { deepEqual, refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import {
  StmTierTitle,
  useStmTierExpansion,
  STM_LEVEL3_NAME_COLUMN_WIDTH,
} from "./stm-rules-tier-titles";
import { useStmRuleColumnWidths } from "./stm-rule-column-widths";

/**
 * "Rules" tab: STM hierarchy with per-level3 satisfaction rules and inline
 * rule editing.
 */
const StmRulesTabRules: FunctionComponent = () => {
  const { stmLevel1Enabled, tierColumns } = useStmTierExpansion();
  const stmLevel3Name = useMissionDocSelector((mission) => mission.stmLevel3Name, refEqual);
  const rules = useAppSelector((state) => state.stm.rules, shallowEqual);
  const actionDefinitions = useMissionDocSelector(
    (mission) => mission.actionDefinitions,
    deepEqual
  );
  const { widths, fontRef } = useStmRuleColumnWidths(rules, actionDefinitions);

  const widthVars = {
    "--stmVerbColWidth": `${widths.verbWidth}px`,
    "--stmNounColWidth": `${widths.nounWidth}px`,
    "--stmAdjectiveColWidth": `${widths.adjectiveWidth}px`,
    // count + two conjunctions + paddings, so the header labels line up roughly.
    "--stmRulesRegionWidth": `calc(var(--stmVerbColWidth) + var(--stmNounColWidth) + var(--stmAdjectiveColWidth) + 90px)`,
  } as CSSProperties;

  return (
    <div className={styles.rulesTabWrapper} style={widthVars}>
      <div ref={fontRef} className={`${tableStyles.stmTables} ${styles.fontProbe}`} />
      <div
        className={styles.listHeaderTitles}
        style={{
          gridTemplateColumns: [...tierColumns, `${STM_LEVEL3_NAME_COLUMN_WIDTH}px`, "auto"].join(
            " "
          ),
        }}
      >
        {stmLevel1Enabled && <StmTierTitle tier="level1" />}
        <StmTierTitle tier="level2" />
        <div className={styles.listTableTitle}>{stmLevel3Name}s</div>
        <div className={styles.listTableRuleTitleContainer}>
          <div
            className={styles.listTableTitle}
            style={{ flex: "0 0 auto", width: "var(--stmRulesRegionWidth)" }}
          >
            Satisfaction Rules
          </div>
          <div className={styles.listTableTitle} style={{ flex: "1 1 auto" }}>
            Action Matches
          </div>
        </div>
      </div>
      <div className={styles.panelBottom}>
        <STMRulesTable />
      </div>
    </div>
  );
};

export default StmRulesTabRules;
