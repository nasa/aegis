import type { FunctionComponent, ReactNode } from "react";
import styles from "./report-grid.module.css";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import {
  reportSetBaselineColumnKey,
  reportSetRexStatusFilter,
  reportToggleDiffMode,
  reportToggleDifferencesOnly,
} from "store/report";
import { Button, Checkbox, Dropdown } from "components/interface/form/globalFields";
import { faCodeCompare } from "@fortawesome/free-solid-svg-icons";
import ReportCampaignsDialog from "./report-campaigns-dialog";
import ReportColumnPanel from "./report-column-panel";
import { useReportId } from "../reports-context";

const REX_STATUS_FILTER_OPTIONS: { value: RexStatusFilter; label: string }[] = [
  { value: "all", label: "All actions" },
  { value: "notSkipped", label: "Not skipped" },
  { value: "completeOnly", label: "Completed only" },
];

/** Non-breaking indent for REX entries nested under their as-planned EVA. */
const REX_OPTION_INDENT = "   ";

/**
 * The shared controls row for the column-family reports: baseline dropdown,
 * Diff toggle, Differences-only, Include-REX-actions filter, the View column
 * panel, Campaigns dialog and a per-report Help slot. Reads/writes
 * state.report[reportId] via the report context. `differencesOnlyToolTip` lets
 * each report phrase the row/column filter for its own left axis.
 */
const ReportControls: FunctionComponent<{
  allColumns: EvaReportColumn[];
  baselineKey: string | null;
  help?: ReactNode;
  showRexFilter?: boolean;
  differencesOnlyToolTip?: string;
}> = ({
  allColumns,
  baselineKey,
  help,
  showRexFilter = true,
  differencesOnlyToolTip = "Only show rows and columns that differ from the baseline",
}) => {
  const dispatch = useAppDispatch();
  const reportId = useReportId();
  const diffMode = useAppSelector((state) => state.report[reportId].diffMode, refEqual);
  const differencesOnly = useAppSelector(
    (state) => state.report[reportId].differencesOnly,
    refEqual
  );
  const rexStatusFilter = useAppSelector(
    (state) => state.report[reportId].rexStatusFilter,
    refEqual
  );
  const hiddenColumns = useAppSelector(
    (state) => state.report[reportId].hiddenColumns,
    shallowEqual
  );

  const hasRexColumns = allColumns.some(
    (column) => column.isRex || column.kind === "campaignExecuted"
  );
  return (
    <div className={styles.controls}>
      <div className={styles.controlGroup}>
        <div className={styles.controlLabel}>Baseline</div>
        <Dropdown
          selected={baselineKey ?? ""}
          onChange={(columnKey) => dispatch(reportSetBaselineColumnKey({ reportId, columnKey }))}
          containerStyle={{ width: "220px", flex: "0 0 220px" }}
          toolTip="Column that other columns are compared against"
        >
          {allColumns
            .filter((column) => !hiddenColumns.includes(column.key))
            .map((column) => (
              <option key={column.key} value={column.key}>
                {column.isRex
                  ? `${REX_OPTION_INDENT}${column.label}`
                  : column.campaignUuid
                    ? `${column.groupLabel}: ${column.label}`
                    : column.label}
              </option>
            ))}
        </Dropdown>
      </div>
      <Button
        icon={faCodeCompare}
        label="Diff"
        onClick={() => dispatch(reportToggleDiffMode({ reportId }))}
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
        onChange={() => dispatch(reportToggleDifferencesOnly({ reportId }))}
        toolTip={differencesOnlyToolTip}
        label="Differences only"
        uniqueId={`${reportId}-differences-only`}
      />
      {showRexFilter && hasRexColumns && (
        <div className={styles.controlGroup}>
          <div className={styles.controlLabel}>Include REX actions</div>
          <Dropdown
            selected={rexStatusFilter}
            onChange={(value) =>
              dispatch(reportSetRexStatusFilter({ reportId, value: value as RexStatusFilter }))
            }
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
      <ReportColumnPanel allColumns={allColumns} hiddenColumnKeys={hiddenColumns} />
      <ReportCampaignsDialog />
      {help}
    </div>
  );
};

export default ReportControls;
