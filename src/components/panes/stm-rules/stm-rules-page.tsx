import type { FunctionComponent } from "react";
import styles from "./stm-rules-page.module.css";
import { refEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { setStmRulesActiveTab } from "store/stm";
import { thunkCancelStmRuleByUuid } from "store/thunk/thunkStmRules";
import StmRulesTabRules from "./stm-rules-tab-rules";
import StmRulesTabMatches from "./stm-rules-tab-matches";

const TABS: { key: StmRulesTab; label: string }[] = [
  { key: "rules", label: "Rules" },
  { key: "matches", label: "Rule Matches" },
];

const StmRulesPage: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const activeTab = useAppSelector((state) => state.stm.stmRulesActiveTab, refEqual);
  const ruleEditingUuid = useAppSelector((state) => state.stm.ruleEditingUuid, refEqual);

  return (
    <div className={styles.body}>
      <div className={styles.panel}>
        <div className={styles.tabBar}>
          {TABS.map((tab) => (
            <div
              key={tab.key}
              className={tab.key === activeTab ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => {
                // revert any unsaved inline rule edit before navigating away, so the
                // Rule Matches/Coverage tabs never compute from unpersisted edits
                if (ruleEditingUuid) {
                  dispatch(thunkCancelStmRuleByUuid({ stmRuleUuid: ruleEditingUuid }));
                }
                dispatch(setStmRulesActiveTab(tab.key));
              }}
            >
              {tab.label}
            </div>
          ))}
        </div>
        {activeTab === "rules" && <StmRulesTabRules />}
        {activeTab === "matches" && <StmRulesTabMatches />}
      </div>
    </div>
  );
};

export default StmRulesPage;
