import { useSyncExternalStore } from "react";

import { useMapContext } from "../MapProvider";
import {
  formatMapDistance,
  GRID_INTERVAL_PROPERTY,
  type DrawnGridInterval,
} from "../utils/mapScale";
import { ScaleBar } from "./ScaleBar";
import styles from "./mapOverlays.module.css";

export function MapDistanceOverlays({ showScaleBar }: { showScaleBar: boolean }): JSX.Element {
  const { map } = useMapContext();
  const interval = useSyncExternalStore(
    (onChange) => {
      map.addChangeListener(GRID_INTERVAL_PROPERTY, onChange);
      return () => map.removeChangeListener(GRID_INTERVAL_PROPERTY, onChange);
    },
    (): DrawnGridInterval => map.get(GRID_INTERVAL_PROPERTY) ?? null
  );
  return (
    <div className={`${styles.mapReadout} ${styles.mapDistanceDisplay}`}>
      {interval !== null && (
        <div
          className={`${styles.mapReadoutRow} ${styles.mapReadoutText} ${styles.gridIntervalDisplay}`}
        >
          {interval === "lgrs-zones" ? "LGRS zones" : `Grid ${formatMapDistance(interval, "")}`}
        </div>
      )}
      {showScaleBar && <ScaleBar />}
    </div>
  );
}
