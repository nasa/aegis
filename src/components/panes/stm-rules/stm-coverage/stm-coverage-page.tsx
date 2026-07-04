import type { FunctionComponent } from "react";
import { useMemo, useState } from "react";
import styles from "./stm-coverage.module.css";
import { deepEqual, refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { computeColumnCoverage, getCoverageDifferences, getEvaColumns } from "utils/stmEvaCoverage";
import { selectEvaStations } from "store/selectors";
import type { StmCoverageCellSelection } from "./stm-coverage-context";
import { StmCoverageContext } from "./stm-coverage-context";
import StmCoverageControls from "./stm-coverage-controls";
import StmCoverageHeader from "./stm-coverage-header";
import StmCoverageTable from "./stm-coverage-table";
import StmCoverageDrilldown from "./stm-coverage-drilldown";

/**
 * "EVA Coverage" tab: STM level3 items down the left, one column per EVA
 * (as-planned and REX), each cell rolling up how that EVA's actions satisfy
 * the level3's rules. A baseline column plus diff mode lets flight controllers
 * compare EVA plans and see where coverage differs.
 */
const StmCoveragePage: FunctionComponent = () => {
  // The coverage computation reads actions/stations/traverses/evas/rexes, so
  // subscribe to the whole doc and memo the derived data below on its identity.
  const mission = useMissionDocSelector((m) => m, refEqual);
  const level3s = useAppSelector((state) => state.stm.level3s, shallowEqual);
  const rules = useAppSelector((state) => state.stm.rules, deepEqual);
  const hiddenColumns = useAppSelector((state) => state.stm.stmCoverageHiddenColumns, shallowEqual);
  const rexStatusFilter = useAppSelector((state) => state.stm.stmCoverageRexStatusFilter, refEqual);
  const diffMode = useAppSelector((state) => state.stm.stmCoverageDiffMode, refEqual);
  const differencesOnly = useAppSelector((state) => state.stm.stmCoverageDifferencesOnly, refEqual);
  const storedBaselineKey = useAppSelector(
    (state) => state.stm.stmCoverageBaselineColumnKey,
    refEqual
  );
  const expandedColumnKeys = useAppSelector(
    (state) => state.stm.stmCoverageExpandedEvaColumns,
    shallowEqual
  );
  const [cellSelection, setCellSelection] = useState<StmCoverageCellSelection>(null);

  const allColumns = useMemo(() => (mission ? getEvaColumns(mission) : []), [mission]);
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
  }, [mission, level3s, rules, visibleColumns, rexStatusFilter]);

  const stationsByColumnKey = useMemo(() => {
    const result: { [columnKey: string]: Station[] } = {};
    if (!mission) return result;
    for (const column of visibleColumns) {
      if (expandedColumnKeys.includes(column.key)) {
        result[column.key] = selectEvaStations(mission, column.evaUuid);
      }
    }
    return result;
  }, [mission, visibleColumns, expandedColumnKeys]);

  // "Differences only": hide rows and columns whose coverage is identical to
  // the baseline everywhere (the baseline column itself always stays visible)
  const coverageDifferences = useMemo(
    () =>
      differencesOnly && baselineKey
        ? getCoverageDifferences({
            coverageByColumnKey,
            columns: visibleColumns,
            baselineKey,
            level3s,
          })
        : null,
    [differencesOnly, baselineKey, coverageByColumnKey, visibleColumns, level3s]
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

  if (!mission) return null;

  return (
    <StmCoverageContext.Provider
      value={{
        mission,
        visibleColumns: displayedColumns,
        coverageByColumnKey,
        baselineKey,
        diffMode,
        expandedColumnKeys,
        stationsByColumnKey,
        visibleStmUuids,
        cellSelection,
        setCellSelection,
      }}
    >
      <StmCoverageControls allColumns={allColumns} baselineKey={baselineKey} />
      <div className={styles.coverageBody}>
        <div className={styles.gridScroll}>
          <StmCoverageHeader />
          <StmCoverageTable />
        </div>
        {cellSelection && <StmCoverageDrilldown />}
      </div>
    </StmCoverageContext.Provider>
  );
};

export default StmCoveragePage;
