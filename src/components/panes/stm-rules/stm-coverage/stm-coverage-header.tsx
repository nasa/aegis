import type { FunctionComponent } from "react";
import { Fragment } from "react";
import styles from "./stm-coverage.module.css";
import pageStyles from "../stm-rules-page.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
import { refEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import {
  stmCoverageSetBaselineColumnKey,
  stmCoverageSetHoveredTopItem,
  stmCoverageToggleEvaColumnExpansion,
} from "store/stm";
import { useMissionDocSelector } from "utils/useDocSelector";
import { groupCoverageColumns } from "utils/stmEvaCoverage";
import { StmTierTitle, useStmTierExpansion } from "../stm-rules-tier-titles";
import { useStmCoverage } from "./stm-coverage-context";

/** Column title: the EVA name for plan columns, "REX: <name>" for executions. */
const columnTitle = (column: StmCoverageEvaColumn) =>
  column.isRex ? `REX: ${column.label}` : column.label;

/**
 * Rotated summary labels have room for 2 vertical lines of text; longer names
 * are abbreviated with "…" so they can't spill past the header cell. The full
 * name is always available in the tooltip. The budget assumes fully packed
 * lines (word-break: break-all on .rotatedLabelWrap): 2 lines of 110px fit
 * ~31 chars even with wide all-caps glyphs.
 */
const HEADER_LABEL_MAX_CHARS = 28;
const truncateHeaderLabel = (label: string) =>
  label.length > HEADER_LABEL_MAX_CHARS
    ? `${label.slice(0, HEADER_LABEL_MAX_CHARS - 1).trimEnd()}…`
    : label;

/** Tooltip title: like columnTitle but names the parent EVA on REX columns. */
const columnTooltipName = (column: StmCoverageEvaColumn) =>
  column.isRex ? `REX: ${column.label} (${column.groupLabel})` : column.label;

/**
 * Columns are ordered in as-planned EVA families (plan column followed by its
 * REX executions). The thick divider only separates families, so the grouping
 * reads from the column order + the "REX:" label prefix.
 */
const StmCoverageHeader: FunctionComponent = () => {
  const { visibleColumns } = useStmCoverage();
  const { stmLevel1Enabled, tierColumns } = useStmTierExpansion();
  const stmLevel3Name = useMissionDocSelector((mission) => mission.stmLevel3Name, refEqual);

  const groups = groupCoverageColumns(visibleColumns);

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
        {groups.map((group, index) => (
          <Fragment key={group.groupKey}>
            {index > 0 && <div className={styles.columnDivider} />}
            {group.columns.map((column) => (
              <ColumnHeader key={column.key} column={column} />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
};

export default StmCoverageHeader;

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
        label={truncateHeaderLabel(columnTitle(column))}
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
        data-tooltip-html={`${columnTooltipName(column)}${isBaseline ? " (baseline)" : " — click to set as baseline"}`}
        style={{ cursor: "pointer" }}
      >
        {columnTitle(column)}
        <span
          className={styles.columnHeaderIcons}
          onClick={(e) => {
            e.stopPropagation();
            dispatch(stmCoverageToggleEvaColumnExpansion(column.key));
          }}
          data-tooltip-id="aegis-tooltip"
          data-tooltip-html="Collapse stations"
        >
          <FontAwesomeIcon icon={faMinus} />
        </span>
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
      style={hoveredTopItem === cellKey ? { backgroundColor: "var(--stmCoverageHover)" } : null}
      onClick={() => dispatch(stmCoverageSetBaselineColumnKey(column.key))}
      onMouseEnter={() => dispatch(stmCoverageSetHoveredTopItem(cellKey))}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html={`${columnTooltipName(column)}${
        isBaseline ? " (baseline)" : " — click to set as baseline"
      }`}
      data-tooltip-place="left-start"
    >
      <div className={`${styles.rotatedLabel} ${styles.rotatedLabelWrap}`}>{label}</div>
      <span
        className={styles.columnHeaderIcons}
        onClick={(e) => {
          e.stopPropagation();
          dispatch(stmCoverageToggleEvaColumnExpansion(column.key));
        }}
        data-tooltip-id="aegis-tooltip"
        data-tooltip-html={isExpanded ? "Collapse stations" : "Expand into stations"}
      >
        <FontAwesomeIcon icon={isExpanded ? faMinus : faPlus} />
      </span>
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
      style={hoveredTopItem === cellKey ? { backgroundColor: "var(--stmCoverageHover)" } : null}
      onMouseEnter={() => dispatch(stmCoverageSetHoveredTopItem(cellKey))}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html={label}
      data-tooltip-place="left-start"
    >
      <div className={styles.rotatedLabel}>{label}</div>
    </div>
  );
};
