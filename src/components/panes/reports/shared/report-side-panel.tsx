import type { FunctionComponent, ReactNode } from "react";
import styles from "./report-grid.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

const PANEL_MIN_WIDTH = 220;
/** Grid width the panel can never squeeze past when dragged wide. */
const GRID_MIN_WIDTH = 300;

/**
 * The shared drilldown side panel: a draggable resizer + a fixed-width panel
 * with a title/subtitle header, close button and scrolling content. Width is
 * controlled by the caller (each report stores its own drilldown width in its
 * report-slice slot) so this component stays free of the reportId distinction.
 * Used by the EVA STM Coverage per-rule drilldown and the POI Traceability
 * lineage drilldown.
 */
const ReportSidePanel: FunctionComponent<{
  width: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}> = ({ width, onWidthChange, onClose, title, subtitle, children }) => {
  // Divider drag: pointer capture keeps move events flowing while the cursor
  // leaves the 6px handle; width is clamped so neither side can vanish.
  const onResizerPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const body = event.currentTarget.parentElement;
    if (!body) return;
    const bodyRect = body.getBoundingClientRect();
    const maxWidth = Math.max(bodyRect.width - GRID_MIN_WIDTH, PANEL_MIN_WIDTH);
    const next = Math.min(Math.max(bodyRect.right - event.clientX, PANEL_MIN_WIDTH), maxWidth);
    if (next !== width) onWidthChange(Math.round(next));
  };

  return (
    <>
      <div
        className={styles.drilldownResizer}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={onResizerPointerMove}
      />
      <div className={styles.drilldown} style={{ width }}>
        <div className={styles.drilldownHeader}>
          <div>
            <div className={styles.drilldownTitle}>{title}</div>
            {subtitle != null && <div className={styles.drilldownSubtitle}>{subtitle}</div>}
          </div>
          <div className={styles.drilldownClose} onClick={onClose}>
            <FontAwesomeIcon icon={faXmark} />
          </div>
        </div>
        <div className={styles.drilldownContent}>{children}</div>
      </div>
    </>
  );
};

export default ReportSidePanel;
