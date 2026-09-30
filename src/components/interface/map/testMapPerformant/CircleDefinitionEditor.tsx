import { useState, type Dispatch, type SetStateAction } from "react";
import { switchCircleMode } from "../utils/layers/circleMode";

// Types (CircleConfig, CircleMode, etc.) are ambient — see typings/map/circleConfig.d.ts

interface CircleDefinitionEditorProps {
  title: string;
  circle: CircleConfig;
  setCircle: Dispatch<SetStateAction<CircleConfig>>;
  /** Whether the editor starts collapsed (default: false) */
  defaultCollapsed?: boolean;
}

/**
 * Editor panel for a single range-circle configuration.
 *
 * Renders controls for mode (solid / dashed / checkerboard), radius,
 * stroke properties, and an optional label section.
 */
const CircleDefinitionEditor = ({
  title,
  circle,
  setCircle,
  defaultCollapsed = false,
}: CircleDefinitionEditorProps): JSX.Element => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div
      style={{
        marginTop: "10px",
        padding: "10px",
        border: "1px solid #d1d5db",
        borderRadius: "6px",
        background: "#f3f4f6",
      }}
    >
      {/* Header: visibility checkbox + title + collapse toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={circle.visible}
            onChange={(e) => setCircle((prev) => ({ ...prev, visible: e.target.checked }))}
            style={{ marginRight: "8px" }}
          />
          <span style={{ fontWeight: 600 }}>{title}</span>
        </label>
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          style={{
            border: "1px solid #9ca3af",
            borderRadius: "4px",
            background: "#e5e7eb",
            cursor: "pointer",
            fontSize: "12px",
            padding: "2px 6px",
          }}
        >
          {collapsed ? "Expand" : "Collapse"}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Mode selector */}
          <div style={{ marginTop: "10px", marginBottom: "8px" }}>
            <label style={{ fontSize: "12px", display: "block", marginBottom: "4px" }}>Mode</label>
            <select
              value={circle.mode}
              onChange={(e) =>
                setCircle((prev) => switchCircleMode(prev, e.target.value as CircleMode))
              }
              style={{ width: "100%", height: "28px" }}
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="checkerboard">Checkerboard</option>
            </select>
          </div>

          {/* Radius slider */}
          <div style={{ marginBottom: "8px" }}>
            <label style={{ fontSize: "12px", display: "block", marginBottom: "4px" }}>
              Radius: {circle.radius}m
            </label>
            <input
              type="range"
              min="200"
              max="5000"
              step="50"
              value={circle.radius}
              onChange={(e) => setCircle((prev) => ({ ...prev, radius: Number(e.target.value) }))}
              style={{ width: "100%" }}
            />
          </div>

          {/* Stroke controls — solid / dashed share color+width; checkerboard has its own set */}
          {circle.mode === "solid" || circle.mode === "dashed" ? (
            <>
              <div style={{ display: "flex", gap: "10px", marginBottom: "8px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "12px", display: "block", marginBottom: "4px" }}>
                    Color
                  </label>
                  <input
                    type="color"
                    value={circle.stroke.color}
                    onChange={(e) =>
                      setCircle((prev) => {
                        if (prev.mode === "solid") {
                          return {
                            ...prev,
                            stroke: { ...prev.stroke, color: e.target.value },
                          };
                        }
                        if (prev.mode === "dashed") {
                          return {
                            ...prev,
                            stroke: { ...prev.stroke, color: e.target.value },
                          };
                        }
                        return prev;
                      })
                    }
                    style={{ width: "100%", height: "30px", cursor: "pointer" }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "12px", display: "block", marginBottom: "4px" }}>
                    Width: {circle.stroke.width.toFixed(1)}px
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="0.5"
                    value={circle.stroke.width}
                    onChange={(e) =>
                      setCircle((prev) => {
                        if (prev.mode === "solid") {
                          return {
                            ...prev,
                            stroke: { ...prev.stroke, width: Number(e.target.value) },
                          };
                        }
                        if (prev.mode === "dashed") {
                          return {
                            ...prev,
                            stroke: { ...prev.stroke, width: Number(e.target.value) },
                          };
                        }
                        return prev;
                      })
                    }
                    style={{ width: "100%" }}
                  />
                </div>
              </div>

              {/* Dashed-specific: segment size + dash/gap ratio */}
              {circle.mode === "dashed" && (
                <>
                  <div style={{ marginBottom: "8px" }}>
                    <label style={{ fontSize: "12px", display: "block", marginBottom: "4px" }}>
                      Segment Size: {circle.stroke.segmentPx}px
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="200"
                      step="5"
                      value={circle.stroke.segmentPx}
                      onChange={(e) =>
                        setCircle((prev) => {
                          if (prev.mode !== "dashed") return prev;
                          return {
                            ...prev,
                            stroke: { ...prev.stroke, segmentPx: Number(e.target.value) },
                          };
                        })
                      }
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div style={{ marginBottom: "8px" }}>
                    <label style={{ fontSize: "12px", display: "block", marginBottom: "4px" }}>
                      Dash/Gap Ratio: {circle.stroke.ratio.toFixed(2)}
                    </label>
                    <input
                      type="range"
                      min="0.25"
                      max="3"
                      step="0.05"
                      value={circle.stroke.ratio}
                      onChange={(e) =>
                        setCircle((prev) => {
                          if (prev.mode !== "dashed") return prev;
                          return {
                            ...prev,
                            stroke: { ...prev.stroke, ratio: Number(e.target.value) },
                          };
                        })
                      }
                      style={{ width: "100%" }}
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            /* Checkerboard-specific controls */
            <>
              <div style={{ marginBottom: "8px" }}>
                <label style={{ fontSize: "12px", display: "block", marginBottom: "4px" }}>
                  Segment Size: {circle.stroke.segmentPx}px
                </label>
                <input
                  type="range"
                  min="10"
                  max="200"
                  step="5"
                  value={circle.stroke.segmentPx}
                  onChange={(e) =>
                    setCircle((prev) => {
                      if (prev.mode !== "checkerboard") return prev;
                      return {
                        ...prev,
                        stroke: { ...prev.stroke, segmentPx: Number(e.target.value) },
                      };
                    })
                  }
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ marginBottom: "8px" }}>
                <label style={{ fontSize: "12px", display: "block", marginBottom: "4px" }}>
                  Dash/Gap Ratio: {circle.stroke.ratio.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0.25"
                  max="3"
                  step="0.05"
                  value={circle.stroke.ratio}
                  onChange={(e) =>
                    setCircle((prev) => {
                      if (prev.mode !== "checkerboard") return prev;
                      return {
                        ...prev,
                        stroke: { ...prev.stroke, ratio: Number(e.target.value) },
                      };
                    })
                  }
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ marginBottom: "8px" }}>
                <label style={{ fontSize: "12px", display: "block", marginBottom: "4px" }}>
                  Inner Thickness: {circle.stroke.innerThickness}px
                </label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  value={circle.stroke.innerThickness}
                  onChange={(e) =>
                    setCircle((prev) => {
                      if (prev.mode !== "checkerboard") return prev;
                      return {
                        ...prev,
                        stroke: { ...prev.stroke, innerThickness: Number(e.target.value) },
                      };
                    })
                  }
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ marginBottom: "8px" }}>
                <label style={{ fontSize: "12px", display: "block", marginBottom: "4px" }}>
                  Outer Thickness: {circle.stroke.outerThickness}px
                </label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  value={circle.stroke.outerThickness}
                  onChange={(e) =>
                    setCircle((prev) => {
                      if (prev.mode !== "checkerboard") return prev;
                      return {
                        ...prev,
                        stroke: { ...prev.stroke, outerThickness: Number(e.target.value) },
                      };
                    })
                  }
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ display: "flex", gap: "10px", marginBottom: "8px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "12px", display: "block", marginBottom: "4px" }}>
                    Inner Color
                  </label>
                  <input
                    type="color"
                    value={circle.stroke.innerColor}
                    onChange={(e) =>
                      setCircle((prev) => {
                        if (prev.mode !== "checkerboard") return prev;
                        return {
                          ...prev,
                          stroke: { ...prev.stroke, innerColor: e.target.value },
                        };
                      })
                    }
                    style={{ width: "100%", height: "30px", cursor: "pointer" }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "12px", display: "block", marginBottom: "4px" }}>
                    Outer Color
                  </label>
                  <input
                    type="color"
                    value={circle.stroke.outerColor}
                    onChange={(e) =>
                      setCircle((prev) => {
                        if (prev.mode !== "checkerboard") return prev;
                        return {
                          ...prev,
                          stroke: { ...prev.stroke, outerColor: e.target.value },
                        };
                      })
                    }
                    style={{ width: "100%", height: "30px", cursor: "pointer" }}
                  />
                </div>
              </div>
            </>
          )}

          {/* Label section */}
          <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px solid #d1d5db" }}>
            <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={circle.showLabel}
                onChange={(e) => setCircle((prev) => ({ ...prev, showLabel: e.target.checked }))}
                style={{ marginRight: "8px" }}
              />
              <span style={{ fontSize: "13px", fontWeight: 500 }}>Show Label</span>
            </label>
            {circle.showLabel && (
              <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                <input
                  type="text"
                  value={circle.labelText}
                  onChange={(e) => setCircle((prev) => ({ ...prev, labelText: e.target.value }))}
                  placeholder="Auto label"
                  style={{ flex: 1, height: "28px", padding: "4px 8px" }}
                />
                <input
                  type="color"
                  value={circle.labelColor}
                  onChange={(e) => setCircle((prev) => ({ ...prev, labelColor: e.target.value }))}
                  style={{ width: "48px", height: "28px", cursor: "pointer" }}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default CircleDefinitionEditor;
