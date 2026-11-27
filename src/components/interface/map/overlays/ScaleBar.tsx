import { useEffect, useState } from "react";

import { useMapContext } from "../MapProvider";
import { getGroundMetersPerPixel, getScaleBarLayout } from "../utils/mapScale";
import { MODE_CONFIGS } from "../utils/modeConfig";
import overlayStyles from "./mapOverlays.module.css";
import styles from "./ScaleBar.module.css";

export function ScaleBar({ className }: { className?: string }): JSX.Element | null {
  const { map, mode, planetRadius } = useMapContext();
  const config = MODE_CONFIGS[mode].scaleBar;
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

  const layout = getScaleBarLayout(metersPerPixel, config);
  if (!layout) return null;
  const { width, ticks, symbol } = layout;
  const divisions = ticks.length - 1;
  const total = `${ticks[divisions]} ${symbol}`;

  return (
    <div
      className={`${styles.graphic} ${className ?? ""}`}
      role="img"
      aria-label={`Map scale ${total}`}
      style={{ width, fontSize: `${config.fontScale}em` }}
    >
      {config.showTickLabels ? (
        <div
          className={`${overlayStyles.mapReadoutText} ${styles.labels}`}
          aria-hidden="true"
          style={{ gridTemplateColumns: `repeat(${divisions}, minmax(0, 1fr)) 0` }}
        >
          {ticks.map((value, index) => (
            <span key={value} className={styles.tick}>
              <span>{value}</span>
              {index === divisions && <span className={styles.unit}> {symbol}</span>}
            </span>
          ))}
        </div>
      ) : (
        <div className={`${overlayStyles.mapReadoutText} ${styles.labels}`} aria-hidden="true">
          <span className={`${styles.tick} ${styles.totalTick}`}>{total}</span>
        </div>
      )}
      <div className={styles.bar} aria-hidden="true" style={{ height: config.barHeight }}>
        {Array.from({ length: divisions }, (_, index) => (
          <span key={index} className={styles.segment} />
        ))}
      </div>
    </div>
  );
}
