import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";
import { defaultGridStyle } from "./sublayer";

/**
 * Generate a blank preset
 * @param partialPreset any fields that are to be overridden from default
 * @returns the generated preset
 */
export const generateBlankPreset = (partialPreset?: Partial<Preset>): Preset => {
  const defaultNewPreset: Preset = {
    uuid: uuidv4(),
    name: "",
    ownerId: null,
    description: "",
    missionDefault: false,
    layerOrder: [],
    mapSublayerControls: {},
    mapCircleControls: {},
    mapGridControl: {
      visible: false,
      labelsVisible: false,
      style: { ...defaultGridStyle },
    },
    createdAt: getAccurateNow().getTime(),
    updatedAt: getAccurateNow().getTime(),
  };
  return { ...defaultNewPreset, ...partialPreset };
};

/**
 * Backward-compat: the label halo style fields were renamed
 * labelStroke*  →  labelHalo*. Map any legacy keys on a style object in place so
 * presets saved before the rename keep their halo settings.
 */
export function migrateLegacyHaloStyle(style: MapSublayerStyle | null | undefined): void {
  if (!style) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = style as any;
  if ("labelStrokeColor" in s) {
    if (s.labelHaloColor === undefined) s.labelHaloColor = s.labelStrokeColor;
    delete s.labelStrokeColor;
  }
  if ("labelStrokeWidth" in s) {
    if (s.labelHaloWidth === undefined) s.labelHaloWidth = s.labelStrokeWidth;
    delete s.labelStrokeWidth;
  }
  if ("labelStrokeOpacity" in s) {
    if (s.labelHaloOpacity === undefined) s.labelHaloOpacity = s.labelStrokeOpacity;
    delete s.labelStrokeOpacity;
  }
}

export function migrateLegacyCircleControlHaloStyles(
  mapCircleControls: MapCircleControls | null | undefined
): void {
  for (const control of Object.values(mapCircleControls ?? {})) {
    migrateLegacyHaloStyle(control.style);
  }
}
