import type { FunctionComponent } from "react";
import styles from "./poi-traceability.module.css";
import { useAppDispatch } from "utils/useAppDispatch";
import { poiTraceSetSelectedPoi } from "store/report";
import TraceIcon from "./trace-icon";
import PoiTraceabilityHelp from "./poi-traceability-help";

/** Compact POI navigation; counts always refer to distinct source actions. */
const PoiTraceabilityTable: FunctionComponent<{
  rows: PoiTraceRow[];
  selectedPoiUuid: string | null;
  mission: Mission;
}> = ({ rows, selectedPoiUuid, mission }) => {
  const dispatch = useAppDispatch();

  return (
    <nav className={styles.poiList} aria-label="Points of interest">
      <div className={styles.listHeader}>
        POIs
        <span className={styles.listHeaderTools}>
          <span>{rows.length}</span>
          <PoiTraceabilityHelp />
        </span>
      </div>
      {rows.length === 0 && <div className={styles.emptyState}>No POIs in this mission.</div>}
      {rows.map((row) => {
        const completed = row.actions.filter((action) =>
          action.stationCopies.some((copy) =>
            copy.executions.some((execution) => execution.status === "complete")
          )
        ).length;
        return (
          <button
            type="button"
            key={row.poiUuid}
            className={`${styles.poiButton} ${row.poiUuid === selectedPoiUuid ? styles.poiSelected : ""}`}
            aria-current={row.poiUuid === selectedPoiUuid ? "true" : "false"}
            onClick={() => dispatch(poiTraceSetSelectedPoi(row.poiUuid))}
          >
            <strong>
              <TraceIcon icon={mission.pois[row.poiUuid]?.icon} />
              {row.name}
            </strong>
            <span className={styles.meta}>
              {row.promotedActionCount}/{row.actions.length} actions adopted / {completed} completed
            </span>
          </button>
        );
      })}
    </nav>
  );
};

export default PoiTraceabilityTable;
