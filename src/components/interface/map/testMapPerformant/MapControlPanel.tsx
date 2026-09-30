import { useState, type Dispatch, type SetStateAction } from "react";
import CircleDefinitionEditor from "./CircleDefinitionEditor";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CircleEntry {
  title: string;
  config: CircleConfig;
  setConfig: Dispatch<SetStateAction<CircleConfig>>;
  defaultCollapsed?: boolean;
}

interface PerformanceStats {
  majorFeatureCount: number;
  minorFeatureCount: number;
  majorLoadTime: number;
  minorLoadTime: number;
}

interface MapControlPanelProps {
  // NAC layer
  showNAC: boolean;
  setShowNAC: Dispatch<SetStateAction<boolean>>;
  // NAC COG layer
  showCOG: boolean;
  setShowCOG: Dispatch<SetStateAction<boolean>>;
  // NAC COG from S3 (performance comparison)
  showCOGS3: boolean;
  setShowCOGS3: Dispatch<SetStateAction<boolean>>;
  // Major contours
  showMajorContours: boolean;
  setShowMajorContours: Dispatch<SetStateAction<boolean>>;
  majorLoading: boolean;
  showMajorLabels: boolean;
  setShowMajorLabels: Dispatch<SetStateAction<boolean>>;
  // Minor contours
  showMinorContours: boolean;
  setShowMinorContours: Dispatch<SetStateAction<boolean>>;
  minorLoading: boolean;
  showMinorLabels: boolean;
  setShowMinorLabels: Dispatch<SetStateAction<boolean>>;
  // Circles
  circles: CircleEntry[];
  // Nomenclature
  showPlaceLabels: boolean;
  setShowPlaceLabels: Dispatch<SetStateAction<boolean>>;
  // Demo features
  showDemoPolyline: boolean;
  setShowDemoPolyline: Dispatch<SetStateAction<boolean>>;
  showDemoPolylineLabels: boolean;
  setShowDemoPolylineLabels: Dispatch<SetStateAction<boolean>>;
  // Vector tiles (native projection)
  showVectorTiles: boolean;
  setShowVectorTiles: Dispatch<SetStateAction<boolean>>;
  // Stats
  performanceStats: PerformanceStats;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Floating control panel for the OpenLayers test map.
 *
 * Provides toggles for every map layer, a collapsible circle editor section,
 * nomenclature toggle, demo-feature toggles, and load-time stats.
 */
const MapControlPanel = ({
  showNAC,
  setShowNAC,
  showCOG,
  setShowCOG,
  showCOGS3,
  setShowCOGS3,
  showMajorContours,
  setShowMajorContours,
  majorLoading,
  showMajorLabels,
  setShowMajorLabels,
  showMinorContours,
  setShowMinorContours,
  minorLoading,
  showMinorLabels,
  setShowMinorLabels,
  circles,
  showPlaceLabels,
  setShowPlaceLabels,
  showDemoPolyline,
  setShowDemoPolyline,
  showDemoPolylineLabels,
  setShowDemoPolylineLabels,
  showVectorTiles,
  setShowVectorTiles,
  performanceStats,
}: MapControlPanelProps): JSX.Element => {
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [circlesCollapsed, setCirclesCollapsed] = useState(false);

  return (
    <div
      style={{
        position: "absolute",
        top: 10,
        right: 10,
        background: "rgba(255, 255, 255, 0.97)",
        padding: "15px",
        borderRadius: "8px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        fontFamily: "sans-serif",
        fontSize: "14px",
        minWidth: "280px",
        maxWidth: "320px",
      }}
    >
      {/* CSS for the hourglass spinner */}
      <style>
        {`
          @keyframes rotate {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
          .rotating-icon {
            display: inline-block;
            animation: rotate 1s linear infinite;
          }
        `}
      </style>

      {/* Title + collapse */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
        }}
      >
        <h3
          style={{
            margin: "0 0 15px 0",
            fontSize: "17px",
            fontWeight: "bold",
            color: "#2563eb",
          }}
        >
          Performance Optimized Map
        </h3>
        <button
          type="button"
          onClick={() => setControlsCollapsed((prev) => !prev)}
          style={{
            marginBottom: "12px",
            border: "1px solid #9ca3af",
            borderRadius: "4px",
            background: "#e5e7eb",
            cursor: "pointer",
            fontSize: "12px",
            padding: "3px 8px",
          }}
        >
          {controlsCollapsed ? "Expand" : "Collapse"}
        </button>
      </div>

      {!controlsCollapsed && (
        <>
          {/* NAC Layer (S3 tiles) */}
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showNAC}
                onChange={(e) => setShowNAC(e.target.checked)}
                style={{ marginRight: "8px" }}
              />
              <span>Show NAC Layer (S3 Tiles)</span>
            </label>
          </div>

          {/* NAC COG Layer (local / nginx) */}
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showCOG}
                onChange={(e) => setShowCOG(e.target.checked)}
                style={{ marginRight: "8px" }}
              />
              <span>Show NAC COG (Local)</span>
            </label>
            <div style={{ fontSize: "11px", color: "#666", marginTop: "2px", marginLeft: "24px" }}>
              COG served via nginx — cached Range requests
            </div>
          </div>

          {/* NAC COG Layer (S3) */}
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showCOGS3}
                onChange={(e) => setShowCOGS3(e.target.checked)}
                style={{ marginRight: "8px" }}
              />
              <span>Show NAC COG (S3)</span>
            </label>
            <div style={{ fontSize: "11px", color: "#666", marginTop: "2px", marginLeft: "24px" }}>
              COG served directly from S3
            </div>
          </div>

          {/* Major Contours */}
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showMajorContours}
                onChange={(e) => setShowMajorContours(e.target.checked)}
                style={{ marginRight: "8px" }}
              />
              <span style={{ fontWeight: 500 }}>
                Major Contours {majorLoading && "⏳"}
                {performanceStats.majorFeatureCount > 0 && (
                  <span style={{ fontSize: "11px", color: "#666", marginLeft: "5px" }}>
                    ({performanceStats.majorFeatureCount.toLocaleString()} features)
                  </span>
                )}
              </span>
            </label>
            {showMajorContours && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                  marginLeft: "24px",
                  marginTop: "5px",
                }}
              >
                <input
                  type="checkbox"
                  checked={showMajorLabels}
                  onChange={(e) => setShowMajorLabels(e.target.checked)}
                  style={{ marginRight: "8px" }}
                />
                <span style={{ fontSize: "13px" }}>Show Labels</span>
              </label>
            )}
          </div>

          {/* Minor Contours */}
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showMinorContours}
                onChange={(e) => setShowMinorContours(e.target.checked)}
                style={{ marginRight: "8px" }}
              />
              <span style={{ fontWeight: 500 }}>
                Minor Contours {minorLoading && <span className="rotating-icon">⏳</span>}
                {performanceStats.minorFeatureCount > 0 && (
                  <span style={{ fontSize: "11px", color: "#666", marginLeft: "5px" }}>
                    ({performanceStats.minorFeatureCount.toLocaleString()} features)
                  </span>
                )}
              </span>
            </label>
            {showMinorContours && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                  marginLeft: "24px",
                  marginTop: "5px",
                }}
              >
                <input
                  type="checkbox"
                  checked={showMinorLabels}
                  onChange={(e) => setShowMinorLabels(e.target.checked)}
                  style={{ marginRight: "8px" }}
                />
                <span style={{ fontSize: "13px" }}>Show Labels</span>
              </label>
            )}
          </div>

          {/* Circles */}
          <div
            style={{
              marginTop: "15px",
              paddingTop: "12px",
              borderTop: "1px solid #ddd",
              background: "#e5e7eb",
              borderRadius: "8px",
              padding: "10px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: "8px", fontSize: "14px" }}>Circles</div>
              <button
                type="button"
                onClick={() => setCirclesCollapsed((prev) => !prev)}
                style={{
                  border: "1px solid #9ca3af",
                  borderRadius: "4px",
                  background: "#d1d5db",
                  cursor: "pointer",
                  fontSize: "12px",
                  padding: "2px 6px",
                  marginBottom: "8px",
                }}
              >
                {circlesCollapsed ? "Expand" : "Collapse"}
              </button>
            </div>
            {!circlesCollapsed &&
              circles.map((entry) => (
                <CircleDefinitionEditor
                  key={entry.title}
                  title={entry.title}
                  circle={entry.config}
                  setCircle={entry.setConfig}
                  defaultCollapsed={entry.defaultCollapsed}
                />
              ))}
          </div>

          {/* Nomenclature */}
          <div style={{ marginTop: "15px", paddingTop: "12px", borderTop: "1px solid #ddd" }}>
            <div style={{ fontWeight: 600, marginBottom: "8px", fontSize: "14px" }}>
              Nomenclature
            </div>
            <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showPlaceLabels}
                onChange={(e) => setShowPlaceLabels(e.target.checked)}
                style={{ marginRight: "8px" }}
              />
              <span style={{ fontWeight: 500 }}>Show Place Labels</span>
            </label>
          </div>

          {/* Demo Features */}
          <div style={{ marginTop: "15px", paddingTop: "12px", borderTop: "1px solid #ddd" }}>
            <div style={{ fontWeight: 600, marginBottom: "8px", fontSize: "14px" }}>
              Demo Features
            </div>
            <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showDemoPolyline}
                onChange={(e) => setShowDemoPolyline(e.target.checked)}
                style={{ marginRight: "8px" }}
              />
              <span style={{ fontWeight: 500 }}>Demo Polyline</span>
            </label>
            {showDemoPolyline && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                  marginLeft: "24px",
                  marginTop: "5px",
                }}
              >
                <input
                  type="checkbox"
                  checked={showDemoPolylineLabels}
                  onChange={(e) => setShowDemoPolylineLabels(e.target.checked)}
                  style={{ marginRight: "8px" }}
                />
                <span style={{ fontSize: "13px" }}>Show Labels</span>
              </label>
            )}
            <div style={{ fontSize: "11px", color: "#666", marginTop: "4px", marginLeft: "24px" }}>
              Styled polyline with arrows &amp; distances
            </div>
          </div>

          {/* Vector Tile Contours (native projection) */}
          <div style={{ marginTop: "15px", paddingTop: "12px", borderTop: "1px solid #ddd" }}>
            <div
              style={{ fontWeight: 600, marginBottom: "8px", fontSize: "14px", color: "#059669" }}
            >
              Vector Tiles (Experimental)
            </div>
            <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showVectorTiles}
                onChange={(e) => setShowVectorTiles(e.target.checked)}
                style={{ marginRight: "8px" }}
              />
              <span style={{ fontWeight: 500 }}>Native-Projection Contours</span>
            </label>
            <div style={{ fontSize: "11px", color: "#666", marginTop: "4px", marginLeft: "24px" }}>
              PMTiles in IAU2000:30166 — zero reprojection
            </div>
          </div>

          {/* Performance stats (shown only after data loads) */}
          {performanceStats.majorLoadTime > 0 && (
            <div
              style={{
                marginTop: "15px",
                paddingTop: "12px",
                borderTop: "1px solid #ddd",
                fontSize: "11px",
                color: "#666",
              }}
            >
              <div>Major: loaded in {(performanceStats.majorLoadTime / 1000).toFixed(2)}s</div>
              {performanceStats.minorLoadTime > 0 && (
                <div>Minor: loaded in {(performanceStats.minorLoadTime / 1000).toFixed(2)}s</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MapControlPanel;
