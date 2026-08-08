import styles from "./AegisMap3DPlaceholder.module.css";

export function AegisMap3DPlaceholder(): JSX.Element {
  return (
    <div className={styles.container} aria-label="3D map placeholder">
      <div className={styles.label}>3D map</div>
    </div>
  );
}
