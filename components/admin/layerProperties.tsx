/**
 * Determines the properties for a given layer type.
 * Each MMGIS type of layer has a different set of properties.
 * @param layerType the type of layer
 * @returns the set of properties that are used for this layer type
 */
export function getLayerProperties(layerType: MMGIS_layerTypes): LayerPropertyListing | null {
  switch (layerType) {
    case "tile":
      return view_tile;
    case "vector":
      return view_vector;
    case "vectortile":
      return view_vectortile;
    case "query":
      return view_query;
    case "data":
      return view_data;
    case "model":
      return view_model;
    default:
      return null;
  }
}

export type LayerPropertyListing = {
  name: boolean;
  type: boolean;
  kind: boolean;
  query: boolean;
  url: boolean;
  position: boolean;
  rotation: boolean;
  scale: boolean;
  tileformat: boolean;
  demtileurl: boolean;
  demparser: boolean;
  controlled: boolean;
  legend: boolean;
  visibility: boolean;
  visibilitycutoff: boolean;
  minZoom: boolean;
  maxNativeZoom: boolean;
  maxZoom: boolean;
  initialOpacity: boolean;
  boundingBox: boolean;
  time: boolean;
  styleGeneric: boolean;
  stylevt: boolean;
  radius: boolean;
  shape: boolean;
  variables: boolean;
  togglesWithHeader: boolean;
};

const view_tile: LayerPropertyListing = {
  name: true,
  type: true,
  kind: false,
  query: false,
  url: true,
  position: false,
  rotation: false,
  scale: false,
  tileformat: true,
  demtileurl: true,
  demparser: true,
  controlled: false,
  legend: true,
  visibility: true,
  visibilitycutoff: false,
  minZoom: true,
  maxNativeZoom: true,
  maxZoom: true,
  initialOpacity: true,
  boundingBox: true,
  time: true,
  styleGeneric: false,
  stylevt: false,
  radius: false,
  shape: false,
  variables: false,
  togglesWithHeader: false,
};

const view_vector: LayerPropertyListing = {
  name: true,
  type: true,
  kind: true,
  query: false,
  url: true,
  position: false,
  rotation: false,
  scale: false,
  tileformat: false,
  demtileurl: false,
  demparser: false,
  controlled: true,
  legend: true,
  visibility: true,
  visibilitycutoff: true,
  minZoom: false,
  maxNativeZoom: false,
  maxZoom: false,
  initialOpacity: true,
  boundingBox: false,
  time: true,
  styleGeneric: true,
  stylevt: false,
  radius: true,
  shape: true,
  variables: true,
  togglesWithHeader: false,
};

const view_vectortile: LayerPropertyListing = {
  name: true,
  type: true,
  kind: true,
  query: false,
  url: true,
  position: false,
  rotation: false,
  scale: false,
  tileformat: true,
  demtileurl: true,
  demparser: true,
  controlled: false,
  legend: true,
  visibility: true,
  visibilitycutoff: false,
  minZoom: true,
  maxNativeZoom: true,
  maxZoom: true,
  initialOpacity: true,
  boundingBox: false,
  time: true,
  styleGeneric: false,
  stylevt: true,
  radius: false,
  shape: true,
  variables: true,
  togglesWithHeader: false,
};

const view_data: LayerPropertyListing = {
  name: true,
  type: true,
  kind: false,
  query: false,
  url: false,
  position: false,
  rotation: false,
  scale: false,
  tileformat: false,
  demtileurl: true,
  demparser: true,
  controlled: false,
  legend: true,
  visibility: true,
  visibilitycutoff: false,
  minZoom: true,
  maxNativeZoom: true,
  maxZoom: true,
  initialOpacity: true,
  boundingBox: true,
  time: true,
  styleGeneric: false,
  stylevt: false,
  radius: false,
  shape: false,
  variables: true,
  togglesWithHeader: false,
};

const view_query: LayerPropertyListing = {
  name: true,
  type: true,
  kind: false,
  query: true,
  url: false,
  position: false,
  rotation: false,
  scale: false,
  tileformat: false,
  demtileurl: false,
  demparser: false,
  controlled: false,
  legend: false,
  visibility: false,
  visibilitycutoff: false,
  minZoom: false,
  maxNativeZoom: false,
  maxZoom: false,
  initialOpacity: false,
  boundingBox: false,
  time: false,
  styleGeneric: true,
  stylevt: false,
  radius: true,
  shape: false,
  variables: true,
  togglesWithHeader: false,
};

const view_model: LayerPropertyListing = {
  name: true,
  type: true,
  kind: false,
  query: false,
  url: true,
  position: true,
  rotation: true,
  scale: true,
  tileformat: false,
  demtileurl: false,
  demparser: false,
  controlled: false,
  legend: false,
  visibility: true,
  visibilitycutoff: false,
  minZoom: false,
  maxNativeZoom: false,
  maxZoom: false,
  initialOpacity: true,
  boundingBox: false,
  time: true,
  styleGeneric: false,
  stylevt: false,
  radius: false,
  shape: false,
  variables: false,
  togglesWithHeader: false,
};
