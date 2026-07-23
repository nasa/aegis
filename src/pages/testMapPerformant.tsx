/**
 * Test Map — Performant OpenLayers Demo Page
 *
 * Thin page that composes the OL component building blocks to demonstrate
 * the high-performance approach for rendering large GeoJSON files (35–138 MB)
 * on a custom Lunar projection (IAU2000:30166, South Pole Stereographic).
 *
 * All reusable logic lives in dedicated modules:
 *   - Style factories    → components/interface/map/testMapPerformant/ (contours, placeLabels)
 *   - Circle helpers     → components/interface/map/testMapPerformant/circleConfig
 *   - Polyline demo      → components/interface/map/testMapPerformant/polylineDemo
 *   - Tilemap metadata   → components/interface/map/utils/parsers/tilemapResource
 *   - PMTiles / shim     → components/interface/map/utils/parsers/ (esriPMTiles, leafletShim)
 *   - UI components      → components/interface/map/testMapPerformant/MapControlPanel
 */

import { useEffect, useRef, useState } from "react";
import "ol/ol.css";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorImageLayer from "ol/layer/VectorImage";
import VectorTileLayer from "ol/layer/VectorTile";
import WebGLTileLayer from "ol/layer/WebGLTile";
import VectorSource from "ol/source/Vector";
import GeoTIFFSource from "ol/source/GeoTIFF";
import XYZ from "ol/source/XYZ";
import TileGrid from "ol/tilegrid/TileGrid";
import MVT from "ol/format/MVT";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { Style, Icon, Stroke } from "ol/style";
import GeoJSON from "ol/format/GeoJSON";
import { Translate } from "ol/interaction";
import proj4 from "proj4";
import { register } from "ol/proj/proj4";
import { get as getProjection } from "ol/proj";
import { PMTilesVectorSource } from "ol-pmtiles";
import { PMTiles } from "pmtiles";

// Utility modules (pure logic — no React)
import {
  createDemoPolylineLayer,
  DEMO_POLYLINE_COORDINATES,
} from "components/interface/map/testMapPerformant/polylineDemo";
import { buildCircleLayer } from "components/interface/map/testMapPerformant/circleConfig";
import { fetchTilemapResource } from "components/interface/map/utils/parsers/tilemapResource";
import { buildLegacyResolutions } from "components/interface/map/utils/parsers/leafletShim";
import {
  createMajorContourStyle,
  createMinorContourStyle,
} from "components/interface/map/testMapPerformant/contours";
import { createPlaceLabelStyle } from "components/interface/map/testMapPerformant/placeLabels";
import {
  parseEsriPmtilesMetadata,
  buildTileGrid,
} from "components/interface/map/utils/parsers/esriPMTiles";

// UI components
import MapControlPanel from "components/interface/map/testMapPerformant/MapControlPanel";

// Types (CircleConfig, etc.) are ambient — see typings/map/circleConfig.d.ts

// ---------------------------------------------------------------------------
// Demo constants — hardcoded for the test page
// ---------------------------------------------------------------------------

const MISSION_ID = 25;
const INITIAL_VIEW_ZOOM = 12;

const NAC_TILE_BASE_URL =
  "https://ares-aegis.s3.us-gov-west-1.amazonaws.com/NAC_POLE_SOUTH_CM_AVG_MERGE";

const NAC_COG_URL = "/static/test/NAC_POLE_SOUTH_CM_AVG_MERGE_cog.tif";
const NAC_COG_S3_URL =
  "https://ares-aegis.s3.us-gov-west-1.amazonaws.com/NAC_POLE_SOUTH_CM_AVG_MERGE_cog.tif";

const VT_PMTILES_URL = `/static/test/contours.pmtiles`;
// z14 omitted — only 40 tiles exist there; z13 (31k tiles) is the effective max
const VT_MAX_LOD_OVERRIDE = 13;

const DEFAULT_2KM_CIRCLE: CircleConfig = {
  visible: true,
  radius: 2000,
  mode: "solid",
  stroke: { color: "#ff0000", width: 1.5 },
  showLabel: true,
  labelText: "2km",
  labelColor: "#ff0000",
  zIndex: 8,
};

const DEFAULT_1KM_CIRCLE: CircleConfig = {
  visible: true,
  radius: 1000,
  mode: "dashed",
  stroke: { color: "#ffff00", width: 1.5, segmentPx: 50, ratio: 1 },
  showLabel: true,
  labelText: "1km",
  labelColor: "#ffff00",
  zIndex: 8,
};

const DEFAULT_CHECKERBOARD_CIRCLE: CircleConfig = {
  visible: true,
  radius: 3000,
  mode: "checkerboard",
  stroke: {
    segmentPx: 50,
    ratio: 1,
    innerThickness: 3,
    outerThickness: 3,
    innerColor: "#000000",
    outerColor: "#000000",
  },
  showLabel: true,
  labelText: "",
  labelColor: "#ffffff",
  zIndex: 6,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TestMapPerformant = (): JSX.Element => {
  // --- Refs ---------------------------------------------------------------
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<Map | null>(null);
  const nacLayerRef = useRef<TileLayer | null>(null);
  const cogLayerRef = useRef<WebGLTileLayer | null>(null);
  const cogS3LayerRef = useRef<WebGLTileLayer | null>(null);
  const majorContoursLayerRef = useRef<VectorImageLayer | null>(null);
  const minorContoursLayerRef = useRef<VectorImageLayer | null>(null);
  const circle2kmLayerRef = useRef<VectorLayer | null>(null);
  const circle1kmLayerRef = useRef<VectorLayer | null>(null);
  const checkerboardCircleLayerRef = useRef<VectorLayer | null>(null);
  const placeLabelsLayerRef = useRef<VectorLayer | null>(null);
  const demoPolylineLayerRef = useRef<VectorLayer | null>(null);
  const vectorTileLayerRef = useRef<VectorTileLayer | null>(null);
  const vtConfigRef = useRef<EsriVectorTileGridConfig | null>(null);
  const centerProjectedRef = useRef<[number, number] | null>(null);
  const baseResolutionRef = useRef<number | undefined>(undefined);
  const showDemoPolylineLabelsRef = useRef(true);

  // --- State --------------------------------------------------------------
  const [showNAC, setShowNAC] = useState(false);
  const [showCOG, setShowCOG] = useState(false);
  const [showCOGS3, setShowCOGS3] = useState(true);
  const [showMajorContours, setShowMajorContours] = useState(true);
  const [showMinorContours, setShowMinorContours] = useState(false);
  const [showPlaceLabels, setShowPlaceLabels] = useState(true);
  const [showMajorLabels, setShowMajorLabels] = useState(true);
  const [showMinorLabels, setShowMinorLabels] = useState(true);
  const [circle2km, setCircle2km] = useState<CircleConfig>({ ...DEFAULT_2KM_CIRCLE });
  const [circle1km, setCircle1km] = useState<CircleConfig>({ ...DEFAULT_1KM_CIRCLE });
  const [checkerboardCircle, setCheckerboardCircle] = useState<CircleConfig>({
    ...DEFAULT_CHECKERBOARD_CIRCLE,
  });
  const [showDemoPolyline, setShowDemoPolyline] = useState(true);
  const [showDemoPolylineLabels, setShowDemoPolylineLabels] = useState(true);
  const [showVectorTiles, setShowVectorTiles] = useState(false);
  const [majorLoading, setMajorLoading] = useState(false);
  const [minorLoading, setMinorLoading] = useState(false);
  const [performanceStats, setPerformanceStats] = useState({
    majorFeatureCount: 0,
    minorFeatureCount: 0,
    majorLoadTime: 0,
    minorLoadTime: 0,
  });

  // --- Map initialization -------------------------------------------------
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Projection
    const code = "IAU2000:30166";
    const proj4Def =
      "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m +no_defs";
    const extent: [number, number, number, number] = [-931100, -931100, 931100, 931100];

    proj4.defs(code, proj4Def);
    register(proj4);
    const projection = getProjection(code);
    if (projection) projection.setExtent(extent);

    // Resolution — API-authoritative value (see AEGIS-MISSION-GIS.md §14)
    const projResUnitsPerPixel = 12800;
    const maxTileZoom = 13;
    const minTileZoom = 0;

    // Async tilemap metadata fetch (non-blocking)
    fetchTilemapResource(`${NAC_TILE_BASE_URL}/tilemapresource.xml`).then((meta) => {
      if (meta) {
        console.log("[TilemapResource] Parsed metadata:", {
          profile: meta.profile,
          zoomRange: `${meta.minZoom}-${meta.maxZoom}`,
          reportedResZ0: meta.reportedTileSets[0]?.unitsPerPixel,
          apiResZ0: projResUnitsPerPixel,
          note: "API resolution used for TileGrid, NOT XML resolution",
        });
      }
    });

    // buildLegacyResolutions replicates the Leaflet proj4leaflet formula using the
    // API-authoritative projResUnitsPerPixel (12800), NOT the XML value (8192).
    // See buildLegacyResolutions in utils/parsers/leafletShim.ts for the full explanation.
    const resolutions = buildLegacyResolutions(projResUnitsPerPixel, 0, maxTileZoom + 1);
    const baseResolution = resolutions[0];
    baseResolutionRef.current = baseResolution;

    // Centre on lander site
    const centerProjected = proj4("EPSG:4326", code, [29.63431984, -85.4703939]) as [
      number,
      number,
    ];
    centerProjectedRef.current = centerProjected;

    const tileGrid = new TileGrid({
      extent,
      origin: [extent[0], extent[1]],
      resolutions,
      tileSize: 256,
    });

    // ------ Layers --------------------------------------------------------

    // Lander marker
    const markerSource = new VectorSource();
    const landerMarker = new Feature({ geometry: new Point(centerProjected) });
    landerMarker.setStyle(
      new Style({
        image: new Icon({
          src: "/images/lander.svg",
          width: 30,
          height: 30,
          anchor: [0.5, 0.5],
          anchorXUnits: "fraction",
          anchorYUnits: "fraction",
        }),
      })
    );
    markerSource.addFeature(landerMarker);

    // NAC tiles
    const nacLayer = new TileLayer({
      source: new XYZ({
        projection: code,
        tileGrid,
        crossOrigin: "anonymous",
        tileUrlFunction: ([z, x, rawY]) => {
          const y = -1 - rawY;
          return `${NAC_TILE_BASE_URL}/${z}/${x}/${y}.png`;
        },
        wrapX: false,
      }),
    });
    nacLayerRef.current = nacLayer;
    nacLayer.setVisible(false);

    // NAC COG (Cloud Optimized GeoTIFF — HTTP Range requests, no tile server)
    const cogLayer = new WebGLTileLayer({
      source: new GeoTIFFSource({
        sources: [{ url: NAC_COG_URL }],
        projection: code,
      }),
    });
    cogLayerRef.current = cogLayer;

    // NAC COG from S3 (for performance comparison)
    const cogS3Layer = new WebGLTileLayer({
      source: new GeoTIFFSource({
        sources: [{ url: NAC_COG_S3_URL }],
        projection: code,
      }),
      visible: false,
    });
    cogS3LayerRef.current = cogS3Layer;

    // Major contours (VectorImageLayer for performance)
    const majorContoursSource = new VectorSource({
      url: `/static/missionFiles/${MISSION_ID}/Data/A3MM026_10mContours_10mpp_Majors.geojson`,
      format: new GeoJSON({ dataProjection: "EPSG:4326", featureProjection: code }),
      overlaps: false,
    });

    const majorStartTime = performance.now();
    majorContoursSource.on("featuresloadstart", () => {
      setMajorLoading(true);
    });
    majorContoursSource.on("featuresloadend", () => {
      const loadTime = performance.now() - majorStartTime;
      setPerformanceStats((prev) => ({
        ...prev,
        majorFeatureCount: majorContoursSource.getFeatures().length,
        majorLoadTime: Math.round(loadTime),
      }));
      setMajorLoading(false);
    });
    majorContoursSource.on("featuresloaderror", () => setMajorLoading(false));

    const majorContoursLayer = new VectorImageLayer({
      source: majorContoursSource,
      style: createMajorContourStyle(baseResolution, showMajorLabels),
      className: "major-contours-geojson",
      imageRatio: 1.5,
      renderBuffer: 100,
      declutter: true,
      properties: { name: "Major Contours GeoJSON (Optimized)" },
    });
    majorContoursLayerRef.current = majorContoursLayer;

    // Minor contours
    const minorContoursSource = new VectorSource({
      url: `/static/missionFiles/${MISSION_ID}/Data/A3MM026_10mContours_10mpp_Minors.geojson`,
      format: new GeoJSON({ dataProjection: "EPSG:4326", featureProjection: code }),
      overlaps: false,
    });

    const minorStartTime = performance.now();
    minorContoursSource.on("featuresloadstart", () => setMinorLoading(true));
    minorContoursSource.on("featuresloadend", () => {
      const loadTime = performance.now() - minorStartTime;
      setPerformanceStats((prev) => ({
        ...prev,
        minorFeatureCount: minorContoursSource.getFeatures().length,
        minorLoadTime: Math.round(loadTime),
      }));
      setMinorLoading(false);
    });
    minorContoursSource.on("featuresloaderror", () => setMinorLoading(false));

    const minorContoursLayer = new VectorImageLayer({
      source: minorContoursSource,
      style: createMinorContourStyle(baseResolution, showMinorLabels),
      className: "minor-contours-geojson",
      imageRatio: 1.5,
      renderBuffer: 100,
      declutter: true,
      zIndex: 1,
      visible: false,
      properties: { name: "Minor Contours GeoJSON (Optimized)" },
    });
    minorContoursLayerRef.current = minorContoursLayer;

    // Circles
    const circle2kmLayer = buildCircleLayer(centerProjected, baseResolution, DEFAULT_2KM_CIRCLE);
    circle2kmLayerRef.current = circle2kmLayer;

    const circle1kmLayer = buildCircleLayer(centerProjected, baseResolution, DEFAULT_1KM_CIRCLE);
    circle1kmLayerRef.current = circle1kmLayer;

    const checkerboardCircleLayer = buildCircleLayer(
      centerProjected,
      baseResolution,
      DEFAULT_CHECKERBOARD_CIRCLE
    );
    checkerboardCircleLayerRef.current = checkerboardCircleLayer;

    // Place labels (gazetteer)
    const placeLabelsSource = new VectorSource({
      url: `/static/test/Jan2026-mm026-nomenclature-test/geojson/MM026_nomenclature_export.geojson`,
      format: new GeoJSON({ dataProjection: "EPSG:4326", featureProjection: code }),
    });
    placeLabelsSource.on("addfeature", (evt) => {
      const feature = evt.feature;
      if (feature) {
        const geom = feature.getGeometry();
        if (geom && geom.getType() === "Point") {
          feature.set("originalCoordinates", (geom as Point).getCoordinates());
        }
      }
    });

    const placeLabelsLayer = new VectorLayer({
      source: placeLabelsSource,
      style: createPlaceLabelStyle(),
      declutter: true,
      zIndex: 20,
      visible: false,
    });
    placeLabelsLayerRef.current = placeLabelsLayer;

    // Demo polyline
    const demoPolylineLayer = createDemoPolylineLayer(DEMO_POLYLINE_COORDINATES, code, proj4, {
      lineColor: "#3388ff",
      lineWidth: 3,
      arrowColor: "#3388ff",
      showLabelsRef: showDemoPolylineLabelsRef,
    });
    demoPolylineLayerRef.current = demoPolylineLayer;

    // Vector tile contours (native-projection PMTiles in IAU2000:30166)
    // Tile grid config is loaded dynamically from the PMTiles metadata.
    const vtMajorStyle = new Style({ stroke: new Stroke({ color: "#dd7214", width: 1.5 }) });
    const vtMinorStyle = new Style({ stroke: new Stroke({ color: "#f78119", width: 0.8 }) });

    const vectorTileLayer = new VectorTileLayer({
      style: (feature) => {
        const sym = feature.get("_symbol") as number;
        return sym % 2 === 0 ? vtMajorStyle : vtMinorStyle;
      },
      declutter: false,
      visible: false,
      zIndex: 3,
      properties: { name: "Vector Tile Contours (native projection)" },
    });
    vectorTileLayerRef.current = vectorTileLayer;

    // ------ Map -----------------------------------------------------------
    const map = new Map({
      target: mapRef.current,
      layers: [
        nacLayer,
        cogLayer,
        cogS3Layer,
        minorContoursLayer,
        majorContoursLayer,
        circle2kmLayer,
        circle1kmLayer,
        checkerboardCircleLayer,
        demoPolylineLayer,
        vectorTileLayer,
        placeLabelsLayer,
        new VectorLayer({ source: markerSource, zIndex: 10 }),
      ],
      view: new View({
        projection: code,
        center: centerProjected,
        zoom: INITIAL_VIEW_ZOOM,
        minZoom: minTileZoom,
        maxZoom: maxTileZoom,
        extent,
        constrainResolution: false,
        smoothResolutionConstraint: true,
      }),
      moveTolerance: 5,
    });
    mapInstanceRef.current = map;

    // Draggable labels interaction
    map.addInteraction(new Translate({ layers: [placeLabelsLayer], hitTolerance: 5 }));

    // FPS logging
    let frameCount = 0;
    let lastLogTime = Date.now();
    map.on("postrender", () => {
      frameCount++;
      const now = Date.now();
      if (now - lastLogTime > 5000) {
        console.log(`[Performance] FPS: ${(frameCount / ((now - lastLogTime) / 1000)).toFixed(1)}`);
        frameCount = 0;
        lastLogTime = now;
      }
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setTarget(undefined);
        mapInstanceRef.current = null;
      }
    };
  }, [showMajorLabels, showMinorLabels]);

  // --- Circle update effects ----------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current;
    const center = centerProjectedRef.current;
    if (!map || !center) return;
    if (circle2kmLayerRef.current) map.removeLayer(circle2kmLayerRef.current);
    const layer = buildCircleLayer(center, baseResolutionRef.current, circle2km);
    circle2kmLayerRef.current = layer;
    map.addLayer(layer);
  }, [circle2km]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const center = centerProjectedRef.current;
    if (!map || !center) return;
    if (circle1kmLayerRef.current) map.removeLayer(circle1kmLayerRef.current);
    const layer = buildCircleLayer(center, baseResolutionRef.current, circle1km);
    circle1kmLayerRef.current = layer;
    map.addLayer(layer);
  }, [circle1km]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const center = centerProjectedRef.current;
    if (!map || !center) return;
    if (checkerboardCircleLayerRef.current) map.removeLayer(checkerboardCircleLayerRef.current);
    const layer = buildCircleLayer(center, baseResolutionRef.current, checkerboardCircle);
    checkerboardCircleLayerRef.current = layer;
    map.addLayer(layer);
  }, [checkerboardCircle]);

  // --- Layer visibility effects -------------------------------------------
  useEffect(() => {
    nacLayerRef.current?.setVisible(showNAC);
  }, [showNAC]);

  useEffect(() => {
    cogLayerRef.current?.setVisible(showCOG);
  }, [showCOG]);

  useEffect(() => {
    cogS3LayerRef.current?.setVisible(showCOGS3);
  }, [showCOGS3]);

  useEffect(() => {
    majorContoursLayerRef.current?.setVisible(showMajorContours);
  }, [showMajorContours]);

  useEffect(() => {
    minorContoursLayerRef.current?.setVisible(showMinorContours);
  }, [showMinorContours]);

  useEffect(() => {
    majorContoursLayerRef.current?.changed();
  }, [showMajorLabels]);

  useEffect(() => {
    minorContoursLayerRef.current?.changed();
  }, [showMinorLabels]);

  useEffect(() => {
    placeLabelsLayerRef.current?.setVisible(showPlaceLabels);
  }, [showPlaceLabels]);

  useEffect(() => {
    demoPolylineLayerRef.current?.setVisible(showDemoPolyline);
  }, [showDemoPolyline]);

  useEffect(() => {
    const layer = vectorTileLayerRef.current;
    if (!layer) return;
    layer.setVisible(showVectorTiles);
    if (showVectorTiles) {
      layer.changed();
      layer.getSource()?.refresh();
    }
  }, [showVectorTiles]);

  useEffect(() => {
    const layer = vectorTileLayerRef.current;
    if (!layer) return;
    if (!showVectorTiles && layer.getSource()) return;
    if (layer.getSource()) return;
    const code = "IAU2000:30166";
    let cancelled = false;

    // Resolve tile grid config from the PMTiles metadata, then set the layer source.
    const applySource = async () => {
      let config = vtConfigRef.current;

      if (!config) {
        const pmtilesArchive = new PMTiles(VT_PMTILES_URL);
        const metadata = (await pmtilesArchive.getMetadata()) as Record<string, unknown>;

        config = parseEsriPmtilesMetadata(metadata, VT_MAX_LOD_OVERRIDE);
        if (config) vtConfigRef.current = config;
      }

      if (cancelled || !config) {
        if (!config) console.warn("[VectorTiles] Could not load tile grid config");
        return;
      }

      layer.setSource(
        new PMTilesVectorSource({
          url: VT_PMTILES_URL,
          projection: code,
          format: new MVT(),
          tileGrid: buildTileGrid(config),
        })
      );

      if (!cancelled && showVectorTiles) {
        layer.changed();
        layer.getSource()?.refresh();
      }
    };

    applySource().catch((error) => {
      console.warn("[VectorTiles] Failed to attach PMTiles source", error);
    });
    return () => {
      cancelled = true;
    };
  }, [showVectorTiles, showMajorLabels, showMinorLabels]);

  useEffect(() => {
    showDemoPolylineLabelsRef.current = showDemoPolylineLabels;
    demoPolylineLayerRef.current?.changed();
  }, [showDemoPolylineLabels]);

  // --- Render -------------------------------------------------------------
  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />

      <MapControlPanel
        showNAC={showNAC}
        setShowNAC={setShowNAC}
        showCOG={showCOG}
        setShowCOG={setShowCOG}
        showCOGS3={showCOGS3}
        setShowCOGS3={setShowCOGS3}
        showMajorContours={showMajorContours}
        setShowMajorContours={setShowMajorContours}
        majorLoading={majorLoading}
        showMajorLabels={showMajorLabels}
        setShowMajorLabels={setShowMajorLabels}
        showMinorContours={showMinorContours}
        setShowMinorContours={setShowMinorContours}
        minorLoading={minorLoading}
        showMinorLabels={showMinorLabels}
        setShowMinorLabels={setShowMinorLabels}
        circles={[
          {
            title: "2km Circle",
            config: circle2km,
            setConfig: setCircle2km,
            defaultCollapsed: false,
          },
          {
            title: "1km Circle",
            config: circle1km,
            setConfig: setCircle1km,
            defaultCollapsed: true,
          },
          {
            title: "Checkerboard Circle",
            config: checkerboardCircle,
            setConfig: setCheckerboardCircle,
            defaultCollapsed: true,
          },
        ]}
        showPlaceLabels={showPlaceLabels}
        setShowPlaceLabels={setShowPlaceLabels}
        showDemoPolyline={showDemoPolyline}
        setShowDemoPolyline={setShowDemoPolyline}
        showDemoPolylineLabels={showDemoPolylineLabels}
        setShowDemoPolylineLabels={setShowDemoPolylineLabels}
        showVectorTiles={showVectorTiles}
        setShowVectorTiles={setShowVectorTiles}
        performanceStats={performanceStats}
      />
    </div>
  );
};

export default TestMapPerformant;
