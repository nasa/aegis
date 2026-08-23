import { useId, useRef, type FunctionComponent, type MouseEvent } from "react";
import { SLOPE_CLASSES } from "utils/paperSlope";
import styles from "./slope-legend.module.css";

const SlopeLegend: FunctionComponent = () => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();

  const handleDialogClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialogRef.current) dialogRef.current.close();
  };

  return (
    <div className={styles.keyContainer}>
      <button
        className={styles.keyButton}
        type="button"
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
      >
        Key
      </button>
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby={headingId}
        onClick={handleDialogClick}
        onCancel={() => dialogRef.current?.close()}
      >
        <div className={styles.legend}>
          <div className={styles.heading} id={headingId}>
            Slope color = absolute degrees
          </div>
          {SLOPE_CLASSES.map((slopeClass) => (
            <div className={styles.item} key={slopeClass.label}>
              <div
                className={styles.swatch}
                style={{ backgroundColor: slopeClass.color }}
                title={slopeClass.label}
              />
              {slopeClass.label}
            </div>
          ))}
          <div className={styles.rows}>Rows: Path Grade · Terrain Slope</div>
          <button
            className={styles.closeButton}
            type="button"
            onClick={() => dialogRef.current?.close()}
          >
            Close
          </button>
        </div>
      </dialog>
    </div>
  );
};

export default SlopeLegend;
