import type { FunctionComponent } from "react";
import { useMemo } from "react";
import styles from "./poi-traceability.module.css";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { computePoiTraceability } from "utils/poiTraceability";
import PoiTraceabilityTable from "./poi-traceability-table";
import PoiTraceabilityDrilldown from "./poi-traceability-drilldown";

/** POI navigation and an action tree with adoption and execution together. */
const PoiTraceabilityPage: FunctionComponent = () => {
  const mission = useMissionDocSelector((m) => m, refEqual);
  const revision = useMissionDocSelector(
    (m) => ({
      pois: m?.pois,
      stations: m?.stations,
      traverses: m?.traverses,
      evas: m?.evas,
      rexes: m?.rexes,
      actions: m?.actions,
    }),
    shallowEqual
  );
  const selectedPoiUuid = useAppSelector(
    (state) => state.report.poiTrace.selectedPoiUuid,
    refEqual
  );

  const rows = useMemo(
    () => (mission ? computePoiTraceability({ mission, scope: { type: "all" } }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gated on revision
    [revision]
  );
  const selectedRow = rows.find((row) => row.poiUuid === selectedPoiUuid) ?? rows[0] ?? null;

  if (!mission) return null;

  return (
    <div className={styles.body}>
      <div className={styles.workspace}>
        <PoiTraceabilityTable
          rows={rows}
          selectedPoiUuid={selectedRow?.poiUuid ?? null}
          mission={mission}
        />
        {selectedRow ? (
          <PoiTraceabilityDrilldown key={selectedRow.poiUuid} row={selectedRow} mission={mission} />
        ) : (
          <div className={styles.emptyState}>Choose a POI to trace its actions.</div>
        )}
      </div>
    </div>
  );
};

export default PoiTraceabilityPage;
