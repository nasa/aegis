/**
 * This file is an override of the react-circular-slider types package because the package fails tsc checks with no resolution in sight.
 */

import type React from "react";

interface Continuous {
  enabled: boolean;
  clicks: number;
  interval: number;
}

type KnobPosition = "top" | "right" | "bottom" | "left";

export interface CircularSliderProps {
  label?: string;
  width?: number;
  direction?: number;
  min?: number;
  max?: number;
  initialValue?: number;
  knobColor?: string;
  knobPosition?: KnobPosition | number;
  knobSize?: number;
  hideKnob?: boolean;
  knobDraggable?: boolean;
  labelColor?: string;
  labelBottom?: boolean;
  labelFontSize?: string;
  valueFontSize?: string;
  appendToValue?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderLabelValue?: any;
  prependToValue?: string;
  verticalOffset?: string;
  hideLabelValue?: boolean;
  progressLineCap?: string;
  progressColorFrom?: string;
  progressColorTo?: string;
  useMouseAdditionalToTouch?: boolean;
  progressSize?: number;
  trackColor?: string;
  trackSize?: number;
  trackDraggable?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any[];
  dataIndex?: number;
  onChange?: Function;
  children?: React.ReactNode;
  isDragging?: Function;
  continuous?: Continuous;
}

declare const CircularSlider: React.FC<CircularSliderProps>;
export default CircularSlider;
