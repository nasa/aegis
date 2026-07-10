import type { FunctionComponent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronRight, faSliders } from "@fortawesome/free-solid-svg-icons";
import styles from "./report-grid.module.css";
import { STM_COVERAGE_ORPHAN_GROUP_KEY, groupCoverageColumns } from "utils/evaReportColumns";
import { useAppDispatch } from "utils/useAppDispatch";
import { reportSetColumnsHidden } from "store/report";
import { useReportId } from "../reports-context";

/** A checkbox that represents all, none, or part of a set of table columns. */
const ColumnVisibilityCheckbox: FunctionComponent<{
  columnKeys: string[];
  hiddenColumnKeys: string[];
  label: string;
}> = ({ columnKeys, hiddenColumnKeys, label }) => {
  const dispatch = useAppDispatch();
  const reportId = useReportId();
  const checkboxRef = useRef<HTMLInputElement>(null);
  const visibleCount = columnKeys.filter((key) => !hiddenColumnKeys.includes(key)).length;
  const checked = visibleCount === columnKeys.length;
  const indeterminate = visibleCount > 0 && !checked;

  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={checkboxRef}
      className={styles.columnVisibilityCheckbox}
      type="checkbox"
      checked={checked}
      aria-label={label}
      onChange={() =>
        dispatch(
          reportSetColumnsHidden({
            reportId,
            columnKeys,
            hidden: checked,
          })
        )
      }
    />
  );
};

const ColumnGroup: FunctionComponent<{
  group: StmCoverageColumnGroup;
  hiddenColumnKeys: string[];
}> = ({ group, hiddenColumnKeys }) => {
  const [isOpen, setIsOpen] = useState(true);
  const groupColumnKeys = group.columns.map((column) => column.key);

  return (
    <div className={styles.columnVisibilityGroup}>
      <div className={styles.columnVisibilityGroupRow}>
        <ColumnVisibilityCheckbox
          columnKeys={groupColumnKeys}
          hiddenColumnKeys={hiddenColumnKeys}
          label={`Show ${group.groupLabel}`}
        />
        <button
          type="button"
          className={styles.columnVisibilityExpandButton}
          aria-expanded={isOpen}
          aria-label={`${isOpen ? "Collapse" : "Expand"} ${group.groupLabel}`}
          onClick={() => setIsOpen((open) => !open)}
        >
          <FontAwesomeIcon icon={isOpen ? faChevronDown : faChevronRight} />
        </button>
        <span className={styles.columnVisibilityGroupLabel}>{group.groupLabel}</span>
      </div>
      {isOpen && (
        <div className={styles.columnVisibilityChildren}>
          {group.columns.map((column) => (
            <label key={column.key} className={styles.columnVisibilityChildRow}>
              <ColumnVisibilityCheckbox
                columnKeys={[column.key]}
                hiddenColumnKeys={hiddenColumnKeys}
                label={`Show ${column.label}`}
              />
              <span>{column.isRex ? `REX: ${column.label}` : column.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

const ColumnVisibilitySection: FunctionComponent<{
  label: string;
  groups: StmCoverageColumnGroup[];
  hiddenColumnKeys: string[];
}> = ({ label, groups, hiddenColumnKeys }) => {
  if (groups.length === 0) return null;

  return (
    <section className={styles.columnVisibilitySection} aria-label={`${label} columns`}>
      <div className={styles.columnVisibilitySectionHeader}>
        <span>{label}</span>
      </div>
      {groups.map((group) => (
        <ColumnGroup key={group.groupKey} group={group} hiddenColumnKeys={hiddenColumnKeys} />
      ))}
    </section>
  );
};

const ViewToggle: FunctionComponent<{
  label: string;
  groups: StmCoverageColumnGroup[];
  hiddenColumnKeys: string[];
}> = ({ label, groups, hiddenColumnKeys }) => {
  const columnKeys = groups.flatMap((group) => group.columns.map((column) => column.key));
  if (columnKeys.length === 0) return null;

  return (
    <label className={styles.columnVisibilityToggleRow}>
      <ColumnVisibilityCheckbox
        columnKeys={columnKeys}
        hiddenColumnKeys={hiddenColumnKeys}
        label={`Show ${label}`}
      />
      <span>Show {label}</span>
    </label>
  );
};

/**
 * Hierarchical visibility chooser for the coverage table. Group checkboxes
 * toggle an entire EVA family or campaign, while child rows retain precise
 * per-column control.
 */
const ReportColumnPanel: FunctionComponent<{
  allColumns: EvaReportColumn[];
  hiddenColumnKeys: string[];
}> = ({ allColumns, hiddenColumnKeys }) => {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => groupCoverageColumns(allColumns), [allColumns]);
  const evaGroups = groups.filter(
    (group) => !group.columns[0]?.campaignUuid && group.groupKey !== STM_COVERAGE_ORPHAN_GROUP_KEY
  );
  const campaignGroups = groups.filter((group) => !!group.columns[0]?.campaignUuid);
  const orphanRexGroups = groups.filter(
    (group) => group.groupKey === STM_COVERAGE_ORPHAN_GROUP_KEY
  );

  return (
    <div
      ref={panelRef}
      className={styles.columnVisibilityPanelOutside}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsOpen(false);
      }}
    >
      <button
        type="button"
        className={styles.columnVisibilityPanelButton}
        aria-expanded={isOpen}
        aria-controls="stm-coverage-column-visibility-panel"
        onClick={() => setIsOpen((open) => !open)}
      >
        <FontAwesomeIcon icon={faSliders} />
        View
        <FontAwesomeIcon icon={isOpen ? faChevronDown : faChevronRight} />
      </button>
      {isOpen && (
        <div
          id="stm-coverage-column-visibility-panel"
          className={styles.columnVisibilityPanel}
          role="dialog"
          aria-label="Coverage table column visibility"
        >
          <section className={styles.columnVisibilityToggleSection} aria-label="View toggles">
            <div className={styles.columnVisibilitySectionHeader}>View toggles</div>
            <ViewToggle
              label="EVAs / REXes"
              groups={evaGroups}
              hiddenColumnKeys={hiddenColumnKeys}
            />
            <ViewToggle
              label="Campaigns"
              groups={campaignGroups}
              hiddenColumnKeys={hiddenColumnKeys}
            />
            <ViewToggle
              label="Other REXes"
              groups={orphanRexGroups}
              hiddenColumnKeys={hiddenColumnKeys}
            />
          </section>
          <ColumnVisibilitySection
            label="EVAs / REXes"
            groups={evaGroups}
            hiddenColumnKeys={hiddenColumnKeys}
          />
          <ColumnVisibilitySection
            label="Campaigns"
            groups={campaignGroups}
            hiddenColumnKeys={hiddenColumnKeys}
          />
          <ColumnVisibilitySection
            label="Other REXes"
            groups={orphanRexGroups}
            hiddenColumnKeys={hiddenColumnKeys}
          />
        </div>
      )}
    </div>
  );
};

export default ReportColumnPanel;
