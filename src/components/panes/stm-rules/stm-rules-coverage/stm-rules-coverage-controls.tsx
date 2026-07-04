import type { FunctionComponent } from "react";
import styles from "./stm-rules-coverage.module.css";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import {
  stmCoverageSetBaselineColumnKey,
  stmCoverageSetColumnsHidden,
  stmCoverageSetRexStatusFilter,
  stmCoverageToggleDiffMode,
  stmCoverageToggleDifferencesOnly,
  stmCoverageToggleHiddenColumn,
} from "store/stm";
import {
  Button,
  Checkbox,
  Dropdown,
  MultiSelectDropdown,
} from "components/interface/form/globalFields";
import { faCodeCompare } from "@fortawesome/free-solid-svg-icons";
import StmCoverageHelp from "./stm-rules-coverage-help";

const REX_STATUS_FILTER_OPTIONS: { value: RexStatusFilter; label: string }[] = [
  { value: "all", label: "All actions" },
  { value: "notSkipped", label: "Not skipped" },
  { value: "completeOnly", label: "Completed only" },
];

/** Non-breaking indent for REX entries nested under their as-planned EVA. */
const REX_OPTION_INDENT = "   ";

const StmCoverageControls: FunctionComponent<{
  allColumns: StmCoverageEvaColumn[];
  baselineKey: string | null;
}> = ({ allColumns, baselineKey }) => {
  const dispatch = useAppDispatch();
  const diffMode = useAppSelector((state) => state.stm.stmCoverageDiffMode, refEqual);
  const differencesOnly = useAppSelector((state) => state.stm.stmCoverageDifferencesOnly, refEqual);
  const rexStatusFilter = useAppSelector((state) => state.stm.stmCoverageRexStatusFilter, refEqual);
  const hiddenColumns = useAppSelector((state) => state.stm.stmCoverageHiddenColumns, shallowEqual);

  const hasRexColumns = allColumns.some((column) => column.isRex);
  const shownColumnKeys = allColumns
    .filter((column) => !hiddenColumns.includes(column.key))
    .map((column) => column.key);

  // Toggling an as-planned EVA hides/shows its REX children with it; toggling
  // a REX only affects itself. allColumns is already in grouped order (each
  // plan column immediately followed by its rexes).
  const toggleColumn = (columnKey: string) => {
    const column = allColumns.find((c) => c.key === columnKey);
    if (column && !column.isRex) {
      const groupKeys = allColumns.filter((c) => c.groupKey === column.groupKey).map((c) => c.key);
      dispatch(
        stmCoverageSetColumnsHidden({
          columnKeys: groupKeys,
          hidden: !hiddenColumns.includes(columnKey),
        })
      );
    } else {
      dispatch(stmCoverageToggleHiddenColumn(columnKey));
    }
  };

  return (
    <div className={styles.controls}>
      <div className={styles.controlGroup}>
        <div className={styles.controlLabel}>Baseline</div>
        <Dropdown
          selected={baselineKey ?? ""}
          onChange={(columnKey) => dispatch(stmCoverageSetBaselineColumnKey(columnKey))}
          toolTip="EVA that other columns are compared against"
        >
          {allColumns
            .filter((column) => !hiddenColumns.includes(column.key))
            .map((column) => (
              <option key={column.key} value={column.key}>
                {column.isRex ? `${REX_OPTION_INDENT}${column.label}` : column.label}
              </option>
            ))}
        </Dropdown>
      </div>
      <Button
        icon={faCodeCompare}
        label="Diff"
        onClick={() => dispatch(stmCoverageToggleDiffMode())}
        toolTip="Show other columns as differences vs the baseline"
        style={
          diffMode
            ? { fontSize: "0.85em", backgroundColor: "var(--grey5)", color: "var(--grey0)" }
            : { fontSize: "0.85em" }
        }
        iconStyle={diffMode ? { color: "var(--grey0)" } : null}
      />
      <Checkbox
        checked={differencesOnly}
        editable={true}
        onChange={() => dispatch(stmCoverageToggleDifferencesOnly())}
        toolTip="Only show rows and columns that differ from the baseline"
        label="Differences only"
        uniqueId="stm-coverage-differences-only"
      />
      {hasRexColumns && (
        <div className={styles.controlGroup}>
          <div className={styles.controlLabel}>Include REX actions</div>
          <Dropdown
            selected={rexStatusFilter}
            onChange={(value) => dispatch(stmCoverageSetRexStatusFilter(value as RexStatusFilter))}
            toolTip="Which REX action statuses count toward rule satisfaction"
          >
            {REX_STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Dropdown>
        </div>
      )}
      <div className={styles.multiselectDropdownOutside}>
        <MultiSelectDropdown
          items={allColumns.map((column) => ({
            label: column.label,
            value: column.key,
            indentLevel: column.isRex ? 1 : 0,
          }))}
          selectedItemsValues={shownColumnKeys}
          toggleItem={toggleColumn}
          titleLabel="Columns"
          containerStyle={{ zIndex: 20 }}
          containerClassName={styles.multiselectDropdownContainer}
          headerClassName={styles.multiselectDropdownHeader}
        />
      </div>
      <StmCoverageHelp />
    </div>
  );
};

export default StmCoverageControls;
