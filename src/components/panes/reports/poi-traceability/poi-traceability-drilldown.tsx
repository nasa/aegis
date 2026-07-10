import type { FunctionComponent } from "react";
import styles from "./poi-traceability.module.css";
import { refEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { poiTraceSetDrilldownWidth, poiTraceSetSelectedPoi } from "store/report";
import { useMissionDocSelector } from "utils/useDocSelector";
import ReportSidePanel from "../shared/report-side-panel";

const EXEC_CLASS: { [status in PoiTraceActionStatus]: string } = {
  complete: styles.execComplete,
  skipped: styles.execSkipped,
  pending: styles.execPending,
};

const formatCopyDate = (value: number | string | null): string => {
  if (value == null) return "";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
};

/**
 * Lineage side panel for one POI: each POI action, the station/traverse actions
 * it was promoted into (with the copy date and the in-scope EVAs they land in),
 * and — in an executed scope — the per-execution status. Also lists stations
 * linked via station.poiUuids so "linked but not promoted" is visible.
 */
const PoiTraceabilityDrilldown: FunctionComponent<{ row: PoiTraceRow }> = ({ row }) => {
  const dispatch = useAppDispatch();
  const mission = useMissionDocSelector((m) => m, refEqual);
  const width = useAppSelector((state) => state.report.poiTrace.drilldownWidth, refEqual);

  const evaName = (evaUuid: string) => mission?.evas?.[evaUuid]?.name ?? "(deleted EVA)";

  return (
    <ReportSidePanel
      width={width}
      onWidthChange={(next) => dispatch(poiTraceSetDrilldownWidth(next))}
      onClose={() => dispatch(poiTraceSetSelectedPoi(null))}
      title={row.name}
      subtitle={`${row.promotedActionCount} of ${row.totalPoiActionCount} actions promoted · linked to ${row.linkedStationCount} station(s)`}
    >
      <div className={styles.sectionLabel}>Linked stations</div>
      {row.linkedStations.length === 0 ? (
        <div className={styles.lineageEmpty}>No stations link this POI (via station POI list).</div>
      ) : (
        row.linkedStations.map((station) => (
          <div key={station.stationUuid} className={styles.lineageCopy}>
            <div className={styles.lineageCopyHeader}>
              <span className={styles.lineageStationName}>{station.stationName}</span>
            </div>
            <div className={styles.lineageMeta}>
              {station.inScopeEvaUuids.length === 0
                ? "not in any in-scope EVA"
                : `in ${station.inScopeEvaUuids.map(evaName).join(", ")}`}
            </div>
          </div>
        ))
      )}

      <div className={styles.sectionLabel}>POI actions</div>
      {row.actions.length === 0 && (
        <div className={styles.lineageEmpty}>This POI has no actions.</div>
      )}
      {row.actions.map((action) => (
        <div key={action.poiActionUuid} className={styles.lineageAction}>
          <div className={styles.lineageActionName}>{action.name}</div>
          {action.stationCopies.length === 0 ? (
            <div className={styles.lineageEmpty}>Not promoted to any in-scope station.</div>
          ) : (
            action.stationCopies.map((copy) => (
              <div key={copy.stationActionUuid} className={styles.lineageCopy}>
                <div className={styles.lineageCopyHeader}>
                  <span className={styles.lineageStationName}>
                    {copy.stationName ?? copy.traverseName ?? "(unknown location)"}
                  </span>
                  {copy.parentCopyDate != null && (
                    <span className={styles.lineageMeta}>
                      {formatCopyDate(copy.parentCopyDate)}
                    </span>
                  )}
                </div>
                <div className={styles.lineageMeta}>
                  {copy.inScopeEvaUuids.length === 0
                    ? "not in any in-scope EVA"
                    : `in ${copy.inScopeEvaUuids.map(evaName).join(", ")}`}
                </div>
                {copy.executions.map((exec) => (
                  <div key={exec.rexUuid} className={styles.lineageExec}>
                    <span className={EXEC_CLASS[exec.status]}>{exec.status}</span>
                    <span className={styles.lineageMeta}>— {exec.rexName}</span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      ))}
    </ReportSidePanel>
  );
};

export default PoiTraceabilityDrilldown;
