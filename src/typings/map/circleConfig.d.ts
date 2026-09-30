/**
 * Circle Configuration Types for OpenLayers Circles
 *
 * Ambient type declarations for the three circle stroke modes
 * (solid, dashed, checkerboard) used by the map control panel.
 */

type CircleMode = "solid" | "dashed" | "checkerboard";

interface CircleCommonConfig {
  visible: boolean;
  radius: number;
  showLabel: boolean;
  labelText: string;
  labelColor: string;
  zIndex: number;
}

interface SolidCircleConfig extends CircleCommonConfig {
  mode: "solid";
  stroke: {
    color: string;
    width: number;
  };
}

interface DashedCircleConfig extends CircleCommonConfig {
  mode: "dashed";
  stroke: {
    color: string;
    width: number;
    segmentPx: number;
    ratio: number;
  };
}

interface CheckerboardCircleConfig extends CircleCommonConfig {
  mode: "checkerboard";
  stroke: {
    segmentPx: number;
    ratio: number;
    innerThickness: number;
    outerThickness: number;
    innerColor: string;
    outerColor: string;
  };
}

type CircleConfig = SolidCircleConfig | DashedCircleConfig | CheckerboardCircleConfig;
