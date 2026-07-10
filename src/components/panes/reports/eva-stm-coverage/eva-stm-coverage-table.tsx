import type { FunctionComponent } from "react";
import { Fragment } from "react";
import styles from "../shared/report-grid.module.css";
import { shallowEqual, useAppSelector } from "utils/useAppSelector";
import { groupCoverageColumns } from "utils/evaReportColumns";
import { EvaStmCoverageColumnCells } from "./eva-stm-coverage-cell";
import STMRulesTable from "../../stm-rules/stm-rules-list-table";

/**
 * STM hierarchy rows of the EVA STM Coverage grid. Renders the shared STM
 * hierarchy tree (see STMRulesTable) with per-column coverage cells in place of
 * the Rules tab's rule list.
 */
const EvaStmCoverageTable: FunctionComponent = () => (
  <STMRulesTable coverageContent={(stmUuid) => <EvaStmCoverageRowCells stmUuid={stmUuid} />} />
);

export default EvaStmCoverageTable;

const EvaStmCoverageRowCells: FunctionComponent<{ stmUuid: string }> = ({ stmUuid }) => {
  const visibleColumns = useAppSelector(
    (state) => state.report.stmCoverage.visibleColumns,
    shallowEqual
  );
  const columnGroups = groupCoverageColumns(visibleColumns);

  return (
    <div className={styles.tableRowCells}>
      {columnGroups.map((group, groupIndex) => (
        <Fragment key={group.groupKey}>
          {groupIndex === 0 && !group.columns[0]?.campaignUuid && (
            <div className={`${styles.columnDivider} ${styles.campaignDivider}`} />
          )}
          {groupIndex > 0 && (
            <div
              className={`${styles.columnDivider} ${
                group.columns[0]?.campaignUuid &&
                !columnGroups[groupIndex - 1]?.columns[0]?.campaignUuid
                  ? styles.campaignDivider
                  : ""
              }`}
            />
          )}
          {group.columns.map((column) => (
            <EvaStmCoverageColumnCells key={column.key} column={column} stmUuid={stmUuid} />
          ))}
        </Fragment>
      ))}
    </div>
  );
};
