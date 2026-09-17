import { useId, useRef, type FunctionComponent, type MouseEvent } from "react";
import { setSlopeColorMode } from "store/interface";
import { getSlopeClass, getSlopeClasses } from "utils/paperSlope";
import { useAppDispatch } from "utils/useAppDispatch";
import { refEqual, useAppSelector } from "utils/useAppSelector";
import styles from "./slope-legend.module.css";

const PATH_GRADE_EXAMPLE = [1, 2, 3, 2, 1, 4, 3, 5, 4, 2, 3, 6, 5, 3, 2, 4, 6, 3, 2, 1, 3, 5, 4, 2];
const TERRAIN_SLOPE_EXAMPLE = [
  3, 8, 12, 17, 14, 9, 19, 22, 16, 11, 7, 15, 21, 18, 13, 9, 16, 23, 20, 14, 10, 17, 12, 6,
];

const SlopeLegend: FunctionComponent = () => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const dispatch = useAppDispatch();
  const colorMode = useAppSelector((state) => state.interface.slopeColorMode, refEqual);
  const slopeClasses = getSlopeClasses(colorMode);

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
      <button
        className={styles.colorblindButton}
        type="button"
        aria-pressed={colorMode === "colorblind"}
        onClick={() =>
          dispatch(setSlopeColorMode(colorMode === "colorblind" ? "standard" : "colorblind"))
        }
      >
        Colorblind
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
          {slopeClasses.map((slopeClass) => (
            <div className={styles.item} key={slopeClass.label}>
              <div
                className={styles.swatch}
                style={{ backgroundColor: slopeClass.color }}
                title={slopeClass.label}
              />
              {slopeClass.label}
            </div>
          ))}
          <div className={styles.slopeRows}>
            <div className={styles.slopeRowHeading}>How the slope rows appear</div>
            <div className={styles.slopePreview}>
              {[
                { label: "Path Grade", slopes: PATH_GRADE_EXAMPLE },
                { label: "Terrain Slope", slopes: TERRAIN_SLOPE_EXAMPLE },
              ].map(({ label, slopes }) => (
                <div className={styles.slopeBand} aria-label={`${label} example`} key={label}>
                  {slopes.map((slope, index) => (
                    <span
                      className={styles.slopeBandClass}
                      style={{ backgroundColor: getSlopeClass(slope, colorMode)?.color }}
                      key={`${slope}-${index}`}
                    />
                  ))}
                </div>
              ))}
            </div>
            <dl className={styles.explanations}>
              <dt>Path Grade (top)</dt>
              <dd>
                The uphill or downhill angle of the path, calculated from elevation change along the
                direction of travel over a 10 m window. Color represents the absolute angle.
              </dd>
              <dt>Terrain Slope (bottom)</dt>
              <dd>
                The steepness of the terrain beneath the path, calculated from the surrounding
                elevation cells regardless of travel direction.
              </dd>
            </dl>
          </div>
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
