import type { FunctionComponent } from "react";
import styles from "./poi-traceability.module.css";
import { useAppDispatch } from "utils/useAppDispatch";
import { poiTraceSetSelectedPoi } from "store/report";

/**
 * Master table of the POI Traceability report: one row per POI with the factual
 * rollup columns, all computed against the selected Scope. "Linked but no
 * actions copied" (linkedStations > 0, promoted = 0) and "actions copied but not
 * linked" (promoted > 0, linked = 0) are the science team's key mismatch cases,
 * so those counts are shown side by side; a POI with neither is dimmed as the
 * "not in scope" row.
 *
 * `showExecutionColumns` reveals the Complete / Skipped columns, which only
 * carry data in an executed campaign scope (there are no REX statuses to roll up
 * otherwise), so they stay hidden — and the grid stays tight — in every other
 * scope.
 */
const PoiTraceabilityTable: FunctionComponent<{
  rows: PoiTraceRow[];
  selectedPoiUuid: string | null;
  showExecutionColumns: boolean;
}> = ({ rows, selectedPoiUuid, showExecutionColumns }) => {
  const dispatch = useAppDispatch();

  if (rows.length === 0) {
    return <div className={styles.emptyState}>No POIs match the current filter.</div>;
  }

  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th data-tooltip-id="aegis-tooltip" data-tooltip-html="The point of interest">
              POI
            </th>
            <th
              className={styles.num}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-html="Stations linked to this POI (via the station's POI list).<br/>Shown as <b>in&nbsp;scope / total</b> — 'in scope' = the station appears in at&nbsp;least one EVA of the selected scope."
            >
              Linked stations
            </th>
            <th
              className={styles.num}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-html="This POI's actions that were copied onto a station or traverse used by the selected scope's EVAs.<br/>Shown as <b>promoted / total authored</b>."
            >
              Actions promoted
            </th>
            {showExecutionColumns && (
              <>
                <th
                  className={styles.num}
                  data-tooltip-id="aegis-tooltip"
                  data-tooltip-html="Promoted actions marked complete across the scope's execution REXes"
                >
                  Complete
                </th>
                <th
                  className={styles.num}
                  data-tooltip-id="aegis-tooltip"
                  data-tooltip-html="Promoted actions marked skipped across the scope's execution REXes"
                >
                  Skipped
                </th>
              </>
            )}
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
                <td
                  className={`${styles.num} ${mismatch ? styles.flagMismatch : ""}`}
                  data-tooltip-id="aegis-tooltip"
                  data-tooltip-html={`<b>${row.linkedStationCount}</b> of the <b>${row.linkedStations.length}</b> station(s) linked to this POI are used by an EVA within the selected scope`}
                >
                  {row.linkedStationCount} / {row.linkedStations.length}
                </td>
                <td
                  className={`${styles.num} ${mismatch ? styles.flagMismatch : ""}`}
                  data-tooltip-id="aegis-tooltip"
                  data-tooltip-html={`<b>${row.promotedActionCount}</b> of this POI's <b>${row.totalPoiActionCount}</b> authored action(s) were promoted into an in-scope station or traverse`}
                >
                  {row.promotedActionCount} / {row.totalPoiActionCount}
                </td>
                {showExecutionColumns && (
                  <>
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
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default PoiTraceabilityTable;
