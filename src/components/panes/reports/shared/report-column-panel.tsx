import type { FunctionComponent } from "react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faChevronRight,
  faSliders,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
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
  id?: string;
}> = ({ columnKeys, hiddenColumnKeys, label, id }) => {
  const dispatch = useAppDispatch();
  const reportId = useReportId();
  const checkboxRef = useRef<HTMLInputElement>(null);
  const visibleCount = columnKeys.filter((key) => !hiddenColumnKeys.includes(key)).length;
  const checked = columnKeys.length > 0 && visibleCount === columnKeys.length;
  const indeterminate = visibleCount > 0 && !checked;

  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      id={id}
      ref={checkboxRef}
      className={styles.columnVisibilityCheckbox}
      type="checkbox"
      checked={checked}
      disabled={columnKeys.length === 0}
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
  const [isOpen, setIsOpen] = useState(false);
  const checkboxId = useId();
  const groupColumnKeys = group.columns.map((column) => column.key);
  const visibleCount = groupColumnKeys.filter((key) => !hiddenColumnKeys.includes(key)).length;
  const hasChildren = group.columns.length > 1;

  return (
    <div className={styles.columnVisibilityGroup}>
      <div className={styles.columnVisibilityGroupRow}>
        <ColumnVisibilityCheckbox
          id={checkboxId}
          columnKeys={groupColumnKeys}
          hiddenColumnKeys={hiddenColumnKeys}
          label={`Show ${group.groupLabel}`}
        />
        {hasChildren ? (
          <button
            type="button"
            className={styles.columnVisibilityExpandButton}
            aria-expanded={isOpen}
            aria-label={`${isOpen ? "Collapse" : "Expand"} ${group.groupLabel}`}
            onClick={() => setIsOpen((open) => !open)}
          >
            <span className={styles.columnVisibilityGroupLabel}>{group.groupLabel}</span>
            <span className={styles.columnVisibilityCount}>
              {visibleCount}/{group.columns.length}
            </span>
            <FontAwesomeIcon icon={isOpen ? faChevronDown : faChevronRight} />
          </button>
        ) : (
          <label className={styles.columnVisibilityGroupLabel} htmlFor={checkboxId}>
            {group.groupLabel}
          </label>
        )}
      </div>
      {hasChildren && isOpen && (
        <div className={styles.columnVisibilityChildren}>
          {group.columns.map((column) => (
            <label key={column.key} className={styles.columnVisibilityChildRow}>
              <ColumnVisibilityCheckbox
                columnKeys={[column.key]}
                hiddenColumnKeys={hiddenColumnKeys}
                label={`Show ${column.isRex ? "REX: " : ""}${column.label}`}
              />
              <span className={styles.columnVisibilityKind}>
                {column.isRex || column.kind === "campaignExecuted" ? "Executed" : "Planned"}
              </span>
              <span>
                {column.label === group.groupLabel ? (column.isRex ? "REX" : "EVA") : column.label}
              </span>
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
        <ColumnVisibilityCheckbox
          columnKeys={groups.flatMap((group) => group.columns.map((column) => column.key))}
          hiddenColumnKeys={hiddenColumnKeys}
          label={`Show ${label}`}
        />
        <span>{label}</span>
      </div>
      {groups.map((group) => (
        <ColumnGroup key={group.groupKey} group={group} hiddenColumnKeys={hiddenColumnKeys} />
      ))}
    </section>
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
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 500 });
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dispatch = useAppDispatch();
  const reportId = useReportId();
  const groups = useMemo(() => groupCoverageColumns(allColumns), [allColumns]);
  const search = query.trim().toLocaleLowerCase();
  const filteredGroups = groups.filter((group) =>
    `${group.groupLabel} ${group.columns.map((column) => column.label).join(" ")}`
      .toLocaleLowerCase()
      .includes(search)
  );
  const sections = [
    {
      label: "EVAs / REXes",
      groups: filteredGroups.filter(
        (group) =>
          !group.columns[0]?.campaignUuid && group.groupKey !== STM_COVERAGE_ORPHAN_GROUP_KEY
      ),
    },
    {
      label: "Campaigns",
      groups: filteredGroups.filter((group) => !!group.columns[0]?.campaignUuid),
    },
    {
      label: "Other REXes",
      groups: filteredGroups.filter((group) => group.groupKey === STM_COVERAGE_ORPHAN_GROUP_KEY),
    },
  ];
  const visibleCount = allColumns.filter((column) => !hiddenColumnKeys.includes(column.key)).length;
  const matchingKeys = filteredGroups.flatMap((group) => group.columns.map((column) => column.key));
  const close = () => {
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    const updatePosition = () => {
      const bounds = buttonRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const top = Math.min(bounds.bottom + 6, Math.max(8, window.innerHeight - 260));
      setPosition({
        top,
        left: Math.max(8, Math.min(bounds.left, window.innerWidth - 408)),
        maxHeight: Math.min(560, window.innerHeight - top - 8),
      });
    };
    updatePosition();
    searchRef.current?.focus();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const dismissOutside = (event: Event) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target))
        setIsOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
    };
  }, [isOpen]);

  return (
    <div className={styles.columnVisibilityPanelOutside}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.columnVisibilityPanelButton}
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => setIsOpen((open) => !open)}
      >
        <FontAwesomeIcon icon={faSliders} />
        View
        <span className={styles.columnVisibilityCount}>
          {visibleCount}/{allColumns.length}
        </span>
        <FontAwesomeIcon icon={faChevronDown} />
      </button>
      {isOpen &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            style={position}
            className={styles.columnVisibilityPanel}
            role="dialog"
            aria-label="Visible report columns"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                close();
              }
            }}
          >
            <div className={styles.columnVisibilityPanelHeader}>
              <div>
                <strong>Visible columns</strong>
                <div className={styles.columnVisibilityHint}>
                  {visibleCount} of {allColumns.length} selected
                </div>
              </div>
              <button
                type="button"
                className={styles.columnVisibilityClose}
                aria-label="Close column selector"
                onClick={close}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
            <div className={styles.columnVisibilityTools}>
              <input
                ref={searchRef}
                type="search"
                aria-label="Find EVA or campaign"
                placeholder="Find EVA or campaign"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className={styles.columnVisibilityActions}>
                <span>
                  {search
                    ? `${filteredGroups.length} matching groups`
                    : "Select columns to display"}
                </span>
                <button
                  type="button"
                  disabled={!matchingKeys.length}
                  onClick={() =>
                    dispatch(
                      reportSetColumnsHidden({ reportId, columnKeys: matchingKeys, hidden: false })
                    )
                  }
                >
                  {search ? "Show matches" : "Show all"}
                </button>
                <button
                  type="button"
                  disabled={!matchingKeys.length}
                  onClick={() =>
                    dispatch(
                      reportSetColumnsHidden({ reportId, columnKeys: matchingKeys, hidden: true })
                    )
                  }
                >
                  {search ? "Hide matches" : "Hide all"}
                </button>
              </div>
            </div>
            <div className={styles.columnVisibilityList}>
              {sections.map((section) => (
                <ColumnVisibilitySection
                  key={section.label}
                  label={section.label}
                  groups={section.groups}
                  hiddenColumnKeys={hiddenColumnKeys}
                />
              ))}
              {!filteredGroups.length && (
                <div className={styles.columnVisibilityEmpty}>
                  {allColumns.length ? "No matching EVAs or campaigns." : "No columns available."}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default ReportColumnPanel;
