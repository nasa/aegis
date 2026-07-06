import type { CSSProperties, FunctionComponent } from "react";
import { useEffect, useMemo } from "react";
import styles from "./stm-rules-coverage.module.css";
import { deepEqual, refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import {
  stmCoverageSetDerivedData,
  stmCoverageSetHoveredLeftItem,
  stmCoverageSetHoveredTopItem,
} from "store/stm";
import { useMissionDocSelector } from "utils/useDocSelector";
import {
  computeColumnCoverage,
  getCoverageDifferences,
  getEvaColumns,
  getEvaSequenceItems,
} from "utils/stmEvaCoverage";
import {
  STM_COVERAGE_STATION_CELL_WIDTH,
  STM_COVERAGE_SUMMARY_CELL_WIDTH,
} from "../stm-rules-tier-titles";
import StmCoverageControls from "./stm-rules-coverage-controls";
import StmCoverageHeader from "./stm-rules-coverage-header";
import StmCoverageTable from "./stm-rules-coverage-table";
import StmCoverageDrilldown from "./stm-rules-coverage-drilldown";

/**
 * "EVA Coverage" tab: STM level3 items down the left, one column per EVA
 * (as-planned and REX), each cell rolling up how that EVA's actions satisfy
 * the level3's rules. A baseline column plus diff mode lets flight controllers
 * compare EVA plans and see where coverage differs.
 */
const StmCoveragePage: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const mission = useMissionDocSelector((m) => m, refEqual);
  // The coverage computation only reads these 5 collections. Gate the memos
  // below on their identity (shallowEqual) rather than the whole mission's, so
  // an unrelated doc mutation elsewhere (e.g. renaming a POI) doesn't force a
  // full coverage recompute — Automerge only gives a new reference to a
  // collection when something inside it actually changed.
  const coverageRevision = useMissionDocSelector(
    (m) => ({
      actions: m?.actions,
      stations: m?.stations,
      traverses: m?.traverses,
      evas: m?.evas,
      rexes: m?.rexes,
    }),
    shallowEqual
  );
  const level3s = useAppSelector((state) => state.stm.level3s, shallowEqual);
  const rules = useAppSelector((state) => state.stm.rules, deepEqual);
  const hiddenColumns = useAppSelector((state) => state.stm.stmCoverageHiddenColumns, shallowEqual);
  const rexStatusFilter = useAppSelector((state) => state.stm.stmCoverageRexStatusFilter, refEqual);
  const differencesOnly = useAppSelector((state) => state.stm.stmCoverageDifferencesOnly, refEqual);
  const storedBaselineKey = useAppSelector(
    (state) => state.stm.stmCoverageBaselineColumnKey,
    refEqual
  );
  const expandedColumnKeys = useAppSelector(
    (state) => state.stm.stmCoverageExpandedEvaColumns,
    shallowEqual
  );
  const cellSelection = useAppSelector((state) => state.stm.stmCoverageCellSelection, refEqual);

  const allColumns = useMemo(
    () => (mission ? getEvaColumns(mission) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gated on coverageRevision, see its declaration above
    [coverageRevision]
  );
  const visibleColumns = useMemo(
    () => allColumns.filter((column) => !hiddenColumns.includes(column.key)),
    [allColumns, hiddenColumns]
  );

  // fall back to the first visible column when no baseline is stored or the
  // stored one was hidden/deleted
  const baselineKey =
    storedBaselineKey && visibleColumns.some((column) => column.key === storedBaselineKey)
      ? storedBaselineKey
      : (visibleColumns[0]?.key ?? null);

  const coverageByColumnKey = useMemo(() => {
    const result: { [columnKey: string]: { [stmUuid: string]: StmCoverageLevel3 } } = {};
    if (!mission) return result;
    for (const column of visibleColumns) {
      result[column.key] = computeColumnCoverage({
        mission,
        level3s,
        rules,
        column,
        rexStatusFilter,
      });
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gated on coverageRevision, see its declaration above
  }, [coverageRevision, level3s, rules, visibleColumns, rexStatusFilter]);

  const sequenceByColumnKey = useMemo(() => {
    const result: { [columnKey: string]: StmCoverageSequenceItem[] } = {};
    if (!mission) return result;
    for (const column of visibleColumns) {
      if (expandedColumnKeys.includes(column.key)) {
        result[column.key] = getEvaSequenceItems(mission, column.evaUuid);
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gated on coverageRevision, see its declaration above
  }, [coverageRevision, visibleColumns, expandedColumnKeys]);

  // "Differences only": hide rows and columns whose coverage is identical to
  // the baseline everywhere (the baseline column itself always stays visible)
  const coverageDifferences = useMemo(
    () =>
      differencesOnly && baselineKey && mission
        ? getCoverageDifferences({
            mission,
            coverageByColumnKey,
            columns: visibleColumns,
            baselineKey,
            level3s,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gated on coverageRevision, see its declaration above
    [differencesOnly, baselineKey, coverageRevision, coverageByColumnKey, visibleColumns, level3s]
  );
  const displayedColumns = useMemo(
    () =>
      coverageDifferences
        ? visibleColumns.filter(
            (column) => column.key === baselineKey || coverageDifferences.columnKeys.has(column.key)
          )
        : visibleColumns,
    [coverageDifferences, visibleColumns, baselineKey]
  );
  const visibleStmUuids = coverageDifferences?.stmUuids ?? null;

  // Mirror the derived data into the stm slice so the grid components can read
  // it from Redux instead of a context. visibleStmUuids is stored as an array
  // to keep the store serializable.
  useEffect(() => {
    dispatch(
      stmCoverageSetDerivedData({
        visibleColumns: displayedColumns,
        coverageByColumnKey,
        resolvedBaselineKey: baselineKey,
        sequenceByColumnKey,
        visibleStmUuids: visibleStmUuids ? [...visibleStmUuids] : null,
      })
    );
  }, [
    dispatch,
    displayedColumns,
    coverageByColumnKey,
    baselineKey,
    sequenceByColumnKey,
    visibleStmUuids,
  ]);

  if (!mission) return null;

  return (
    <>
      <StmCoverageControls allColumns={allColumns} baselineKey={baselineKey} />
      <div className={styles.coverageBody}>
        <div
          className={styles.gridScroll}
          style={
            {
              "--stmCoverageStationCellWidth": `${STM_COVERAGE_STATION_CELL_WIDTH}px`,
              "--stmCoverageSummaryCellWidth": `${STM_COVERAGE_SUMMARY_CELL_WIDTH}px`,
            } as CSSProperties
          }
          onMouseLeave={() => {
            dispatch(stmCoverageSetHoveredTopItem(null));
            dispatch(stmCoverageSetHoveredLeftItem(null));
          }}
        >
          <StmCoverageHeader />
          <StmCoverageTable />
        </div>
        {cellSelection && <StmCoverageDrilldown />}
      </div>
    </>
  );
};

export default StmCoveragePage;
