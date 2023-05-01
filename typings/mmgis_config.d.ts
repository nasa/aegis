/**
 * This file contains typings for the MMGIS Config JSON object.
 */

//Represents the config object from MMGIS.
interface MMGIS_config {
  msv: MMGIS_Msv;
  projection: MMGIS_Projection;
  look: MMGIS_Look;
  panels: string[];
  panelSettings: MMGIS_PanelSettings;
  tools: MMGIS_Tool[];
  layers: MMGIS_LayerConfig[];
  time: MMGIS_ConfigTime;
}

interface MMGIS_ConfigTime {
  enabled: boolean;
  visible: boolean;
  format: string;
}

interface MMGIS_Radius {
  major: string; //meters
  minor: string; //meters
}

interface MMGIS_Msv {
  mission: string;
  site: string;
  masterdb: boolean;
  view: string[];
  radius: MMGIS_Radius;
  mapscale: string;
  layers?: object;
}

interface MMGIS_Projection {
  custom: boolean;
  epsg: string;
  proj: string;
  xmlpath: string;
  bounds: string[];
  origin: string[];
  reszoomlevel: number;
  resunitsperpixel: number;
  globeproj?: "webmercator"; // added because it exists in one place in DatabaseSeeder
}

interface MMGIS_Look {
  pagename: string;
  minimalist: boolean;
  zoomcontrol: boolean;
  graticule: boolean;
  coordll: boolean;
  coorden: boolean;
  coordrxy: boolean;
  coordsite: boolean;
  coordelev: boolean;
  coordelevurl: string;
  coordlngoffset: string;
  coordlatoffset: string;
  coordeastoffset: string;
  coordnorthoffset: string;
  coordeastmult: string;
  coordnorthmult: string;
  primarycolor: string;
  secondarycolor: string;
  tertiarycolor: string;
  accentcolor: string;
  bodycolor: string;
  topbarcolor: string;
  toolbarcolor: string;
  mapcolor: string;
  highlightcolor: string;
  copylink: boolean;
  screenshot: boolean;
  fullscreen: boolean;
  help: boolean;
  logourl: string;
  helpurl: string;
  swap?: boolean; // added because it exists in one place in DatabaseSeeder
}

interface MMGIS_PanelSettings {
  demFallbackPath: string;
  demFallbackFormat: string | null;
  demFallbackType: string | null;
}

interface MMGIS_Tool {
  name: string;
  icon: string;
  js: string;
  //variables: Variables;
  variables: JSON;
}

interface MMGIS_Time {
  enabled: boolean;
  type: string;
  isRelative: boolean;
  current: Date;
  start: string;
  end: string;
  format: string;
  refresh: string;
  increment: string;
}

interface MMGIS_Style {
  className: string;
  color: string;
  fillColor: string;
  weight: number;
  fillOpacity?: any;
  opacity: number;
}

/** Represents the Layer JSON structure from the MMGIS Config */
interface MMGIS_LayerConfig {
  name: string;
  type: string;
  demparser?: string;
  controlled?: boolean;
  tileformat?: string;
  initialOpacity?: number;
  time?: MMGIS_Time;
  shape?: string;
  sublayers?: MMGIS_Sublayer[];
}

type MMGIS_layerTypes = "header" | "tile" | "vector" | "vectortile" | "query" | "data" | "model";
type MMGIS_tileFormats = "tms" | "wtms" | "wms";

interface MMGIS_Sublayer {
  name: string;
  type: MMGIS_layerTypes;
  //id?: number;
  kind?: string;
  query?: MMGIS_QueryConfig;
  url?: string;
  position?: MMGIS_ModelPosition;
  rotation?: MMGIS_ModelRotation;
  scale?: number;
  tileformat?: MMGIS_tileFormats;
  demtileurl?: string;
  demparser?: string;
  controlled?: boolean;
  legend?: string;
  visibility?: boolean;
  visibilitycutoff?: number;
  minZoom?: number;
  maxNativeZoom?: number;
  maxZoom?: number;
  initialOpacity?: number;
  boundingBox?: number[];
  time?: MMGIS_Time;
  style?: MMGIS_SublayerStyle;
  radius?: number;
  shape?: string;
  variables?: JSON;
  togglesWithHeader?: boolean;
}

interface MMGIS_SublayerStyle {
  className?: string;
  color?: string;
  fillColor?: string;
  weight?: number;
  fillOpacity?: number;
  opacity?: number;
  vtId?: string; //vector tile
  vtKey?: string; //vector tile
  vtLayer?: JSON; //vector tile
}

/** Used for Query Layers */
interface MMGIS_QueryConfig {
  endpoint?: string;
  type?: string;
}

/** Used for Model Layers */
interface MMGIS_ModelPosition {
  longtitude?: number;
  latitude?: number;
  elevation?: number;
}

/** Used for Model Layers */
interface MMGIS_ModelRotation {
  x?: number;
  y?: number;
  z?: number;
}
