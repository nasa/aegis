import { useEffect, useState } from "react";

import { useMapContext } from "../MapProvider";
import { getGroundMetersPerPixel, getMapDistanceLabel } from "../utils/mapScale";
import overlayStyles from "./mapOverlays.module.css";
import styles from "./ScaleBar.module.css";

export function ScaleBar({ className }: { className?: string }): JSX.Element | null {
  const { map, planetRadius } = useMapContext();
  const [metersPerPixel, setMetersPerPixel] = useState(0);

  useEffect(() => {
    const view = map.getView();
    const updateScale = () => setMetersPerPixel(getGroundMetersPerPixel(view, planetRadius));
    const scheduleUpdate = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        updateScale();
      });
    };
    let frame: number | null = null;

    view.on(["change:center", "change:resolution", "change:rotation"], scheduleUpdate);
    map.on("moveend", updateScale);
    updateScale();
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      view.un(["change:center", "change:resolution", "change:rotation"], scheduleUpdate);
      map.un("moveend", updateScale);
    };
  }, [map, planetRadius]);

  if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) return null;

  // Successive 1–2–5 distances keep the bar between 60 and 150 pixels wide.
  const target = 60 * metersPerPixel;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const step = [1, 2, 5, 10].find((value) => value * magnitude >= target)!;
  const distance = step * magnitude;
  const divisions = step === 5 ? 5 : 4;
  const { value, symbol, unitName } = getMapDistanceLabel(distance);

  return (
    <div className={`${overlayStyles.mapReadoutRow} ${className ?? ""}`}>
      <div
        className={styles.graphic}
        role="img"
        aria-label={`Map scale ${value} ${symbol}`}
        style={{ width: distance / metersPerPixel }}
      >
        <div className={`${overlayStyles.mapReadoutText} ${styles.labels}`} aria-hidden="true">
          <span>0</span>
          <span>{value}</span>
        </div>
        <div className={styles.bar} aria-hidden="true">
          {Array.from({ length: divisions }, (_, index) => (
            <span key={index} className={styles.segment} />
          ))}
        </div>
        <div className={`${overlayStyles.mapReadoutText} ${styles.unit}`} aria-hidden="true">
          {unitName}
        </div>
      </div>
    </div>
  );
}
