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

interface Style {
  className: string;
  color: string;
  fillColor: string;
  weight: number;
  fillOpacity?: any;
  opacity: number;
}

interface Variables2 {
  useKeyAsName: string;
}

interface Time2 {
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

interface MMGISSublayer {
  name: string;
  kind: string;
  type: string;
  url: string;
  demparser: string;
  controlled: boolean;
  tileformat: string;
  visibility: boolean;
  initialOpacity: number;
  togglesWithHeader: boolean;
  style: Style;
  variables: Variables2;
  radius: number;
  time: Time2;
  shape: string;
  demtileurl: string;
  legend: string;
  minZoom?: number;
  maxNativeZoom?: number;
  maxZoom?: number;
  boundingBox: number[];
}

interface MMGISLayer {
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
  layers: MMGISLayer[];
  time: Time3;
}

interface MMGISConfig {
  id: number;
  mission: string;
  config: Config;
  version: number;
  createdAt: Date;
}

interface AEGISMission {
  id: number;
  mission: string;
  version: number;
  createdAt: Date;
}
