import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";

export const defaultSublayerStyle: MapSublayerStyle = {
  opacity: 1,
  contrast: 1,
  brightness: 1,
  saturation: 1,
  blendMode: "normal",
  color: "#FFFFFF",
  weight: 1,
  fillColor: "none",
  fillOpacity: 0,
  isDashed: false,
  dashLen: 10,
  altColor: "#FFFFFF",
  altOpacity: 1,
  showLabels: true,
  labelColor: "#ffffff",
  labelHaloColor: "#000000",
  labelHaloWidth: 2,
  labelHaloOpacity: 0.2,
};

/**
 * Default style for the mission grid. Kept separate from `defaultSublayerStyle`
 * so grid-specific label defaults (a 4px halo) don't change how
 * vector/circle labels render.
 */
export const defaultGridStyle: MapSublayerStyle = {
  ...defaultSublayerStyle,
  color: "#ffffff",
  opacity: 0.4,
  labelHaloWidth: 4,
  labelHaloOpacity: 0.2,
};
/**
 * Generate a blank sublayer
 * @param partialSublayer any fields that are to be overridden from default
 * @returns the generated layer
 */
export const generateBlankSublayer = (partialSublayer?: Partial<Sublayer>): Sublayer => {
  const defaultNewSublayer: Sublayer = {
    uuid: uuidv4(),
    layerUuid: "",
    name: "",
    description: "",
    legend: { legend: [], unitsAbbr: "", version: "" },
    path: "",
    tilePattern: "",
    type: "tile",
    boundingBox: [],
    tileFormat: "tms",
    minNativeZoom: 0,
    maxNativeZoom: 0,
    maxZoom: 30,
    isTimeBased: false,
    timeLayerManifest: [],
    createdAt: getAccurateNow().getTime(),
    updatedAt: getAccurateNow().getTime(),
  };
  return { ...defaultNewSublayer, ...partialSublayer };
};
