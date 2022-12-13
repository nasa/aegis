/**
 * This file contains typings for the MMGIS Config JSON object.
 */

//Represents the config object from MMGIS
interface MMGIS_config {
  msv: MMGIS_Msv;
  projection: MMGIS_Projection;
  look: MMGIS_Look;
  panels: string[];
  panelSettings: MMGIS_PanelSettings;
  tools: MMGIS_Tool[];
  layers: MMGIS_LayerConfig[];
  time: MMGIS_Time3;
}

interface MMGIS_Radius {
  major: string;
  minor: string;
}

interface MMGIS_Msv {
  mission: string;
  site: string;
  masterdb: boolean;
  view: string[];
  radius: MMGIS_Radius;
  mapscale: string;
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

interface MMGIS_Variables2 {
  useKeyAsName: string;
}

interface MMGIS_Time2 {
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

interface MMGIS_Time3 {
  enabled: boolean;
  visible: boolean;
  format: string;
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

interface MMGIS_Sublayer {
  name: string;
  type: string;
  id?: number;
  kind?: string;
  query?: MMGIS_QueryConfig;
  url?: string;
  position?: MMGIS_ModelPosition;
  rotation?: MMGIS_ModelRotation;
  scale?: number;
  tileformat?: "tms" | "wtms" | "wms";
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
  fillOpacity?: any;
  opacity?: number;
  vtId?: string; //vector tile
  vtKey?: string; //vector tile
  vtLayer?: JSON; //vector tile
}

/** Used for Query Layers */
interface MMGIS_QueryConfig {
  endpoint?: string;
  type?: "elasticsearch";
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
