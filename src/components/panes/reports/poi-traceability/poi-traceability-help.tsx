import type { FunctionComponent } from "react";
import { useRef } from "react";
import styles from "../shared/report-grid.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faCircleQuestion } from "@fortawesome/free-solid-svg-icons";

/**
 * Help button + modal for the POI Traceability tab. Explains what each column
 * means, that every number is computed against the Scope dropdown, and how to
 * read the two sections of the lineage side panel — so a science-team reader can
 * interpret the report without reverse-engineering it. Reuses the shared help
 * dialog styling from `report-grid.module.css`.
 */
const PoiTraceabilityHelp: FunctionComponent = () => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <div
        className={styles.helpButton}
        onClick={() => dialogRef.current?.showModal()}
        data-tooltip-id="aegis-tooltip"
        data-tooltip-html="How to read this page"
        aria-label="How to read the POI Traceability page"
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
            <div className={styles.helpDialogTitle}>Reading the POI Traceability report</div>
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
              Each row is a <strong>POI</strong>. The report traces each POI from its authored
              actions through to the stations and REX executions that carry them, so you can see
              which POIs have actually been planned for and executed.
            </p>

            <div className={styles.helpSection}>
              <div className={styles.helpSectionTitle}>Everything respects the Scope</div>
              <p>
                Every number is computed against the <strong>Scope</strong> dropdown —{" "}
                <em>All EVAs</em>, or a campaign&apos;s <strong>Planned</strong> or{" "}
                <strong>Executed</strong> set (the same sets used by the other reports). A dimmed
                row has no linked stations and no promoted actions in that scope: it is not
                represented in the selected plan at all.
              </p>
            </div>

            <div className={styles.helpSection}>
              <div className={styles.helpSectionTitle}>The columns</div>
              <ul className={styles.helpList}>
                <li>
                  <strong>Priority</strong> — the POI&apos;s priority override, if one is set.
                </li>
                <li>
                  <strong>Linked stations</strong> — stations whose POI list includes this POI,
                  shown as <strong>in&nbsp;scope / total</strong>. &quot;In scope&quot; counts only
                  the stations that appear in an EVA of the selected scope; the total also counts
                  linked station variants (e.g. <em>As&nbsp;Executed</em> and <em>copy</em>) that
                  are not in scope.
                </li>
                <li>
                  <strong>Actions promoted</strong> — this POI&apos;s actions that were copied onto
                  a station or traverse used by the scope&apos;s EVAs, shown as{" "}
                  <strong>promoted / total authored</strong>.
                </li>
                <li>
                  <strong>Complete / Skipped</strong> — promoted actions with that REX status. These
                  only appear when the scope is a campaign&apos;s <strong>Executed</strong> set,
                  since there are no execution statuses to roll up otherwise.
                </li>
              </ul>
              <p>
                A count shown in the <strong>highlight colour</strong> flags a mismatch: a POI that
                is linked to stations but has no promoted actions, or has promoted actions but no
                station link — the two cases the science team watches for.
              </p>
            </div>

            <div className={styles.helpSection}>
              <div className={styles.helpSectionTitle}>The lineage side panel</div>
              <p>Click any row to open its full lineage. It has two sections:</p>
              <ul className={styles.helpList}>
                <li>
                  <strong>Linked stations</strong> — every station whose POI list includes this POI.
                  In-scope stations are listed first; each line says which scope EVAs use it, or
                  &quot;not in any in-scope EVA&quot;.
                </li>
                <li>
                  <strong>POI actions</strong> — each action authored on the POI, and the station /
                  traverse copies it was promoted into within scope: the copy date, the EVAs they
                  land in, and — in an executed scope — each REX&apos;s <em>complete</em>,{" "}
                  <em>skipped</em> or <em>pending</em> status.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
};

export default PoiTraceabilityHelp;
