import type { FunctionComponent } from "react";
import { useState } from "react";
import styles from "../stm-rules/stm-rules-page.module.css";
import EvaStmCoveragePage from "./eva-stm-coverage/eva-stm-coverage-page";
import EvaComparisonPage from "./eva-comparison/eva-comparison-page";
import PoiTraceabilityPage from "./poi-traceability/poi-traceability-page";

type ReportsTab = "coverage" | "comparison" | "poiTrace";

const TABS: { key: ReportsTab; label: string }[] = [
  { key: "coverage", label: "EVA STM Coverage" },
  { key: "comparison", label: "EVA Comparison" },
  { key: "poiTrace", label: "POI Traceability" },
];

/**
 * Top-level Reports pane. Three tabs, each a self-contained report. EVA STM
 * Coverage and EVA Comparison are column-family reports sharing the grid
 * components in reports/shared/; POI Traceability is a POI-row report that
 * reuses the shared campaign/scope resolution and drilldown side panel.
 */
const ReportsPage: FunctionComponent = () => {
  const [activeTab, setActiveTab] = useState<ReportsTab>("coverage");

  return (
    <div className={styles.body}>
      <div className={styles.panel}>
        <div className={styles.tabBar}>
          {TABS.map((tab) => (
            <div
              key={tab.key}
              className={tab.key === activeTab ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </div>
          ))}
        </div>
        {activeTab === "coverage" && <EvaStmCoveragePage />}
        {activeTab === "comparison" && <EvaComparisonPage />}
        {activeTab === "poiTrace" && <PoiTraceabilityPage />}
      </div>
    </div>
  );
};

export default ReportsPage;
