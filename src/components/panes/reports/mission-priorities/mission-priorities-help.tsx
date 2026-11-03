import type { FunctionComponent } from "react";
import { useRef } from "react";
import styles from "../shared/report-grid.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faCircleQuestion } from "@fortawesome/free-solid-svg-icons";

/**
 * Help button + modal for the Mission Priorities tab. Explains categories,
 * traces, EVA/REX/Campaign columns, cell colors (including Skipped and
 * Disabled-only states), diff mode, and the drilldown side panel.
 */
const MissionPrioritiesHelp: FunctionComponent = () => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <div
        className={styles.helpButton}
        onClick={() => dialogRef.current?.showModal()}
        data-tooltip-id="aegis-tooltip"
        data-tooltip-html="How to read this page"
        aria-label="How to read the Mission Priorities page"
        role="button"
      >
        <FontAwesomeIcon icon={faCircleQuestion} />
      </div>

      <dialog
        ref={dialogRef}
        className={styles.helpDialog}
        onClick={() => dialogRef.current?.close()}
      >
        <div className={styles.helpDialogInner} onClick={(e) => e.stopPropagation()}>
          <div className={styles.helpDialogHeader}>
            <div className={styles.helpDialogTitle}>Reading the Mission Priorities grid</div>
            <div
              className={styles.helpDialogClose}
              onClick={() => dialogRef.current?.close()}
              aria-label="Close help"
              role="button"
            >
              <FontAwesomeIcon icon={faXmark} />
            </div>
          </div>

          <div className={styles.helpDialogContent}>
            <p className={styles.helpIntro}>
              Each row is a <strong>Mission Priority Identifier</strong> (trace), grouped under its
              category. Columns show as-planned EVAs, REX executions, and Campaign{" "}
              <strong>Planned set</strong> / <strong>Executed set</strong> rollups.
            </p>

            <div className={styles.helpSection}>
              <div className={styles.helpSectionTitle}>Left-axis status pills</div>
              <p>
                When a priority is referenced outside of as-planned EVAs, a compact pill next to its
                trace summarizes those usages:
              </p>
              <ul className={styles.helpList}>
                <li>
                  <strong>POI only (N)</strong> — assigned to POI action(s) that have not been
                  scheduled into any as-planned EVA.
                </li>
                <li>
                  <strong>Unscheduled (N)</strong> — assigned to station/traverse action(s) not
                  included in any EVA sequence.
                </li>
                <li>
                  <strong>Template (N)</strong> — referenced by action template(s) only.
                </li>
                <li>
                  <strong>Unassigned</strong> — not assigned to any action in the mission.
                </li>
              </ul>
            </div>

            <div className={styles.helpSection}>
              <div className={styles.helpSectionTitle}>Cell colors (default view)</div>
              <div className={styles.helpLegendRow}>
                <div className={`${styles.helpSwatch} ${styles.cellSatisfied}`}>2</div>
                <div className={styles.helpLegendText}>
                  <strong>Green</strong> — planned (on EVA / Planned set columns) or at least one
                  action completed (on REX / Executed set columns).
                </div>
              </div>
              <div className={styles.helpLegendRow}>
                <div className={`${styles.helpSwatch} ${styles.cellPartial}`}>1</div>
                <div className={styles.helpLegendText}>
                  <strong>Blue</strong> — actions in a REX are in progress or pending execution.
                </div>
              </div>
              <div className={styles.helpLegendRow}>
                <div className={`${styles.helpSwatch} ${styles.cellSkippedOnly}`}>0 (S)</div>
                <div className={styles.helpLegendText}>
                  <strong>Red</strong> — all enabled actions for this priority in the REX were
                  marked skipped.
                </div>
              </div>
              <div className={styles.helpLegendRow}>
                <div className={`${styles.helpSwatch} ${styles.cellDisabledOnly}`}>0 (D)</div>
                <div className={styles.helpLegendText}>
                  <strong>Amber</strong> — only disabled action(s) carry this priority in this
                  column.
                </div>
              </div>
              <div className={styles.helpLegendRow}>
                <div className={`${styles.helpSwatch} ${styles.cellNone}`}>0</div>
                <div className={styles.helpLegendText}>
                  <strong>No fill, dim number</strong> — no actions with this priority in this
                  column.
                </div>
              </div>
            </div>

            <div className={styles.helpSection}>
              <div className={styles.helpSectionTitle}>Diff view (comparing to a baseline)</div>
              <p>
                Pick a column from the <strong>Baseline</strong> dropdown and turn on{" "}
                <strong>Diff</strong>. Comparing a Campaign&apos;s <strong>Planned set</strong>{" "}
                against its <strong>Executed set</strong> pairs planned actions directly with their
                REX copies:
              </p>
              <div className={styles.helpLegendRow}>
                <div className={`${styles.helpSwatch} ${styles.cellDiffPositive}`}>+1</div>
                <div className={styles.helpLegendText}>
                  More active priority actions than the baseline.
                </div>
              </div>
              <div className={styles.helpLegendRow}>
                <div className={`${styles.helpSwatch} ${styles.cellDiffNegative}`}>−1</div>
                <div className={styles.helpLegendText}>
                  Fewer active priority actions than the baseline (e.g. skipped, disabled, or EVA
                  not yet executed).
                </div>
              </div>
              <div className={styles.helpLegendRow}>
                <div className={`${styles.helpSwatch} ${styles.cellDiffEqual}`}>=</div>
                <div className={styles.helpLegendText}>Same active actions as the baseline.</div>
              </div>
            </div>

            <div className={styles.helpSection}>
              <div className={styles.helpSectionTitle}>Drilldown &amp; Action Preview</div>
              <p>
                Click any cell or priority trace to open the side panel. The drilldown lists each
                matching action in the selected column, explains missing baseline actions in Diff
                mode, flags POI-to-station priority changes, and lets you preview any action in a
                read-only modal.
              </p>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
};

export default MissionPrioritiesHelp;
