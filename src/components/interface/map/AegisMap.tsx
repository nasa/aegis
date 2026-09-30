/**
 * AegisMap — top-level map wrapper component
 *
 * Renders a `<div>` container, wires up `<MapProvider>` (OL Map + Context),
 * and renders children (behavior + overlay components) inside the provider.
 *
 * Usage:
 *
 * ```tsx
 * <FeatureSourcesProvider>
 *   <AegisMap mode="editor" className="editor-map">
 *     <TileLayers />
 *     <StationMarkers />
 *     ...
 *   </AegisMap>
 * </FeatureSourcesProvider>
 * ```
 *
 * The container div fills its parent by default. Override with `style` or `className`.
 */

import { useRef, type CSSProperties, type ReactNode } from "react";
import "ol/ol.css";

import { MapProvider } from "./MapProvider";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AegisMapProps {
  mode: MapMode;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function AegisMap({ mode, children, className, style }: AegisMapProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height: "100%", position: "relative", ...style }}
    >
      <MapProvider containerRef={containerRef} mode={mode}>
        {children}
      </MapProvider>
    </div>
  );
}
