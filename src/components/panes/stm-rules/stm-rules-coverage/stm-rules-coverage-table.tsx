import type { FunctionComponent } from "react";
import { Fragment } from "react";
import styles from "./stm-rules-coverage.module.css";
import { shallowEqual, useAppSelector } from "utils/useAppSelector";
import { groupCoverageColumns } from "utils/evaReportColumns";
import { StmCoverageColumnCells } from "./stm-rules-coverage-cell";
import STMRulesTable from "../stm-rules-list-table";

/**
 * STM hierarchy rows of the EVA Coverage grid. Renders the shared STM
 * hierarchy tree (see STMRulesTable) with per-column coverage cells in place
 * of the Rules tab's rule list.
 */
const StmCoverageTable: FunctionComponent = () => (
  <STMRulesTable coverageContent={(stmUuid) => <StmCoverageRowCells stmUuid={stmUuid} />} />
);

export default StmCoverageTable;

const StmCoverageRowCells: FunctionComponent<{ stmUuid: string }> = ({ stmUuid }) => {
  const visibleColumns = useAppSelector(
    (state) => state.stm.stmCoverageVisibleColumns,
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
            <StmCoverageColumnCells key={column.key} column={column} stmUuid={stmUuid} />
          ))}
        </Fragment>
      ))}
    </div>
  );
};
