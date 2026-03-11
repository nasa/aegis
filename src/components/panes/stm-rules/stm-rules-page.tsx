import { FunctionComponent } from "react";
import styles from "./stm-rules-page.module.css";
import STMRulesTable from "./stm-rules-list-table";
import { refEqual, deepEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import {
  stmViewSetHoveredTopItem,
  stmViewSetHoveredLeftItem,
  stmViewToggleExpandTopTiers,
} from "store/stm";
import { Button } from "components/interface/form/globalFields";
import { faArrowsLeftRightToLine } from "@fortawesome/free-solid-svg-icons";
import { useMissionDocSelector } from "utils/useDocSelector";

const StmViewerPage: FunctionComponent = () => {
  const stmViewExpandTopTiers = useAppSelector(
    (state) => state.stm.stmViewExpandTopTiers,
    refEqual
  );
  const partialMission = useMissionDocSelector(
    (doc) => ({
      stmLevel1Name: doc.stmLevel1Name,
      stmLevel2Name: doc.stmLevel2Name,
      stmLevel3Name: doc.stmLevel3Name,
      stmLevel1Enabled: doc.stmLevel1Enabled,
    }),
    deepEqual
  );

  const dispatch = useAppDispatch();
  return (
    <div className={styles.body}>
      <div className={styles.panel}>
        <div className={styles.panelTop}>
          <div
            className={stmViewExpandTopTiers ? styles.panelTopExpanded : styles.panelTopCollapsed}
          >
            <div className={styles.selectionControls}>
              <div className={styles.selectionControlsLeft}>
                <div className={styles.buttonsContainer}>
                  <Button
                    icon={faArrowsLeftRightToLine}
                    onClick={() => {
                      dispatch(stmViewToggleExpandTopTiers());
                    }}
                    toolTip="Expand/Collapse STM Tiers"
                    style={{
                      width: "32px",
                      height: "28px",
                      fontSize: "0.8em",
                      paddingLeft: "8px",
                      marginTop: "2px",
                    }}
                  />
                </div>
              </div>
            </div>
            {stmViewExpandTopTiers ? (
              <div
                className={
                  partialMission.stmLevel1Enabled
                    ? styles.listTableTitlesExpanded
                    : styles.listTableTier1DisabledTitlesExpanded
                }
              >
                {partialMission.stmLevel1Enabled && (
                  <div className={styles.listTableTitle}>{`${partialMission.stmLevel1Name}s`}</div>
                )}
                <div className={styles.listTableTitle}>{partialMission.stmLevel2Name}s</div>
                <div className={styles.listTableTitle}>{partialMission.stmLevel3Name}s</div>
                <div className={styles.listTableRuleTitleContainer}>
                  <div className={styles.listTableTitle} style={{ flex: "1 1 auto" }}>
                    Satisfaction Rules
                  </div>
                  <div className={styles.listTableTitle} style={{ flex: "0 0 180px" }}>
                    Action Matches
                  </div>
                </div>
              </div>
            ) : (
              <div
                className={
                  partialMission.stmLevel1Enabled
                    ? styles.listTableTitlesCollapsed
                    : styles.listTableTier1DisabledTitlesCollapsed
                }
              >
                {partialMission.stmLevel1Enabled && (
                  <div className={styles.listTableTitle}>
                    {partialMission.stmLevel1Name.substring(0, 1)}.
                  </div>
                )}
                <div className={styles.listTableTitle}>
                  {partialMission.stmLevel2Name.substring(0, 1)}.
                </div>
                <div className={styles.listTableTitle}>{partialMission.stmLevel3Name}s</div>
                <div className={styles.listTableRuleTitleContainer}>
                  <div className={styles.listTableTitle} style={{ flex: "1 1 auto" }}>
                    Satisfaction Rules
                  </div>
                  <div className={styles.listTableTitle} style={{ flex: "0 0 180px" }}>
                    Action Matches
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div
          className={styles.panelBottom}
          onMouseLeave={() => {
            dispatch(stmViewSetHoveredTopItem(null));
            dispatch(stmViewSetHoveredLeftItem(null));
          }}
        >
          <STMRulesTable />
        </div>
      </div>
    </div>
  );
};

export default StmViewerPage;
