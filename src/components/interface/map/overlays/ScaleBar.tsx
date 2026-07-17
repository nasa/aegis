/**
 * ScaleBar — displays a map scale indicator that updates on zoom/pan.
 *
 * Reads the view resolution to calculate a real-world distance for a pixel width,
 * rounds to a nice value, and renders a proportionally-sized bar.
 *
 * Works with any projection — in projected CRS, resolution is meters/pixel.
 */

import { useEffect, useState } from "react";
import { useMapContext } from "../MapProvider";
import { MODE_CONFIGS } from "../utils/modeConfig";

// Round to a "nice" scale value
function roundToNice(value: number): number {
  const niceValues = [
    1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000,
  ];
  for (const nice of niceValues) {
    if (nice >= value) return nice;
  }
  return value;
}

interface ScaleBarProps {
  className?: string;
}

export function ScaleBar({ className }: ScaleBarProps): JSX.Element | null {
  const { map, mode } = useMapContext();
  const fontSize = MODE_CONFIGS[mode].scaleBar.fontSize;
  const [scale, setScale] = useState({ width: 0, label: "" });

  useEffect(() => {
    const updateScale = () => {
      const view = map.getView();
      const resolution = view.getResolution();
      if (!resolution) return;

      // resolution is meters/pixel in the projected CRS
      const targetPixels = 100;
      const distanceForTargetPx = resolution * targetPixels;
      const nice = roundToNice(distanceForTargetPx);
      const width = (nice / distanceForTargetPx) * targetPixels;
      const label = nice >= 1000 ? `${nice / 1000} km` : `${nice} m`;
      setScale({ width, label });
    };

    map.on("moveend", updateScale);
    updateScale();
    return () => {
      map.un("moveend", updateScale);
    };
  }, [map]);

  if (scale.width <= 0) return null;

  return (
    <div className={className} style={{ width: `${scale.width}px` }}>
      <div
        style={{
          fontSize: `${fontSize}px`,
          border: "1px solid var(--grey3, #666)",
          padding: "5px",
          textAlign: "center",
          fontWeight: 600,
          color: "var(--grey0, #fff)",
          backgroundColor: "var(--grey5, #333)",
          borderRadius: "var(--radius, 4px)",
        }}
      >
        {scale.label}
      </div>
    </div>
  );
}
