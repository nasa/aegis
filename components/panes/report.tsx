import { FunctionComponent } from "react";
import paneStyles from "./global-pane-styles.module.css";
import styles from "./report.module.css";
import "react-tooltip/dist/react-tooltip.css";
import { useDispatch } from "react-redux";
import { faCircleInfo, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { decodeEmoji } from "utils/formatting";
import { selectEVASequenceItem } from "store/cross-slice";

const Report_Panel: FunctionComponent<{
  reportItems: ReportItem[];
  evaReportItems?: EvaReportSequenceItem[];
  reportTitle: string;
}> = ({ reportItems, evaReportItems, reportTitle }) => {
  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>{reportTitle}</div>
      <div className={paneStyles.rightBodyBody}>
        {reportItems.length > 0 ? (
          <ReportItems reportItems={reportItems} />
        ) : (
          <div className={`${styles.noReportItem}`}>No report items</div>
        )}
        {evaReportItems && evaReportItems.length > 0 && (
          <>
            <div className={styles.evaReportSequenceTitle}>Stations and Traverses</div>
            {evaReportItems.map((evaReportSequenceItem, index) => {
              return (
                <div key={index}>
                  <ReportItems
                    key={index}
                    reportItems={evaReportSequenceItem.reportItems}
                    evaReportSequenceItem={evaReportSequenceItem}
                  />
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};

const ReportItems: FunctionComponent<{
  reportItems: ReportItem[];
  evaReportSequenceItem?: EvaReportSequenceItem;
}> = ({ reportItems, evaReportSequenceItem = null }) => {
  const dispatch = useDispatch();

  return (
    <div className={paneStyles.panelContainer}>
      <div className={paneStyles.panelSection}>
        {evaReportSequenceItem && (
          <div
            className={styles.evaReportSequenceItemName}
            onClick={() => {
              dispatch(selectEVASequenceItem({ sequenceItemUuid: evaReportSequenceItem.uuid }));
            }}
          >
            {evaReportSequenceItem.icon && decodeEmoji(evaReportSequenceItem.icon)}{" "}
            {evaReportSequenceItem.name}
          </div>
        )}
        <div className={styles.reportItems}>
          {reportItems.length > 0 ? (
            <>
              {reportItems.map((reportItem, index) => {
                let reportItemClass = styles.info;
                let reportItemIcon = faCircleInfo;
                if (reportItem.type === "warning") {
                  reportItemClass = styles.warning;
                  reportItemIcon = faTriangleExclamation;
                } else if (reportItem.type === "error") {
                  reportItemClass = styles.error;
                  reportItemIcon = faTriangleExclamation;
                }
                return (
                  <div key={index} className={styles.reportItem}>
                    <div className={`${styles.reportItemIcon} ${reportItemClass}`}>
                      <FontAwesomeIcon icon={reportItemIcon} size={"lg"} />
                    </div>
                    <div>{reportItem.message}</div>
                  </div>
                );
              })}
            </>
          ) : (
            <div className={`${styles.noReportItem}`}>No report items</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Report_Panel;
