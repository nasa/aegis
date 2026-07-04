import type { FunctionComponent } from "react";
import styles from "./stm-rules-page.module.css";
import { refEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { setStmRulesActiveTab } from "store/stm";
import StmRulesTabRules from "./stm-rules-tab-rules";
import StmRulesTabMatches from "./stm-rules-tab-matches";
import StmCoveragePage from "./stm-rules-coverage/stm-rules-coverage-page";

const TABS: { key: StmRulesTab; label: string }[] = [
  { key: "rules", label: "Rules" },
  { key: "matches", label: "Rule Matches" },
  { key: "coverage", label: "EVA Coverage" },
];

const StmRulesPage: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const activeTab = useAppSelector((state) => state.stm.stmRulesActiveTab, refEqual);

  return (
    <div className={styles.body}>
      <div className={styles.panel}>
        <div className={styles.tabBar}>
          {TABS.map((tab) => (
            <div
              key={tab.key}
              className={tab.key === activeTab ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => dispatch(setStmRulesActiveTab(tab.key))}
            >
              {tab.label}
            </div>
          ))}
        </div>
        {activeTab === "rules" && <StmRulesTabRules />}
        {activeTab === "matches" && <StmRulesTabMatches />}
        {activeTab === "coverage" && <StmCoveragePage />}
      </div>
    </div>
  );
};

export default StmRulesPage;
