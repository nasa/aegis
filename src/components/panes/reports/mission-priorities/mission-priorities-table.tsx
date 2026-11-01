import type { FunctionComponent } from "react";
import { Fragment } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import styles from "../shared/report-grid.module.css";
import priorityStyles from "./mission-priorities.module.css";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import {
  reportSetCellSelection,
  reportSetHoveredLeftItem,
  reportTogglePriorityCategoryCollapsed,
} from "store/report";
import { groupCoverageColumns } from "utils/evaReportColumns";
import { MissionPrioritiesColumnCells } from "./mission-priorities-cell";

export const PRIORITY_LABEL_COLUMN_WIDTH = 260;

const REPORT_ID: ColumnReportId = "missionPriorities";

const MissionPrioritiesTable: FunctionComponent<{
  categories: MissionPriorityCategoryGroup[];
  unscheduledByPriorityUuid: { [priorityUuid: string]: MissionPriorityUnscheduledUsage };
}> = ({ categories, unscheduledByPriorityUuid }) => {
  const dispatch = useAppDispatch();
  const visibleRowIds = useAppSelector(
    (state) => state.report[REPORT_ID].visibleRowIds,
    shallowEqual
  );
  const collapsedCategories = useAppSelector(
    (state) => state.report[REPORT_ID].collapsedPriorityCategories ?? [],
    shallowEqual
  );

  const rowVisible = (priorityUuid: string) =>
    !visibleRowIds || visibleRowIds.includes(priorityUuid);

  const visibleCategoryGroups = categories
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => rowVisible(item.priorityUuid)),
    }))
    .filter((group) => group.items.length > 0);

  if (visibleCategoryGroups.length === 0) {
    return (
      <div className={styles.emptyState}>
        No Mission Priority Identifiers differ from the selected baseline.
      </div>
    );
  }

  return (
    <div className={priorityStyles.table}>
      {visibleCategoryGroups.map((group) => {
        const isCollapsed = collapsedCategories.includes(group.category);
        return (
          <Fragment key={group.category}>
            <div className={priorityStyles.categoryHeaderRow}>
              <button
                type="button"
                className={priorityStyles.categoryHeaderButton}
                aria-expanded={!isCollapsed}
                onClick={() =>
                  dispatch(
                    reportTogglePriorityCategoryCollapsed({
                      reportId: REPORT_ID,
                      category: group.category,
                    })
                  )
                }
              >
                <FontAwesomeIcon icon={isCollapsed ? faChevronRight : faChevronDown} />
                <span className={priorityStyles.categoryTitle}>{group.category}</span>
                <span className={priorityStyles.categoryCount}>{group.items.length}</span>
              </button>
            </div>
            {!isCollapsed &&
              group.items.map((item) => (
                <PriorityRow
                  key={item.priorityUuid}
                  item={item}
                  unscheduled={unscheduledByPriorityUuid[item.priorityUuid]}
                />
              ))}
          </Fragment>
        );
      })}
    </div>
  );
};

export default MissionPrioritiesTable;

const PriorityRow: FunctionComponent<{
  item: MissionPriorityRowItem;
  unscheduled: MissionPriorityUnscheduledUsage | undefined;
}> = ({ item, unscheduled }) => {
  const visibleColumns = useAppSelector(
    (state) => state.report[REPORT_ID].visibleColumns,
    shallowEqual
  );
  const columnGroups = groupCoverageColumns(visibleColumns);

  return (
    <div className={priorityStyles.priorityRow}>
      <PriorityLabel item={item} unscheduled={unscheduled} />
      <div className={styles.tableRowCells}>
        {columnGroups.map((group, groupIndex) => (
          <Fragment key={group.groupKey}>
            {groupIndex === 0 && (
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
              <MissionPrioritiesColumnCells
                key={column.key}
                column={column}
                priorityUuid={item.priorityUuid}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
};

const renderUsageBadge = (unscheduled: MissionPriorityUnscheduledUsage | undefined) => {
  if (!unscheduled) return null;
  if (unscheduled.plannedInAnyEvaCount === 0) {
    if (unscheduled.poiActionUuids.length > 0) {
      return (
        <span
          className={`${priorityStyles.usagePill} ${priorityStyles.usagePillWarning}`}
          data-tooltip-id="aegis-tooltip"
          data-tooltip-content={`Assigned to ${unscheduled.poiActionUuids.length} POI action(s), but not planned in any EVA`}
        >
          POI only ({unscheduled.poiActionUuids.length})
        </span>
      );
    }
    if (unscheduled.unassignedLocationActionUuids.length > 0) {
      return (
        <span
          className={`${priorityStyles.usagePill} ${priorityStyles.usagePillWarning}`}
          data-tooltip-id="aegis-tooltip"
          data-tooltip-content={`Assigned to ${unscheduled.unassignedLocationActionUuids.length} station/traverse action(s) not in any EVA sequence`}
        >
          Unscheduled ({unscheduled.unassignedLocationActionUuids.length})
        </span>
      );
    }
    if (unscheduled.actionTemplateUuids.length > 0) {
      return (
        <span
          className={priorityStyles.usagePill}
          data-tooltip-id="aegis-tooltip"
          data-tooltip-content={`Referenced by ${unscheduled.actionTemplateUuids.length} action template(s); not yet planned in an EVA`}
        >
          Template ({unscheduled.actionTemplateUuids.length})
        </span>
      );
    }
    return (
      <span
        className={`${priorityStyles.usagePill} ${priorityStyles.usagePillWarning}`}
        data-tooltip-id="aegis-tooltip"
        data-tooltip-content="Not assigned to any action in the mission"
      >
        Unassigned
      </span>
    );
  }

  if (unscheduled.unpromotedPoiActionUuids.length > 0) {
    return (
      <span
        className={priorityStyles.usagePill}
        data-tooltip-id="aegis-tooltip"
        data-tooltip-content={`${unscheduled.unpromotedPoiActionUuids.length} POI action(s) with this priority have not been adopted into any station`}
      >
        +{unscheduled.unpromotedPoiActionUuids.length} POI
      </span>
    );
  }

  if (unscheduled.unassignedLocationActionUuids.length > 0) {
    return (
      <span
        className={priorityStyles.usagePill}
        data-tooltip-id="aegis-tooltip"
        data-tooltip-content={`${unscheduled.unassignedLocationActionUuids.length} action(s) on stations/traverses not in any EVA`}
      >
        +{unscheduled.unassignedLocationActionUuids.length} unsched
      </span>
    );
  }

  return null;
};

const PriorityLabel: FunctionComponent<{
  item: MissionPriorityRowItem;
  unscheduled: MissionPriorityUnscheduledUsage | undefined;
}> = ({ item, unscheduled }) => {
  const dispatch = useAppDispatch();
  const hovered = useAppSelector(
    (state) => state.report[REPORT_ID].hoveredLeftItem === item.priorityUuid,
    refEqual
  );
  const cellSelection = useAppSelector((state) => state.report[REPORT_ID].cellSelection, refEqual);
  const baselineKey = useAppSelector(
    (state) => state.report[REPORT_ID].resolvedBaselineKey,
    refEqual
  );
  const visibleColumns = useAppSelector(
    (state) => state.report[REPORT_ID].visibleColumns,
    shallowEqual
  );

  const isRowSelected =
    (cellSelection?.priorityUuid ?? cellSelection?.stmUuid) === item.priorityUuid;

  const handleRowClick = () => {
    const targetColumnKey =
      (cellSelection?.columnKey && visibleColumns.some((col) => col.key === cellSelection.columnKey)
        ? cellSelection.columnKey
        : null) ??
      baselineKey ??
      visibleColumns[0]?.key ??
      "";
    dispatch(
      reportSetCellSelection({
        reportId: REPORT_ID,
        selection: {
          stmUuid: item.priorityUuid,
          priorityUuid: item.priorityUuid,
          columnKey: targetColumnKey,
        },
      })
    );
  };

  return (
    <div
      className={`${priorityStyles.priorityLabel} ${
        isRowSelected ? priorityStyles.priorityLabelSelected : ""
      }`}
      style={hovered ? { backgroundColor: "var(--stmCoverageHover)" } : undefined}
      role="button"
      tabIndex={0}
      aria-label={`${item.trace} (${item.category})`}
      onClick={handleRowClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleRowClick();
        }
      }}
      onMouseEnter={() =>
        dispatch(reportSetHoveredLeftItem({ reportId: REPORT_ID, item: item.priorityUuid }))
      }
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html={`${item.trace} — ${item.category}`}
    >
      <span className={priorityStyles.priorityTraceText}>{item.trace}</span>
      <span className={priorityStyles.priorityBadges}>{renderUsageBadge(unscheduled)}</span>
    </div>
  );
};
