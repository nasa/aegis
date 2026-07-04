import type { FunctionComponent } from "react";
import styles from "./stm-rules-page.module.css";
import STMRulesTable from "./stm-rules-list-table";
import { refEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { StmTierTitle, useStmTierExpansion } from "./stm-rules-tier-titles";

/**
 * "Rules" tab: STM hierarchy with per-level3 satisfaction rules and inline
 * rule editing.
 */
const StmRulesTabRules: FunctionComponent = () => {
  const { stmLevel1Enabled, tierColumns } = useStmTierExpansion();
  const stmLevel3Name = useMissionDocSelector((mission) => mission.stmLevel3Name, refEqual);

  return (
    <>
      <div
        className={styles.listHeaderTitles}
        style={{ gridTemplateColumns: [...tierColumns, "285px", "auto"].join(" ") }}
      >
        {stmLevel1Enabled && <StmTierTitle tier="level1" />}
        <StmTierTitle tier="level2" />
        <div className={styles.listTableTitle}>{stmLevel3Name}s</div>
        <div className={styles.listTableRuleTitleContainer}>
          <div className={styles.listTableTitle} style={{ flex: "1 1 auto" }}>
            Satisfaction Rules
          </div>
          <div className={styles.listTableTitle} style={{ flex: "0 0 240px" }}>
            Action Matches
          </div>
        </div>
      </div>
      <div className={styles.panelBottom}>
        <STMRulesTable />
      </div>
    </>
  );
};

export default StmRulesTabRules;
