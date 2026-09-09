import type { FunctionComponent } from "react";
import paneStyles from "./global-pane-styles.module.css";

const CalculatedDwell: FunctionComponent<{
  actionsCalculatedFields: ActionsCalculatedFields;
}> = ({ actionsCalculatedFields }) => {
  return (
    actionsCalculatedFields && (
      <>
        <div className={paneStyles.panelColumnTableRow}>
          <div
            className={`${paneStyles.panelColumnTableCell} ${paneStyles.panelColumnTableCellLeftSurround}`}
          >
            <div
              className={paneStyles.displayFieldLabel}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-content="Time spent at station"
            >
              Dwell Time (mins):
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
              data-tooltip-content={
                actionsCalculatedFields.totalUnassignedTime > 0
                  ? "Crew assignments incomplete"
                  : undefined
              }
            >
              {actionsCalculatedFields.totalDwellTime === 0 &&
              actionsCalculatedFields.totalUnassignedTime !== 0 ? (
                <>Incompl.</>
              ) : (
                <>{Math.ceil(actionsCalculatedFields.totalDwellTime) || "0"}</>
              )}
            </div>
          </div>
        </div>
        <div className={paneStyles.panelColumnTableRow}>
          <div className={paneStyles.panelColumnTableCell}>
            <div
              className={paneStyles.displayFieldLabel}
              style={{ paddingLeft: "10px" }}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-content="Total time of EV1's assigned actions"
            >
              EV1 Action Time (mins):
            </div>
          </div>
          <div className={paneStyles.panelColumnTableCell}>
            <div className={paneStyles.displayFieldValue}>
              {actionsCalculatedFields.totalEv1Time === 0 &&
              actionsCalculatedFields.totalUnassignedTime !== 0 ? (
                <>Incompl.</>
              ) : (
                <>{Math.ceil(actionsCalculatedFields.totalEv1Time) || "0"}</>
              )}
            </div>
          </div>
        </div>
        <div className={paneStyles.panelColumnTableRow}>
          <div className={paneStyles.panelColumnTableCell}>
            <div
              className={paneStyles.displayFieldLabel}
              style={{ paddingLeft: "10px" }}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-content="Total time of EV2's assigned actions"
            >
              EV2 Action Time (mins):
            </div>
          </div>
          <div className={paneStyles.panelColumnTableCell}>
            <div className={paneStyles.displayFieldValue}>
              {actionsCalculatedFields.totalEv2Time === 0 &&
              actionsCalculatedFields.totalUnassignedTime !== 0 ? (
                <>Incompl.</>
              ) : (
                <>{Math.ceil(actionsCalculatedFields.totalEv2Time) || "0"}</>
              )}
            </div>
          </div>
        </div>
      </>
    )
  );
};

export default CalculatedDwell;
