import type { FunctionComponent } from "react";
import styles from "./poi-traceability.module.css";
import { useAppDispatch } from "utils/useAppDispatch";
import { poiTraceSetSelectedPoi } from "store/report";

/**
 * Master table of the POI Traceability report: one row per POI with the factual
 * rollup columns. "Linked but no actions copied" (linkedStations > 0, promoted
 * = 0) and "actions copied but not linked" (promoted > 0, linked = 0) are the
 * science team's key mismatch cases, so those counts are shown side by side; a
 * POI with neither is the "not yet hit" row, dimmed.
 */
const PoiTraceabilityTable: FunctionComponent<{
  rows: PoiTraceRow[];
  selectedPoiUuid: string | null;
}> = ({ rows, selectedPoiUuid }) => {
  const dispatch = useAppDispatch();

  if (rows.length === 0) {
    return <div className={styles.emptyState}>No POIs match the current filter.</div>;
  }

  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>POI</th>
            <th>Tags</th>
            <th className={styles.num}>Priority</th>
            <th className={styles.num}>Linked stations</th>
            <th className={styles.num}>Actions promoted</th>
            <th className={styles.num}>Planned in EVAs</th>
            <th className={styles.num}>Complete</th>
            <th className={styles.num}>Skipped</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const untouched = row.linkedStationCount === 0 && row.promotedActionCount === 0;
            // linked but nothing copied, or copied but not linked — the mismatch
            // the science team is hunting for
            const mismatch =
              (row.linkedStationCount > 0 && row.promotedActionCount === 0) ||
              (row.linkedStationCount === 0 && row.promotedActionCount > 0);
            return (
              <tr
                key={row.poiUuid}
                className={`${styles.row} ${untouched ? styles.rowUntouched : ""} ${
                  row.poiUuid === selectedPoiUuid ? styles.rowSelected : ""
                }`}
                onClick={() => dispatch(poiTraceSetSelectedPoi(row.poiUuid))}
              >
                <td className={styles.poiName}>{row.name}</td>
                <td className={styles.tags}>{row.tags.join(", ")}</td>
                <td className={styles.num}>{row.priorityOverride ?? ""}</td>
                <td className={`${styles.num} ${mismatch ? styles.flagMismatch : ""}`}>
                  {row.linkedStationCount}
                </td>
                <td className={`${styles.num} ${mismatch ? styles.flagMismatch : ""}`}>
                  {row.promotedActionCount} / {row.totalPoiActionCount}
                </td>
                <td className={styles.num}>{row.plannedEvaCount}</td>
                <td
                  className={`${styles.num} ${row.completeCount > 0 ? styles.countComplete : styles.countZero}`}
                >
                  {row.completeCount}
                </td>
                <td
                  className={`${styles.num} ${row.skippedCount > 0 ? styles.countSkipped : styles.countZero}`}
                >
                  {row.skippedCount}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default PoiTraceabilityTable;
