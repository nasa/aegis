import type { FunctionComponent } from "react";
import { Fragment } from "react";
import styles from "./stm-coverage.module.css";
import pageStyles from "../stm-rules-page.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMinus, faPlus, faStar } from "@fortawesome/free-solid-svg-icons";
import { refEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import {
  stmCoverageSetBaselineColumnKey,
  stmCoverageSetHoveredTopItem,
  stmCoverageToggleEvaColumnExpansion,
} from "store/stm";
import { useMissionDocSelector } from "utils/useDocSelector";
import { StmTierTitle, useStmTierExpansion } from "../stm-rules-tier-titles";
import { useStmCoverage } from "./stm-coverage-context";

const StmCoverageHeader: FunctionComponent = () => {
  const { visibleColumns } = useStmCoverage();
  const { stmLevel1Enabled, tierColumns } = useStmTierExpansion();
  const stmLevel3Name = useMissionDocSelector((mission) => mission.stmLevel3Name, refEqual);

  const asPlannedColumns = visibleColumns.filter((column) => !column.isRex);
  const rexColumns = visibleColumns.filter((column) => column.isRex);

  return (
    <div className={styles.header}>
      <div
        className={styles.headerLeft}
        style={{ gridTemplateColumns: [...tierColumns, "285px"].join(" ") }}
      >
        {stmLevel1Enabled && <StmTierTitle tier="level1" />}
        <StmTierTitle tier="level2" />
        <div className={pageStyles.listTableTitle}>{stmLevel3Name}s</div>
      </div>
      <div className={styles.headerColumns}>
        {asPlannedColumns.length > 0 && (
          <ColumnGroup label="As-Planned EVAs" columns={asPlannedColumns} />
        )}
        {asPlannedColumns.length > 0 && rexColumns.length > 0 && (
          <div className={styles.columnDivider} />
        )}
        {rexColumns.length > 0 && <ColumnGroup label="Executions (REX)" columns={rexColumns} />}
      </div>
    </div>
  );
};

export default StmCoverageHeader;

const ColumnGroup: FunctionComponent<{
  label: string;
  columns: StmCoverageEvaColumn[];
}> = ({ label, columns }) => {
  return (
    <div className={styles.columnGroup}>
      <div className={styles.columnGroupLabel}>{label}</div>
      <div className={styles.headerColumns}>
        {columns.map((column, index) => (
          <Fragment key={column.key}>
            {index > 0 && <div className={styles.columnDivider} />}
            <ColumnHeader column={column} />
          </Fragment>
        ))}
      </div>
    </div>
  );
};

const ColumnHeader: FunctionComponent<{ column: StmCoverageEvaColumn }> = ({ column }) => {
  const dispatch = useAppDispatch();
  const { baselineKey, expandedColumnKeys, stationsByColumnKey } = useStmCoverage();
  const isBaseline = column.key === baselineKey;
  const isExpanded = expandedColumnKeys.includes(column.key);

  if (!isExpanded) {
    return (
      <SummaryHeaderCell
        column={column}
        isBaseline={isBaseline}
        isExpanded={false}
        cellKey={column.key}
        label={column.label}
      />
    );
  }

  const stations = stationsByColumnKey[column.key] ?? [];
  return (
    <div className={styles.columnGroup}>
      <div
        className={styles.columnGroupLabel}
        onClick={() => dispatch(stmCoverageSetBaselineColumnKey(column.key))}
        data-tooltip-id="aegis-tooltip"
        data-tooltip-html={`${column.label} — click to set as baseline`}
        style={{ cursor: "pointer" }}
      >
        {column.label}
      </div>
      <div className={styles.headerColumns}>
        {stations.map((station) => (
          <StationHeaderCell key={station.uuid} column={column} station={station} />
        ))}
        <StationHeaderCell key={`${column.key}_trav`} column={column} station={null} />
        <SummaryHeaderCell
          column={column}
          isBaseline={isBaseline}
          isExpanded={true}
          cellKey={column.key}
          label="Total"
        />
      </div>
    </div>
  );
};

const SummaryHeaderCell: FunctionComponent<{
  column: StmCoverageEvaColumn;
  isBaseline: boolean;
  isExpanded: boolean;
  cellKey: string;
  label: string;
}> = ({ column, isBaseline, isExpanded, cellKey, label }) => {
  const dispatch = useAppDispatch();
  const hoveredTopItem = useAppSelector((state) => state.stm.stmCoverageHoveredTopItem, refEqual);

  return (
    <div
      className={`${styles.columnHeaderCell} ${isBaseline ? styles.columnHeaderCellBaseline : ""}`}
      style={hoveredTopItem === cellKey ? { backgroundColor: "var(--stmTableHover)" } : null}
      onClick={() => dispatch(stmCoverageSetBaselineColumnKey(column.key))}
      onMouseEnter={() => dispatch(stmCoverageSetHoveredTopItem(cellKey))}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html={`${column.isRex ? "REX: " : ""}${column.label}${
        isBaseline ? " (baseline)" : " — click to set as baseline"
      }`}
      data-tooltip-place="left-start"
    >
      <div className={styles.rotatedLabel}>{label}</div>
      <div
        className={styles.columnHeaderIcons}
        onClick={(e) => {
          e.stopPropagation();
          dispatch(stmCoverageToggleEvaColumnExpansion(column.key));
        }}
        data-tooltip-id="aegis-tooltip"
        data-tooltip-html={isExpanded ? "Collapse stations" : "Expand into stations"}
      >
        {isBaseline && <FontAwesomeIcon icon={faStar} />}
        <FontAwesomeIcon icon={isExpanded ? faMinus : faPlus} />
      </div>
    </div>
  );
};

const StationHeaderCell: FunctionComponent<{
  column: StmCoverageEvaColumn;
  station: Station | null;
}> = ({ column, station }) => {
  const dispatch = useAppDispatch();
  const cellKey = station ? `${column.key}_${station.uuid}` : `${column.key}_trav`;
  const label = station ? station.name : "Traverses";
  const hoveredTopItem = useAppSelector((state) => state.stm.stmCoverageHoveredTopItem, refEqual);

  return (
    <div
      className={styles.stationHeaderCell}
      style={hoveredTopItem === cellKey ? { backgroundColor: "var(--stmTableHover)" } : null}
      onMouseEnter={() => dispatch(stmCoverageSetHoveredTopItem(cellKey))}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html={label}
      data-tooltip-place="left-start"
    >
      <div className={styles.rotatedLabel}>{label}</div>
    </div>
  );
};
