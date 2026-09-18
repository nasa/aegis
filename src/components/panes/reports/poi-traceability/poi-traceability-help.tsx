import type { FunctionComponent } from "react";
import { useRef } from "react";
import styles from "../shared/report-grid.module.css";
import localStyles from "./poi-traceability.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faCircleQuestion } from "@fortawesome/free-solid-svg-icons";

/** Explain adoption, execution outcomes, and the scope of the action tree. */
const PoiTraceabilityHelp: FunctionComponent = () => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className={`${styles.helpButton} ${localStyles.helpControl}`}
        onClick={() => dialogRef.current?.showModal()}
        data-tooltip-id="aegis-tooltip"
        data-tooltip-html="How to read this page"
        aria-label="How to read the POI Traceability page"
      >
        <FontAwesomeIcon icon={faCircleQuestion} />
      </button>

      <dialog
        ref={dialogRef}
        className={styles.helpDialog}
        aria-label="Reading the POI Traceability report"
        onClick={() => dialogRef.current?.close()}
      >
        {/* stop propagation so clicks inside the panel don't close the dialog */}
        <div className={styles.helpDialogInner} onClick={(e) => e.stopPropagation()}>
          <div className={styles.helpDialogHeader}>
            <div className={styles.helpDialogTitle}>Reading the POI Traceability report</div>
            <button
              type="button"
              className={`${styles.helpDialogClose} ${localStyles.helpControl}`}
              onClick={() => dialogRef.current?.close()}
              aria-label="Close help"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>

          <div className={styles.helpDialogContent}>
            <p className={styles.helpIntro}>
              Choose a POI, then an action. Read its family tree from the source action to each EVA
              station or traverse that adopted it, and then to its execution outcomes.
            </p>
            <p>
              All actions are listed together with adoption and completion counts. Preview original,
              adopted, or executed actions in a read-only modal without leaving the report. Close
              the preview, press Escape, or click outside it to return to the same trace. Execution
              copies with a different name show that name below their outcome.
            </p>
            <div className={styles.helpSection}>
              <div className={styles.helpSectionTitle}>Adoption and execution</div>
              <p>
                Adoption follows the recorded link from a copied action back to its POI action.
                Linking a POI to a station alone does not adopt an action. Each EVA using a station
                gets its own branch. Each outcome belongs to that specific adoption.
              </p>
              <ul className={styles.helpList}>
                <li>
                  <strong>Completed</strong>: the action was marked complete in that REX.
                </li>
                <li>
                  <strong>Skipped</strong>: the action was marked skipped.
                </li>
                <li>
                  <strong>Pending</strong>: the action is in the execution, without a completed or
                  skipped status.
                </li>
                <li>
                  <strong>Not in this execution</strong>: this EVA has a REX, but it does not
                  contain this adopted action.
                </li>
                <li>
                  <strong>No execution recorded</strong>: the EVA has no REX in scope.
                </li>
              </ul>
              <p>
                An adoption that survives only in an execution snapshot is labeled separately. POI
                list counts refer to distinct source actions: an action completed in several
                executions counts once. Open its tree to see every outcome.
              </p>
            </div>
            <div className={styles.helpSection}>
              <div className={styles.helpSectionTitle}>Included data</div>
              <p>
                The report includes all EVA plans and their execution history. POIs are ordered by
                priority, then name. Each action shows where it was adopted and whether it was
                executed.
              </p>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
};

export default PoiTraceabilityHelp;
