import type { FunctionComponent } from "react";
import { Fragment } from "react";
import styles from "./stm-rules-coverage.module.css";
import pageStyles from "../stm-rules-page.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMinusCircle, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import {
  stmCoverageSetBaselineColumnKey,
  stmCoverageSetHoveredTopItem,
  stmCoverageToggleEvaColumnExpansion,
} from "store/stm";
import { useMissionDocSelector } from "utils/useDocSelector";
import { groupCoverageColumns } from "utils/evaReportColumns";
import { EmojiRenderer } from "components/interface/emojis";
import {
  StmTierTitle,
  useStmTierExpansion,
  STM_LEVEL3_NAME_COLUMN_WIDTH,
  STM_COVERAGE_STATION_CELL_WIDTH,
  STM_COVERAGE_SUMMARY_CELL_WIDTH,
} from "../stm-rules-tier-titles";

/** Column title: the EVA name for plan columns, "REX: <name>" for executions. */
const columnTitle = (column: EvaReportColumn) =>
  column.isRex
    ? `REX: ${column.label}`
    : column.campaignUuid
      ? `${column.groupLabel}: ${column.label}`
      : column.label;

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
const columnTooltipName = (column: EvaReportColumn) =>
  column.isRex
    ? `REX: ${column.label} (${column.groupLabel})`
    : column.campaignUuid
      ? `${column.groupLabel}: ${column.label}`
      : column.label;

/**
 * Columns are ordered in as-planned EVA families (plan column followed by its
 * REX executions). The thick divider only separates families, so the grouping
 * reads from the column order + the "REX:" label prefix.
 */
const StmCoverageHeader: FunctionComponent = () => {
  const visibleColumns = useAppSelector(
    (state) => state.stm.stmCoverageVisibleColumns,
    shallowEqual
  );
  const { stmLevel1Enabled, tierColumns } = useStmTierExpansion();
  const stmLevel3Name = useMissionDocSelector((mission) => mission.stmLevel3Name, refEqual);

  const groups = groupCoverageColumns(visibleColumns);

  return (
    <div className={styles.header}>
      <div
        className={styles.headerLeft}
        style={{
          gridTemplateColumns: [...tierColumns, `${STM_LEVEL3_NAME_COLUMN_WIDTH}px`].join(" "),
          // Row cells sit behind two 1px border-lefts the header has no
          // equivalent of: the level1 tier wrapper's (stm-rules-list-table
          // .gridCellLevel1Expanded/Collapsed, only when level1 is enabled)
          // and the level3 row container's (.gridCellLevel3Container,
          // always). Pad the header by the same amount so its columns start
          // at the same x position as the body's.
          paddingLeft: stmLevel1Enabled ? 2 : 1,
        }}
      >
        {stmLevel1Enabled && <StmTierTitle tier="level1" />}
        <StmTierTitle tier="level2" />
        <div className={pageStyles.listTableTitle}>{stmLevel3Name}s</div>
      </div>
      <div className={styles.headerColumns}>
        {groups.map((group, index) => (
          <Fragment key={group.groupKey}>
            {index === 0 && !group.columns[0]?.campaignUuid && (
              <div className={`${styles.columnDivider} ${styles.campaignDivider}`}>
                <span className={styles.sectionDividerLabel}>EVAs and REXs</span>
              </div>
            )}
            {index > 0 && (
              <div
                className={`${styles.columnDivider} ${
                  group.columns[0]?.campaignUuid && !groups[index - 1]?.columns[0]?.campaignUuid
                    ? styles.campaignDivider
                    : ""
                }`}
              >
                {group.columns[0]?.campaignUuid && !groups[index - 1]?.columns[0]?.campaignUuid ? (
                  <span className={styles.sectionDividerLabel}>CAMPAIGNS</span>
                ) : null}
              </div>
            )}
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

const ColumnHeader: FunctionComponent<{ column: EvaReportColumn }> = ({ column }) => {
  const dispatch = useAppDispatch();
  const baselineKey = useAppSelector((state) => state.stm.stmCoverageResolvedBaselineKey, refEqual);
  const expandedColumnKeys = useAppSelector(
    (state) => state.stm.stmCoverageExpandedEvaColumns,
    shallowEqual
  );
  const sequenceByColumnKey = useAppSelector(
    (state) => state.stm.stmCoverageSequenceByColumnKey,
    shallowEqual
  );
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

  const sequenceItems = sequenceByColumnKey[column.key] ?? [];
  // Firefox miscomputes the automatic (content-based) width of a flex item
  // whose descendants use writing-mode: vertical-rl (the rotated labels below)
  // — see https://bugzilla.mozilla.org/show_bug.cgi?id=1332555. Chrome gets it
  // right, Firefox doesn't, which is why this only breaks there. Sidestep it
  // entirely by giving the group its exact pixel width up front instead of
  // letting either browser derive it from nested content: one 22px
  // .stationHeaderCell per sequence item plus the trailing 40px "Total"
  // .columnHeaderCell.
  const groupWidth =
    sequenceItems.length * STM_COVERAGE_STATION_CELL_WIDTH + STM_COVERAGE_SUMMARY_CELL_WIDTH;
  return (
    <div className={styles.columnGroup} style={{ width: groupWidth }}>
      <div
        className={styles.columnGroupLabel}
        onClick={() => dispatch(stmCoverageSetBaselineColumnKey(isBaseline ? null : column.key))}
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
          data-tooltip-html={column.campaignUuid ? "Collapse EVAs" : "Collapse stations"}
        >
          <FontAwesomeIcon icon={faMinusCircle} />
        </span>
      </div>
      <div className={styles.headerColumns}>
        {sequenceItems.map((item) => (
          <SequenceHeaderCell key={item.uuid} column={column} item={item} />
        ))}
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
  column: EvaReportColumn;
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
      onClick={() => dispatch(stmCoverageSetBaselineColumnKey(isBaseline ? null : column.key))}
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
        data-tooltip-html={
          isExpanded
            ? column.campaignUuid
              ? "Collapse EVAs"
              : "Collapse stations"
            : column.campaignUuid
              ? "Expand into member EVAs"
              : "Expand into stations"
        }
      >
        <FontAwesomeIcon icon={isExpanded ? faMinusCircle : faPlusCircle} />
      </span>
    </div>
  );
};

/**
 * Header cell for one expanded sub-column: a station (emoji icon, like the
 * Matches tab) or a traverse (standard dotted traverse icon).
 */
const SequenceHeaderCell: FunctionComponent<{
  column: EvaReportColumn;
  item: StmCoverageSequenceItem;
}> = ({ column, item }) => {
  const dispatch = useAppDispatch();
  const cellKey = `${column.key}_${item.uuid}`;
  const hoveredTopItem = useAppSelector((state) => state.stm.stmCoverageHoveredTopItem, refEqual);

  return (
    <div
      className={styles.stationHeaderCell}
      style={hoveredTopItem === cellKey ? { backgroundColor: "var(--stmCoverageHover)" } : null}
      onMouseEnter={() => dispatch(stmCoverageSetHoveredTopItem(cellKey))}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html={item.name}
      data-tooltip-place="left-start"
    >
      <div className={styles.rotatedLabel}>{item.name}</div>
      <div className={styles.sequenceHeaderIcon}>
        {item.type === "station" ? (
          <EmojiRenderer iconValue={item.icon ? item.icon : "2754"} />
        ) : item.type === "traverse" ? (
          <div className={styles.sequenceHeaderTraverseIcon} />
        ) : null}
      </div>
    </div>
  );
};
