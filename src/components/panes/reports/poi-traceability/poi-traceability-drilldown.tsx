import type { FunctionComponent } from "react";
import { useState } from "react";
import styles from "./poi-traceability.module.css";
import { refEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { poiTraceSetDrilldownWidth, poiTraceSetSelectedPoi } from "store/report";
import { useMissionDocSelector } from "utils/useDocSelector";
import { getAsPlannedEvaFromRefUuid } from "store/selectors";
import { EmojiRenderer } from "components/interface/emojis";
import ReportSidePanel from "../shared/report-side-panel";

type DrilldownTab = "linkedStations" | "actionTraces";

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
  const [activeTab, setActiveTab] = useState<DrilldownTab>("linkedStations");

  // In an executed scope the in-scope EVAs are REX EVAs; resolve their
  // as-planned counterpart so the panel shows the plan's EVA name, not the REX
  // copy's. In every other scope the EVA already is as-planned (same name).
  const evaName = (evaUuid: string) => {
    if (!mission) return "(deleted EVA)";
    const eva = mission.evas?.[evaUuid];
    if (!eva) return "(deleted EVA)";
    return getAsPlannedEvaFromRefUuid(mission, eva.refUuid)?.name ?? eva.name;
  };

  // In-scope links first so the count in the master table's "n / m" column lines
  // up with the top of this list; out-of-scope station variants sink below.
  const linkedStations = [...row.linkedStations].sort(
    (a, b) => Number(b.inScopeEvaUuids.length > 0) - Number(a.inScopeEvaUuids.length > 0)
  );

  return (
    <ReportSidePanel
      width={width ?? 360}
      onWidthChange={(next) => dispatch(poiTraceSetDrilldownWidth(next))}
      onClose={() => dispatch(poiTraceSetSelectedPoi(null))}
      title={row.name}
      subtitle={`${row.promotedActionCount} of ${row.totalPoiActionCount} actions promoted · ${row.linkedStationCount} of ${row.linkedStations.length} linked stations in scope`}
    >
      <div className={styles.tabBar}>
        <div
          className={
            activeTab === "linkedStations" ? `${styles.tab} ${styles.tabActive}` : styles.tab
          }
          onClick={() => setActiveTab("linkedStations")}
        >
          Linked Stations
        </div>
        <div
          className={
            activeTab === "actionTraces" ? `${styles.tab} ${styles.tabActive}` : styles.tab
          }
          onClick={() => setActiveTab("actionTraces")}
        >
          POI Action Traces
        </div>
      </div>

      {activeTab === "linkedStations" && (
        <>
          <div className={styles.sectionCaption}>
            Every station whose POI list includes this POI. Each line shows whether that station is
            used by an EVA in the selected scope.
          </div>
          {row.linkedStations.length === 0 ? (
            <div className={styles.lineageEmpty}>
              No stations link this POI (via station POI list).
            </div>
          ) : (
            linkedStations.map((station) => (
              <div key={station.stationUuid} className={styles.lineageCopy}>
                <div className={styles.lineageCopyHeader}>
                  <span className={styles.lineageStationName}>
                    <span className={styles.lineageStationIcon}>
                      <EmojiRenderer iconValue={station.stationIcon || "2754"} />
                    </span>
                    {station.stationName}
                  </span>
                </div>
                <div className={styles.lineageMeta}>
                  {station.inScopeEvaUuids.length === 0
                    ? "not in any in-scope EVA"
                    : `in ${station.inScopeEvaUuids.map(evaName).join(", ")}`}
                </div>
              </div>
            ))
          )}
        </>
      )}

      {activeTab === "actionTraces" && (
        <>
          <div className={styles.sectionCaption}>
            Each action authored on this POI, and the station or traverse copies it was promoted
            into within the selected scope (with the copy date, the EVAs they land in, and — in an
            executed scope — each REX&apos;s status).
          </div>
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
                        {copy.stationName != null && (
                          <span className={styles.lineageStationIcon}>
                            <EmojiRenderer iconValue={copy.stationIcon || "2754"} />
                          </span>
                        )}
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
        </>
      )}
    </ReportSidePanel>
  );
};

export default PoiTraceabilityDrilldown;
