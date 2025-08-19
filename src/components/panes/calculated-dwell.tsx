import { FunctionComponent } from "react";
import paneStyles from "./global-pane-styles.module.css";

const CalculatedDwell: FunctionComponent<{
  actionsCalculatedFields: ActionsCalculatedFields;
}> = ({ actionsCalculatedFields }) => {
  return (
    actionsCalculatedFields && (
      <>
        <div className={paneStyles.panelColumnTableRow}>
          <div
            className={`${paneStyles.panelColumnTableCellLeft} ${paneStyles.panelColumnTableCellLeftSurround}`}
          >
            <div
              className={paneStyles.displayFieldLabel}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-html="Time spent at station(s)"
            >
              Total Dwell Time (mins):
            </div>
          </div>
          <div
            className={`${paneStyles.panelColumnTableCell} ${paneStyles.panelColumnTableCellRightSurround}`}
          >
            <div
              className={paneStyles.displayFieldValue}
              style={{
                color:
                  actionsCalculatedFields.totalUnassignedTime > 0 ? "var(--warning)" : undefined,
              }}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-html={
                actionsCalculatedFields.totalUnassignedTime > 0
                  ? "Crew assignments incomplete"
                  : undefined
              }
            >
              {actionsCalculatedFields.totalDwellTime === 0 &&
              actionsCalculatedFields.totalUnassignedTime !== 0 ? (
                <>Incompl.</>
              ) : (
                <>{Math.round(actionsCalculatedFields.totalDwellTime) || "0"}</>
              )}
            </div>
          </div>
        </div>
        <div className={paneStyles.panelColumnTableRow}>
          <div className={paneStyles.panelColumnTableCellLeft}>
            <div
              className={paneStyles.displayFieldLabel}
              style={{ paddingLeft: "10px" }}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-html="Total time EV1 assigned on actions"
            >
              Total EV1 Time (mins):
            </div>
          </div>
          <div className={paneStyles.panelColumnTableCell}>
            <div className={paneStyles.displayFieldValue}>
              {actionsCalculatedFields.totalEv1Time === 0 &&
              actionsCalculatedFields.totalUnassignedTime !== 0 ? (
                <>Incompl.</>
              ) : (
                <>{Math.round(actionsCalculatedFields.totalEv1Time) || "0"}</>
              )}
            </div>
          </div>
        </div>
        <div className={paneStyles.panelColumnTableRow}>
          <div className={paneStyles.panelColumnTableCellLeft}>
            <div
              className={paneStyles.displayFieldLabel}
              style={{ paddingLeft: "10px" }}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-html="Total time EV2 assigned on actions"
            >
              Total EV2 Time (mins):
            </div>
          </div>
          <div className={paneStyles.panelColumnTableCell}>
            <div className={paneStyles.displayFieldValue}>
              {actionsCalculatedFields.totalEv2Time === 0 &&
              actionsCalculatedFields.totalUnassignedTime !== 0 ? (
                <>Incompl.</>
              ) : (
                <>{Math.round(actionsCalculatedFields.totalEv2Time) || "0"}</>
              )}
            </div>
          </div>
        </div>
      </>
    )
  );
};

export default CalculatedDwell;
