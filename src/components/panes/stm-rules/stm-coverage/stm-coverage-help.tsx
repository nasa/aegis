import type { FunctionComponent } from "react";
import { useRef } from "react";
import styles from "./stm-coverage.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faCircleQuestion } from "@fortawesome/free-solid-svg-icons";

/**
 * Help button + modal for the EVA Coverage tab. Explains what the numbers,
 * cell colors, outlines and controls mean so a flight controller reading the
 * grid for the first time can interpret it without guessing. The color swatches
 * reuse the exact status/diff classes from the grid so the legend can never
 * drift from the real cells.
 */
const StmCoverageHelp: FunctionComponent = () => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <div
        className={styles.helpButton}
        onClick={() => dialogRef.current?.showModal()}
        data-tooltip-id="aegis-tooltip"
        data-tooltip-html="How to read this page"
        aria-label="How to read the EVA Coverage page"
        role="button"
      >
        <FontAwesomeIcon icon={faCircleQuestion} />
      </div>

      <dialog
        ref={dialogRef}
        className={styles.helpDialog}
        onClick={() => dialogRef.current?.close()}
      >
        {/* stop propagation so clicks inside the panel don't close the dialog */}
        <div className={styles.helpDialogInner} onClick={(e) => e.stopPropagation()}>
          <div className={styles.helpDialogHeader}>
            <div className={styles.helpDialogTitle}>Reading the EVA Coverage grid</div>
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
              Each row is an STM item and each column is an EVA (as-planned) or REX (as-executed). A
              cell rolls up how well that EVA&apos;s actions satisfy the rules defined for that STM
              item.
            </p>

            <div className={styles.helpSection}>
              <div className={styles.helpSectionTitle}>The number in a cell</div>
              <p>
                The number is the count of matching actions in that EVA for that STM item. When a
                column is expanded into stations, each sub-column shows the count for a single
                station (or Traverses), and the <strong>Total</strong> column sums them.
              </p>
            </div>

            <div className={styles.helpSection}>
              <div className={styles.helpSectionTitle}>Cell colors (default view)</div>
              <div className={styles.helpLegendRow}>
                <div className={`${styles.helpSwatch} ${styles.cellSatisfied}`}>7</div>
                <div className={styles.helpLegendText}>
                  <strong>Green</strong> — all rules for this STM item are satisfied.
                </div>
              </div>
              <div className={styles.helpLegendRow}>
                <div className={`${styles.helpSwatch} ${styles.cellPartial}`}>3</div>
                <div className={styles.helpLegendText}>
                  <strong>Blue</strong> — some but not all rules are satisfied (partial coverage).
                </div>
              </div>
              <div className={styles.helpLegendRow}>
                <div className={`${styles.helpSwatch} ${styles.cellNone}`}>0</div>
                <div className={styles.helpLegendText}>
                  <strong>No fill, dim number</strong> — rules exist but no matching actions were
                  found.
                </div>
              </div>
              <div className={styles.helpLegendRow}>
                <div className={`${styles.helpSwatch} ${styles.cellNoRules}`}>—</div>
                <div className={styles.helpLegendText}>
                  <strong>Dash</strong> — no rules are defined for this STM item, so there is
                  nothing to cover.
                </div>
              </div>
            </div>

            <div className={styles.helpSection}>
              <div className={styles.helpSectionTitle}>Diff view (comparing to a baseline)</div>
              <p>
                Pick a <strong>Baseline</strong> column (click any column header to set it) and turn
                on <strong>Diff</strong>. Every other column then shows how its coverage differs
                from the baseline instead of a raw count:
              </p>
              <div className={styles.helpLegendRow}>
                <div className={`${styles.helpSwatch} ${styles.cellDiffPositive}`}>+2</div>
                <div className={styles.helpLegendText}>
                  More matching actions than the baseline.
                </div>
              </div>
              <div className={styles.helpLegendRow}>
                <div className={`${styles.helpSwatch} ${styles.cellDiffNegative}`}>−2</div>
                <div className={styles.helpLegendText}>
                  Fewer matching actions than the baseline.
                </div>
              </div>
              <div className={styles.helpLegendRow}>
                <div className={`${styles.helpSwatch} ${styles.cellDiffEqual}`}>=</div>
                <div className={styles.helpLegendText}>Same coverage as the baseline.</div>
              </div>
              <div className={styles.helpLegendRow}>
                <div className={`${styles.helpSwatch} ${styles.cellDiffEqual}`}>≠</div>
                <div className={styles.helpLegendText}>
                  Same total as the baseline, but the matches come from different rules.
                </div>
              </div>
            </div>

            <div className={styles.helpSection}>
              <div className={styles.helpSectionTitle}>Outlines</div>
              <div className={styles.helpLegendRow}>
                <div
                  className={`${styles.helpSwatch} ${styles.cellDiffPositive} ${styles.cellStatusChanged}`}
                ></div>
                <div className={styles.helpLegendText}>
                  <strong>Blue outline</strong> — the satisfaction status changed vs the baseline
                  (e.g. went from partial to fully satisfied), even if the count is close.
                </div>
              </div>
              <div className={styles.helpLegendRow}>
                <div
                  className={`${styles.helpSwatch} ${styles.cellSatisfied} ${styles.cellSelected}`}
                ></div>
                <div className={styles.helpLegendText}>
                  <strong>White outline</strong> — the cell you clicked; its rule-by-rule breakdown
                  opens in the side panel.
                </div>
              </div>
            </div>

            <div className={styles.helpSection}>
              <div className={styles.helpSectionTitle}>Tips</div>
              <ul className={styles.helpList}>
                <li>
                  Click any cell to open the drilldown and see which actions matched each rule.
                </li>
                <li>
                  Click a column header to set it as the baseline; click it again to clear it.
                </li>
                <li>
                  Use the + / − icon in a header to expand a column into per-station sub-columns.
                </li>
                <li>
                  <strong>Differences only</strong> hides rows and columns that are identical to the
                  baseline, so only what changed remains.
                </li>
                <li>
                  <strong>Include REX actions</strong> controls which executed action statuses count
                  toward coverage (all, not-skipped, or completed only).
                </li>
              </ul>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
};

export default StmCoverageHelp;
