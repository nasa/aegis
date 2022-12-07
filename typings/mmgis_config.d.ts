interface Radius {
  major: string;
  minor: string;
}

interface Msv {
  mission: string;
  site: string;
  masterdb: boolean;
  view: string[];
  radius: Radius;
  mapscale: string;
}

interface Projection {
  custom: boolean;
  epsg: string;
  proj: string;
  xmlpath: string;
  bounds: string[];
  origin: string[];
  reszoomlevel: string;
  resunitsperpixel: string;
  globeproj?: "webmercator"; // added because it exists in one place in DatabaseSeeder
}

interface Look {
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

interface PanelSettings {
  demFallbackPath: string;
  demFallbackFormat?: any;
  demFallbackType?: any;
}

interface Site {
  name: string;
  code: string;
  view: number[];
}

interface TileWithDEM {
  url: string;
  unit: string;
}

interface Variables {
  sites: Site[];
  data: any;
  models: string[];
  tile_with_DEM: TileWithDEM;
  dem: string;
  interpolateSeams?: boolean; // added because it exists in one place in DatabaseSeeder
}

interface Tool {
  name: string;
  icon: string;
  js: string;
  variables: Variables;
}

interface Time {
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

interface Time3 {
  enabled: boolean;
  visible: boolean;
  format: string;
}

interface Config {
  msv: Msv;
  projection: Projection;
  look: Look;
  panels: string[];
  panelSettings: PanelSettings;
  tools: Tool[];
  layers: Layer[];
  time: Time3;
}

interface AEGISMission {
  id: number;
  name: string;
  config: Config;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

interface AEGISLayer {
  uuid: uuid;
  mission: AEGISMission;
  config: LayerConfig;
  createdAt: Date;
  updatedAt: Date;
}

interface LayerConfig {
  name: string;
  type: string;
  demparser: string;
  controlled: boolean;
  tileformat: string;
  initialOpacity: number;
  time: Time;
  shape: string;
  sublayers: Sublayer[];
}

interface Time {
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

interface Sublayer {
  id: number;
  name: string;
  kind: string;
  type: string;
  url: string;
  demparser: string;
  demtileurl?: string;
  minZoom?: number;
  maxNativeZoom?: number;
  maxZoom?: number;
  boundingBox?: number[];
  legend: string;
  tms: boolean;
  controlled: boolean;
  tileformat: string;
  visibility: boolean;
  initialOpacity: number;
  togglesWithHeader: boolean;
  style: SublayerStyle;
  variables: Sublayer_Variables;
  radius: number;
  time: Time;
  shape: string;
  visibilitycutoff: number;
}

interface SublayerStyle {
  className: string;
  color: string;
  fillColor: string;
  weight: number;
  fillOpacity?: any;
  opacity: number;
}

interface Sublayer_Variables {
  useKeyAsName: string;
  chemistry: [string];
  search: string;
}
