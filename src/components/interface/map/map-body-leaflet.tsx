import * as L from "leaflet";
L.Icon.Default.imagePath = "/leaflet/images/";
// Import the plugin libraries so they will modify L
import "leaflet.tilelayer.colorfilter";
import "proj4leaflet";
import "leaflet-polylinedecorator";
import DraggableLines from "leaflet-draggable-lines";

import styles from "components/interface/map/map-body.module.css";
import { useAppSelector, shallowEqual, refEqual, deepEqual } from "utils/useAppSelector";
import type { MutableRefObject, FunctionComponent } from "react";
import { useEffect, useMemo, useRef, useState, useCallback, useLayoutEffect } from "react";
import isEqual from "lodash/isEqual";
import reverse from "lodash/reverse";
import uniqBy from "lodash/uniqBy";
import orderBy from "lodash/orderBy";
import { updateMapDirective } from "store/map";
import { setSectionSelected } from "store/interface";
import { setSelectedStationUuid } from "store/station";
import { setSelectedPosEntryUuid } from "store/rex";
import {
  adjustGridIndex,
  convertLeafletLatLngToAegisPoint,
  findClosestPointInGlobalGrid,
  getGridCoordinatesFromPoint,
  getMidpoint,
} from "utils/mapping/geoMath";
import { secondsFromhhmmss, hhmmssFromSeconds, titleCase } from "utils/formatting";
import { EmojiRenderer } from "components/interface/emojis";
import { clearMapItemHover, setHoverUuidsForSequence, setHoverUuidsForPosEntry } from "store/hover";

import { useAppDispatch } from "utils/useAppDispatch";
import { thunkSelectEVASequenceItem } from "store/thunk/crossThunk";
import { MapViewMenu } from "./map-menu-view";
import { MapPositionMenu } from "./map-menu-pos";
import MapPresetMenu from "./map-menu-preset";
import PetInterval from "../../page/petInterval";
import { isWindows10 } from "utils/browser";
import { useCookies } from "react-cookie";
import ReactDOMServer from "react-dom/server";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";
import { SunEarth } from "./map-sunearth";
import { featureCollection, lineString, point } from "@turf/helpers";
import { circle } from "@turf/turf";
import {
  makeTileLayerColorFilter,
  latLngDiv,
  getMapItemByUuid,
  scaleBarDiv,
  drawOrUpdateMarkerOnMap,
  drawLanderOnMap,
  drawPolylineOnMap,
  drawPosPathOnMap,
  drawPosMarkerOnMap,
  getLayersToAddInOrder,
  drawGridLabels,
  drawLayersOnMap,
  getLatestPosEntryByType,
  drawSelectedMarker,
  setMeasureStartingCoords,
  handleMapDirective,
  saveUpdatedItemPosition,
  mouseGridCoordDiv,
  layerTimeDiv,
} from "components/page/leaflet-helper";
import { thunkMarkerOnClick, thunkPolylineOnClick } from "store/thunk/thunkMap";
import type { Feature } from "geojson";
import { setSelectedPresetUuid } from "store/preset";
import { getCalculatedTimeOfSequenceItem } from "store/processing/calculatedFields";
import { addTimeToDateTime } from "utils/mapping/timeLayers";
import { EARTH_RADIUS } from "utils/consts";
import { globalGrid } from "utils/mapping/grid";

import { selectAsPlannedStations } from "store/selectors";
import { LoadingOverlay } from "../_global-elements";
import { getStmActionName } from "utils/component-helpers";
import { useMissionDocSelector } from "utils/useDocSelector";

const MapBody: FunctionComponent<{}> = () => {
  const dispatch = useAppDispatch();
  const mapRef = useRef(null);
  const map = useRef<L.Map>(null);
  const crs = useRef<L.Proj.CRS>(null);
  const draggableLines: MutableRefObject<DraggableLines> = useRef(null);
  const stationFeatureGroup = useRef<L.FeatureGroup>(null);
  const stationCirclesFeatureGroup = useRef<L.FeatureGroup>(null);
  const poiFeatureGroup = useRef<L.FeatureGroup>(null);
  const actionFeatureGroup = useRef<L.FeatureGroup>(null);
  const gridLabelFeatureGroup = useRef<L.FeatureGroup>(null);
  const posEntryFeatureGroup = useRef<L.FeatureGroup>(null);
  const hoverFeatureGroup = useRef<L.FeatureGroup>(null);
  const hoverAstronautFeatureGroup = useRef<L.FeatureGroup>(null);
  const partialMission = useMissionDocSelector(
    (mission) => ({
      id: mission.id,
      landerLocation: mission.landerLocation,
      projIsCustom: mission.projIsCustom,
      projResUnitsPerPixel: mission.projResUnitsPerPixel,
      projResZoomLevel: mission.projResZoomLevel,
      projEpsg: mission.projEpsg,
      projProj4String: mission.projProj4String,
      projOriginX: mission.projOriginX,
      projOriginY: mission.projOriginY,
      projBoundsMinX: mission.projBoundsMinX,
      projBoundsMinY: mission.projBoundsMinY,
      projBoundsMaxX: mission.projBoundsMaxX,
      projBoundsMaxY: mission.projBoundsMaxY,
      initialZoom: mission.initialZoom,
      planetRadius: mission.planetRadius,
      usingLGRSCoordinates: mission.usingLGRSCoordinates,
      circleDefinitions: mission.circleDefinitions,
      actionDefinitions: mission.actionDefinitions,
      activeGridUuid: mission.activeGridUuid,
      walkbackRate: mission.walkbackRate,
      traverseRate: mission.traverseRate,
    }),
    deepEqual
  );

  const missionLayers = useAppSelector((state) => state.mission.layers, deepEqual);
  const missionSublayers = useAppSelector((state) => state.mission.sublayers, deepEqual);
  const sectionSelected = useAppSelector((state) => state.interface.sectionSelectedLabel, refEqual);
  const mapDirective = useAppSelector((state) => state.map.mapDirective, deepEqual);
  const originalPoints = useAppSelector((state) => state.map.originalPoints, refEqual);
  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const selectedPreset = useAppSelector(
    (state) => state.preset.presets.find((p) => p.uuid === selectedPresetUuid),
    deepEqual
  );
  const presetsFromDb = useAppSelector((state) => state.preset.presets, deepEqual);

  const pois = useMissionDocSelector((mission) => Object.values(mission?.pois ?? {}), deepEqual);
  const asPlannedStationUuids = useMissionDocSelector(
    (mission) => selectAsPlannedStations(mission).map((s) => s.uuid),
    deepEqual
  );
  const allStations = useMissionDocSelector(
    (mission) => Object.values(mission.stations),
    deepEqual
  );
  const selectedStationUuid = useAppSelector(
    (state) => state.station.selectedStationUuid,
    refEqual
  );
  const allActionRecords = useMissionDocSelector((mission) => mission.actions, deepEqual);
  const actions = Object.values(allActionRecords);
  const selectedPoiUuid = useAppSelector((state) => state.poi.selectedPoiUuid, refEqual);
  const selectedPoi = useMissionDocSelector(
    (mission) => (selectedPoiUuid ? mission.pois[selectedPoiUuid] : undefined),
    deepEqual
  );
  const selectedStation = useMissionDocSelector(
    (mission) => mission.stations[selectedStationUuid],
    deepEqual
  );
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);
  const selectedEva = useMissionDocSelector(
    (mission) => (selectedEvaUuid ? mission.evas?.[selectedEvaUuid] : null),
    deepEqual
  );
  const presetPreviewTime = useAppSelector((state) => state.preset.presetPreviewTime, refEqual);
  const selectedRexUuid = useAppSelector((state) => state.rex.selectedRexUuid, refEqual);
  const selectedRex = useMissionDocSelector(
    (mission) => (selectedRexUuid ? mission.rexes?.[selectedRexUuid] : null),
    deepEqual
  );

  // Extract posTypes, posEntries, and posSources directly to prevent unnecessary re-renders in useEffects
  const posTypes = useMissionDocSelector(
    (mission) => (selectedRexUuid ? mission.rexes?.[selectedRexUuid]?.posTypes : null) ?? [],
    deepEqual
  );
  const posSources = useMissionDocSelector(
    (mission) => (selectedRexUuid ? mission.rexes?.[selectedRexUuid]?.posSources : null) ?? [],
    deepEqual
  );
  const posEntries = useMissionDocSelector(
    (mission) => (selectedRexUuid ? mission.rexes?.[selectedRexUuid]?.posEntries : null) ?? [],
    deepEqual
  );

  const runningRexEvaDatetime = useMissionDocSelector((mission) => {
    if (!mission?.evas || !selectedRex) return null;
    return mission.evas[selectedRex.evaUuid]?.datetime ?? null;
  }, deepEqual);
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const hover = useAppSelector((state) => state.hover, shallowEqual); //astronaut hover timeline

  const selectedPosEntryUuid = useAppSelector((state) => state.rex.selectedPosEntryUuid, refEqual);
  const traverses = useMissionDocSelector((mission) => Object.values(mission.traverses), deepEqual);
  const selectedTraverse = useMissionDocSelector(
    (mission) => mission.traverses[selectedEvaSequenceItemUuid],
    deepEqual
  );

  const measurements = useAppSelector((state) => state.measure.measurements, deepEqual);
  const selectedMeasurementUuid = useAppSelector(
    (state) => state.measure.selectedMeasurementUuid,
    refEqual
  );
  const allEvas = useMissionDocSelector((mission) => mission.evas ?? {}, deepEqual);
  const sequenceTime = useMemo(
    () =>
      getCalculatedTimeOfSequenceItem({
        evaUuid: selectedEvaUuid,
        sequenceItemUuid: selectedEvaSequenceItemUuid,
        evas: Object.values(allEvas ?? {}),
        stations: allStations,
        actions: Object.values(allActionRecords),
        traverses: traverses,
        missionWalkbackRate: partialMission.walkbackRate,
        missionTraverseRate: partialMission.traverseRate,
      }),
    [
      selectedEvaUuid,
      selectedEvaSequenceItemUuid,
      allEvas,
      allStations,
      allActionRecords,
      traverses,
      partialMission.walkbackRate,
      partialMission.traverseRate,
    ]
  );

  const mapHoverItemUuid = useAppSelector((state) => state.hover.mapItemUuid, refEqual);
  const mapHoverItemType = useAppSelector((state) => state.hover.mapItemType, refEqual);
  const egressStation = useMissionDocSelector(
    (mission) => mission.stations[selectedEva?.egressLocationUuid],
    deepEqual
  );
  const egressLocation = isEqual(selectedEva?.egressLocationUuid, "lander")
    ? partialMission.landerLocation
    : (egressStation?.location ?? null);

  const folders = useAppSelector(
    (state) =>
      state.interface.folders.filter(
        (folder) => folder.type === "poi" || folder.type === "station"
      ),
    deepEqual
  );
  const foldersInterface = useAppSelector(
    (state) =>
      state.interface.foldersInterface.filter((folderInterface) =>
        folders.some((folder) => folder.uuid === folderInterface.uuid)
      ),
    deepEqual
  );

  const gridCorner = useAppSelector((state) => state.map.gridCornerPoint, deepEqual);

  const [layersOnMap, setLayersOnMap] = useState([]);

  const [posEntriesShowing, setPosEntriesShowing] = useState<PosEntry[]>([]);
  const [latestPosEntriesByType, setLatestPosEntriesByType] = useState<{
    [key: string]: PosEntry[];
  }>({});

  const [isWin10, setIsWin10] = useState(false);

  /*** Eyeball menu toggles */
  const [mapDisplayPois, setMapDisplayPois] = useState<MapDisplayMarkers>({
    show: true,
    showLabels: false,
  });
  const [mapDisplayStations, setMapDisplayStations] = useState<MapDisplayStations>({
    show: true,
    showLabels: false,
    showWalkbacks: true,
    showCircles: true,
  });
  const [mapDisplayActions, setMapDisplayActions] = useState<MapDisplayMarkers>({
    show: true,
    showLabels: false,
  });

  const [mapDisplayPos, setMapDisplayPos] = useState<MapDisplayPos>({
    show: true,
    showAllLabels: false,
    showLatestLabels: true,
    showPaths: true,
    showOldPaths: true,
    fadeOldPaths: true,
    showMarkers: true,
    showOldMarkers: false,
    fadeOldMarkers: false,
    sourceUuids: [],
  });
  const [showArrows, setShowArrows] = useState(true);
  const [showScaleBar, setShowScaleBar] = useState(true);
  const [showMouseLatLon, setShowMouseLatLon] = useState(true);
  const [showSunEarth, setShowSunEarth] = useState(false);

  const [eyeballMenuCookie, setEyeballMenuCookie] = useCookies(["AEGIS_Map_View_Settings"]);
  /*** end Eyeball menu toggles */

  const [mouseLatLng, setMouseLatLng] = useState<AEGISPoint>(null);
  const [mouseGridCoord, setMouseGridCoord] = useState<string>("N/A");
  const [mapZoom, setMapZoom] = useState<number>(0); // Used to trigger re-draw of scale. Value doesn't matter
  const [gridLabels, setGridLabels] = useState<GridLabelItem[]>([]);
  const [mapBounds, setMapBounds] = useState<string>(null); // Used to trigger re-draw of grid labels. Value doesn't matter
  const [rexPetTime, setRexPetTime] = useState(""); // used to update the PET value via the PetInterval component
  const [gridBounds, setGridBounds] = useState<GridIndex[]>(undefined);
  const [mapGridControls, setMapGridControls] = useState<MapGridControl>(undefined);
  const [mapDateTime, setMapDateTime] = useState<string>(undefined);
  const [timeLayerInfo, setTimeLayerInfo] = useState<TimeLayerInfo>(undefined);
  const [selectedRexDateTime, setSelectedRexDateTime] = useState<string>(null);
  const [isLoading, setIsLoading] = useState(false); // used for loading overlay for long running processes

  /**
   * Set the eyeball menu toggles from the cookie
   */
  useEffect(() => {
    if (!eyeballMenuCookie["AEGIS_Map_View_Settings"]) return;
    const eyeballMenuSettings: EyeballMenuCookieAEGISMapViewSettings =
      eyeballMenuCookie["AEGIS_Map_View_Settings"];
    setMapDisplayPois(eyeballMenuSettings.mapDisplayPois);
    setMapDisplayStations(eyeballMenuSettings.mapDisplayStations);
    setMapDisplayActions(eyeballMenuSettings.mapDisplayActions);
    if (eyeballMenuSettings.mapDisplayPos) {
      // set default view to task and crew regardless of what is in the cookie
      const taskSourceUuid = selectedRex?.posSources?.find((source) => source.abbr === "T")?.uuid;
      const crewSourceUuid = selectedRex?.posSources?.find((source) => source.abbr === "C")?.uuid;
      setMapDisplayPos({
        ...eyeballMenuSettings.mapDisplayPos,
        sourceUuids: [taskSourceUuid, crewSourceUuid],
      });
    }
    setShowArrows(eyeballMenuSettings.showArrows);
    setShowSunEarth(eyeballMenuSettings.showSunEarth ?? false); // default to false if not in cookie
    setShowScaleBar(eyeballMenuSettings.showScaleBar ?? true); // default to true if not in cookie
    setShowMouseLatLon(eyeballMenuSettings.showMouseLatLon ?? true); // default to true if not in cookie

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * When the eyeball menu toggles change, update the cookie
   */
  useEffect(() => {
    setEyeballMenuCookie(
      "AEGIS_Map_View_Settings",
      JSON.stringify({
        mapDisplayPois,
        mapDisplayStations,
        mapDisplayActions,
        mapDisplayPos,
        showArrows,

        showSunEarth,
        showScaleBar,
        showMouseLatLon,
      }),
      { path: "/" }
    );
  }, [
    setEyeballMenuCookie,
    mapDisplayPois,
    mapDisplayStations,
    mapDisplayActions,
    mapDisplayPos,
    showArrows,
    showSunEarth,
    showScaleBar,
    showMouseLatLon,
  ]);

  /**
   * Map instantiation
   */
  useLayoutEffect(() => {
    if (!mapRef.current || !map || !partialMission.landerLocation) return;

    const isWin10Async = async () => {
      const isWin10 = await isWindows10();
      setIsWin10(isWin10);
    };
    isWin10Async();

    // instantiate the prog4leaflet crs using the values in the mission config
    if (partialMission.projIsCustom === true) {
      const baseRes =
        partialMission.projResUnitsPerPixel * Math.pow(2, partialMission.projResZoomLevel);

      const resolutions = [];
      for (let i = 0; i < 32; i++) {
        resolutions.push(baseRes / Math.pow(2, i));
      }

      crs.current = new L.Proj.CRS(partialMission.projEpsg, partialMission.projProj4String, {
        origin: [partialMission.projOriginX, partialMission.projOriginY],
        resolutions,
        bounds: L.bounds(
          [partialMission.projBoundsMinX, partialMission.projBoundsMinY],
          [partialMission.projBoundsMaxX, partialMission.projBoundsMaxY]
        ),
      });
    }

    // Instantiate the map
    if (!map.current) {
      const center = [
        partialMission.landerLocation.lat,
        partialMission.landerLocation.lng,
      ] as L.LatLngExpression;
      const zoom = partialMission.initialZoom || 13;

      map.current = L.map(mapRef.current, {
        center: center,
        zoom: zoom,
        fadeAnimation: true,
      });
    }

    if (crs.current) {
      map.current.options.crs = crs.current;
    }

    // pan the map to the center of the lander location now that the crs is set
    map.current.setView(
      [partialMission.landerLocation.lat, partialMission.landerLocation.lng],
      map.current.getZoom()
    );

    if (!draggableLines.current) {
      draggableLines.current = new DraggableLines(map.current, { allowExtendingLine: false });
    }
    if (!stationFeatureGroup.current) {
      stationFeatureGroup.current = L.featureGroup().addTo(map.current);
    }
    if (!stationCirclesFeatureGroup.current) {
      stationCirclesFeatureGroup.current = L.featureGroup().addTo(map.current);
    }
    if (!poiFeatureGroup.current) {
      poiFeatureGroup.current = L.featureGroup().addTo(map.current);
    }
    if (!actionFeatureGroup.current) {
      actionFeatureGroup.current = L.featureGroup().addTo(map.current);
    }
    if (!gridLabelFeatureGroup.current) {
      gridLabelFeatureGroup.current = L.featureGroup().addTo(map.current);
    }
    if (!posEntryFeatureGroup.current) {
      posEntryFeatureGroup.current = L.featureGroup().addTo(map.current);
    }
    if (!hoverFeatureGroup.current) {
      hoverFeatureGroup.current = L.featureGroup().addTo(map.current);
    }
    if (!hoverAstronautFeatureGroup.current) {
      hoverAstronautFeatureGroup.current = L.featureGroup().addTo(map.current);
    }

    // Init coords for the measure tool
    setMeasureStartingCoords(map, dispatch);
  }, [
    mapRef,
    map,
    draggableLines,
    dispatch,
    partialMission.landerLocation,
    partialMission.projIsCustom,
    partialMission.projResUnitsPerPixel,
    partialMission.projResZoomLevel,
    partialMission.projEpsg,
    partialMission.projProj4String,
    partialMission.projOriginX,
    partialMission.projOriginY,
    partialMission.projBoundsMinX,
    partialMission.projBoundsMinY,
    partialMission.projBoundsMaxX,
    partialMission.projBoundsMaxY,
    partialMission.initialZoom,
  ]);

  /**
   * Resize the map when the container dimensions change (via flexbox or window resize)
   * https://legacy.reactjs.org/docs/hooks-faq.html#how-can-i-measure-a-dom-node
   */
  const mapContainerRef = useCallback(
    (node: Element) => {
      if (!node) return;
      const resizeObserver = new ResizeObserver(() => {
        // all this to keep the map in the same position when the right window closes or opens
        const prevCenterPixels = map.current.project(
          map.current.getCenter(),
          map.current.getZoom()
        );
        const currentWidth = map.current.getSize().x;

        map.current.invalidateSize();

        const newWidth = map.current.getSize().x;
        const newCenterPixels = prevCenterPixels.add([(newWidth - currentWidth) / 2, 0]);
        const newCenter = map.current.unproject(newCenterPixels, map.current.getZoom());
        map.current.setView(newCenter, map.current.getZoom(), { animate: true });
      });
      resizeObserver.observe(node);
    },
    [map]
  );

  /**
   * Draw the scale bar on the map
   */
  const drawScaleBar = useCallback(() => {
    return scaleBarDiv(map, partialMission.planetRadius, styles.scaleValue);

    // Include mapZoom but we arn't using it. Just need a way to re-trigger this effect when mapZoom changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, partialMission.planetRadius, mapZoom]);

  /**
   * Update which grid labels are visible based on map zoom level
   */
  useEffect(() => {
    drawGridLabels({
      map,
      gridLabelFeatureGroup,
      gridLabels,
      planetRadius: partialMission.planetRadius,
    });
    // include map bounds in the dependency array so the grid labels will re-draw when map moves
  }, [gridLabels, partialMission.planetRadius, mapBounds]);

  /**
   * Map layers display management
   */
  useEffect(() => {
    if (!partialMission.id || !map.current || !selectedPreset || !missionLayers) return;

    const layersToAddInOrder = getLayersToAddInOrder({
      selectedPreset,
      missionSublayers,
      missionLayers,
      mapDateTime,
      setTimeLayerInfo,
    });

    // no new layers are newly visible/hidden or reordered. do nothing
    if (isEqual(layersToAddInOrder, layersOnMap)) {
      return;
    } else {
      setLayersOnMap(layersToAddInOrder);
    }

    drawLayersOnMap({
      map,
      mapSublayerControls: selectedPreset.mapSublayerControls,
      layersToAddInOrder,
      missionId: partialMission.id,
      mapTime: mapDateTime,
      setGridLabels,
    });
  }, [
    partialMission.id,
    map,
    layersOnMap,
    missionLayers,
    missionSublayers,
    selectedPreset,
    mapDateTime,
  ]);

  /**
   * Update map with display adjustments for sublayers as sliders are moved
   */
  useEffect(() => {
    if (!map.current || !selectedPreset?.mapSublayerControls) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.current.eachLayer((layer: any) => {
      for (const [uuid, sublayerControl] of Object.entries(selectedPreset.mapSublayerControls)) {
        if (layer.options.uuid === uuid) {
          if (layer.options.type === "tile") {
            const tileLayer = layer as L.TileLayer;
            tileLayer.updateColorFilter(makeTileLayerColorFilter(sublayerControl));
            tileLayer.setOpacity(sublayerControl.style?.opacity);
            // custom class name that we use to control mix-blend-mode
            layer.getContainer().className = `leaflet-layer leaflet-blend-${sublayerControl.style?.blendMode}`;
          } else if (layer.options.type === "vector") {
            const geoJsonLayer = layer as L.GeoJSON;
            geoJsonLayer.setStyle({
              color: sublayerControl.style?.color,
              opacity: sublayerControl.style?.opacity,
              weight: sublayerControl.style?.weight,
              fillOpacity: sublayerControl.style?.fillOpacity,
            });
          } else if (layer.options.type === "vector-tile") {
            const vectorTileLayer = layer;
            vectorTileLayer.setStyle({
              color: sublayerControl.style?.color,
              opacity: sublayerControl.style?.opacity,
              weight: sublayerControl.style?.weight,
            });
          }
        }
      }
    });
  }, [selectedPreset?.mapSublayerControls, map]);

  /**
   * Map event listeners, redefined when state values changes via useEffect to allow their functions to access the latest state values
   */
  useEffect(() => {
    if (!map.current) return;

    map.current.on("click", async (e) => {
      // if user is creating or updating a new poi or station, use the click update the location of the new poi/station
      if (!mapDirective) return;
      if (
        (mapDirective.mapItemType === "station" ||
          mapDirective.mapItemType === "poi" ||
          mapDirective.mapItemType === "lander" ||
          mapDirective.mapItemType === "action" ||
          mapDirective.mapItemType === "posEntry") &&
        (mapDirective.mapAction === "editMarker" || mapDirective.mapAction === "createMarker")
      ) {
        try {
          setIsLoading(true);
          await saveUpdatedItemPosition({
            dispatch,
            uuid: mapDirective.uuid,
            mapItemType: mapDirective.mapItemType,
            location: convertLeafletLatLngToAegisPoint(e.latlng),
          });
        } finally {
          setIsLoading(false);
        }

        // reset the map directive
        dispatch(updateMapDirective(null));
        // set the mouse cursor back to the default
        map.current.getContainer().style.cursor = "grab";
      }
    });

    map.current.on("mousemove", (e) => {
      setMouseLatLng({ lat: e.latlng.lat, lng: e.latlng.lng });
      const gridCoords = getGridCoordinatesFromPoint(
        convertLeafletLatLngToAegisPoint(e.latlng),
        partialMission.planetRadius,
        partialMission.usingLGRSCoordinates,
        globalGrid?.coordinates
      );
      setMouseGridCoord(gridCoords);
    });

    map.current.on("zoomend", () => {
      setMapBounds(map.current.getBounds().toBBoxString()); // trigger to redraw grid labels
      setMeasureStartingCoords(map, dispatch);
      setMapZoom(map.current.getZoom()); // trigger to redraw scale bar
    });

    map.current.on("moveend", () => {
      setMapBounds(map.current.getBounds().toBBoxString()); // trigger to redraw grid labels
      setMeasureStartingCoords(map, dispatch);
    });

    return () => {
      if (map.current) {
        map.current.off("click");
      }
    };
  }, [
    map,
    mapDirective,
    dispatch,
    gridLabels,
    partialMission.planetRadius,
    partialMission.usingLGRSCoordinates,
  ]);

  /**
   * Listen for mapDirective for stations, pois, actions, traverses, and measurements, and trigger map draw/edit modes appropriately
   */
  useEffect(() => {
    if (!map.current || !draggableLines || !mapDirective) return;

    handleMapDirective({ map, mapDirective, originalPoints, draggableLines, dispatch });
    if (
      mapDirective.mapAction === "editMarker" ||
      mapDirective.mapAction === "createMarker" ||
      mapDirective.mapAction === "editPolyline"
    ) {
      // turn off interactive. Do not need to turn them back on since
      //   all markers are re-drawn when mapDirective is updated
      map.current.eachLayer((layer: L.Layer) => {
        if (layer instanceof L.Marker) {
          const aegisMarker = layer as AEGISMarker;
          // Not all markers have a uuid (ex polyline pins when editing), so check for it
          if (aegisMarker.uuid && aegisMarker.uuid !== mapDirective.uuid) {
            aegisMarker.options.interactive = false;
            aegisMarker._icon.classList.toggle("leaflet-interactive", false);
            layer.removeInteractiveTarget(aegisMarker._icon);
          }
        }
        if (layer instanceof L.Polyline) {
          const aegisPolyline = layer as AEGISPolyline;
          if (aegisPolyline.uuid && aegisPolyline.uuid !== mapDirective.uuid) {
            aegisPolyline.options.interactive = false;
            aegisPolyline._path?.classList.toggle("leaflet-interactive", false);
          }
        }
      });
    }
    return () => {
      if (draggableLines.current) {
        draggableLines.current.disable();
        draggableLines.current.off("drag");
      }
    };
  }, [map, draggableLines, mapDirective, originalPoints, dispatch]);

  /**
   * Determine stations to show and draw them on map when stations or selections change
   */
  useEffect(() => {
    if (!allStations || !map.current || mapDirective) return;

    const stationUuidsToShow: string[] = [];
    // always show the stations on a selected EVA
    if (selectedEva) {
      const stationSequenceItems = selectedEva.sequence.filter((item) => item.type === "station");
      stationUuidsToShow.push(...stationSequenceItems.map((item) => item.uuid));
      if (selectedEva.egressLocationUuid !== "lander")
        stationUuidsToShow.push(selectedEva.egressLocationUuid);
      if (selectedEva.ingressLocationUuid !== "lander")
        stationUuidsToShow.push(selectedEva.ingressLocationUuid);
    } else if (selectedStation && (sectionSelected === "station" || sectionSelected === "evas")) {
      stationUuidsToShow.push(selectedStation.uuid);
    }

    // for the rest of the stations (not selected), check eyeball menu setting and folder settings
    if (mapDisplayStations.show) {
      // Get all station folders and their interfaces
      const stationFolders = folders.filter((folder) => folder.type === "station");

      // Filter out stations that are in hidden folders
      const asPlannedStationUuidsToShow = asPlannedStationUuids.filter((stationUuid) => {
        // Find which folder contains this station
        const containingFolder = stationFolders.find((folder) =>
          folder.items.includes(stationUuid)
        );

        // show stations not in any folder
        if (!containingFolder) {
          return true;
        } else {
          // Check if the folder is visible in the interface
          const folderInterface = foldersInterface.find((fi) => fi.uuid === containingFolder.uuid);
          return !folderInterface || folderInterface.visible;
        }
      });
      stationUuidsToShow.push(...asPlannedStationUuidsToShow);
    }

    // First remove all existing layers
    stationFeatureGroup.current.clearLayers();

    // Remove each circle layer individually because leaflet doesn't clear these geojson layers with .clearLayers()
    stationCirclesFeatureGroup.current.eachLayer((layer) => {
      layer.remove();
    });

    // get the station object for all the station uuids to show
    const stationsToShow: Station[] = allStations.filter((station) =>
      stationUuidsToShow.includes(station.uuid)
    );
    // draw all stations
    stationsToShow.forEach((station) => {
      if (station.location) {
        drawOrUpdateMarkerOnMap({
          map,
          featureGroup: stationFeatureGroup,
          name: station.name,
          uuid: station.uuid,
          iconEmoji: station.icon ? station.icon : "2754", //default to question mark
          location: station.location,
          mapItemType: "station",
          isWin10,
          onClick: () => {
            dispatch(thunkMarkerOnClick({ markerUuid: station.uuid, mapItemType: "station" }));
          },
          onDragEnd: (marker: AEGISMarker) => {
            const newLocation = convertLeafletLatLngToAegisPoint(marker.getLatLng());
            saveUpdatedItemPosition({
              dispatch,
              uuid: station.uuid,
              mapItemType: "station",
              location: newLocation,
            });
            dispatch(updateMapDirective(null));
          },
          onMouseOver: () => {
            dispatch(
              setHoverUuidsForSequence({ sequenceUuid: station.uuid, mapItemType: "station" })
            );
          },
          onMouseOut: () => {
            dispatch(clearMapItemHover());
          },
          tooltipOptions: {
            permanent: mapDisplayStations.showLabels,
            offset: new L.Point(0, -10),
          },
          iconClassName: styles.mapIcon,
          iconWin10ClassName: styles.mapIconWin10,
          iconWrapperClassName: styles.iconWrapper,
        });

        if (mapDisplayStations.showCircles) {
          const circleDefinitions = partialMission.circleDefinitions;

          // draw circle around station for each mapCircleControl.
          Object.entries(circleDefinitions || {}).forEach(([uuid, circleDefinition]) => {
            /*
             * Map does NOT think in terms of planets for coordinates,
             * and currently acts as if coordinates correspond to earth.
             * Therefore, it is necessary to calculate distance in relation
             * to the radius of the earth, and not in relation to the planet
             * the mission is on for the projection.
             *
             * Previously, non-equatorial map projections required an additional
             * adjustment of Initial Radius Adjust * Earth Radius / (2 * Planet Radius).
             * This is seemingly no longer needed, but keep this in mind in case.
             */
            const earthRadiusInMeters = EARTH_RADIUS;
            const radiusAdjustment = earthRadiusInMeters / partialMission.planetRadius;

            const drawDistance = (circleDefinition.radius * radiusAdjustment) / 1000;

            if (station.mapCircleControls[uuid]?.visible) {
              // Turf Coords are in (lng, lat) format

              const circleStyle = station.mapCircleControls[uuid]?.style;

              const dashLen = circleStyle?.dashLen || 10;

              const stationCircles: AEGISGeoJSONCircle[] = [];

              stationCircles.push(
                L.geoJSON(
                  circle(point([station.location.lng, station.location.lat]), drawDistance, {
                    steps: 256,
                  }),
                  {
                    style: {
                      ...circleStyle,
                      interactive: false,
                      dashArray: circleStyle.isDashed ? `${dashLen}, ${dashLen}` : undefined,
                    },
                  }
                ) as AEGISGeoJSONCircle
              );

              if (circleStyle?.isDashed) {
                stationCircles.push(
                  L.geoJSON(
                    circle(point([station.location.lng, station.location.lat]), drawDistance, {
                      steps: 256,
                    }),
                    {
                      style: {
                        ...circleStyle,
                        color: circleStyle?.altColor,
                        opacity: circleStyle?.altOpacity,
                        interactive: false,
                        dashArray: `${dashLen}, ${dashLen}`,
                        dashOffset: `${dashLen}`,
                      },
                    }
                  ) as AEGISGeoJSONCircle
                );
              }

              stationCircles.forEach((circleLayer) => {
                circleLayer.mapItemType = "stationCircle";
                circleLayer.uuid = `${station.uuid}-${uuid}`; // Add unique identifier
                stationCirclesFeatureGroup.current.addLayer(circleLayer);
              });
            }
          });
        }

        stationFeatureGroup.current.setZIndex(999);
        stationCirclesFeatureGroup.current.setZIndex(998); // Set z-index below stations
      }
    });
  }, [
    partialMission.circleDefinitions,
    partialMission.planetRadius,
    allStations,
    selectedStation,
    selectedEva,
    mapDisplayStations,
    sectionSelected,
    mapDirective,
    dispatch,
    isWin10,
    foldersInterface,
    folders,
    asPlannedStationUuids,
  ]);

  /**
   * Determine current map time and update the map time state
   */
  useEffect(() => {
    if (presetPreviewTime && sectionSelected === "preset") {
      setMapDateTime(presetPreviewTime);
    } else if (selectedRexDateTime) {
      setMapDateTime(selectedRexDateTime);
    } else if (sequenceTime) {
      setMapDateTime(sequenceTime);
    } else if (selectedEva?.datetime != null) {
      setMapDateTime(new Date(selectedEva.datetime).toISOString());
    } else if (missionSublayers) {
      setMapDateTime(
        missionSublayers.find((sublayer) => sublayer.isTimeBased)?.timeLayerManifest[0].datetime
      );
    } else {
      setMapDateTime(null);
    }
  }, [
    selectedEva,
    presetPreviewTime,
    sectionSelected,
    missionSublayers,
    sequenceTime,
    selectedRexDateTime,
  ]);

  /** Determine time associated with currently running rex time */
  useEffect(() => {
    if (selectedRex && runningRexEvaDatetime) {
      // If PET is running, update time every 10 seconds
      if (selectedRex.petRunning) {
        if (!rexPetTime) return;
        if (rexPetTime.endsWith("0"))
          setSelectedRexDateTime(addTimeToDateTime(runningRexEvaDatetime, rexPetTime));

        // If the REX is running but not the PET, just show the current time
      } else if (!selectedRex.petRunning && selectedRex.isRunning) {
        if (!rexPetTime) return;
        setSelectedRexDateTime(addTimeToDateTime(runningRexEvaDatetime, rexPetTime));

        // If the REX is not running but you are viewing it, show the REX start time
      } else if (!selectedRex.isRunning && sectionSelected === "evas") {
        setSelectedRexDateTime(
          runningRexEvaDatetime != null ? new Date(runningRexEvaDatetime).toISOString() : null
        );

        // Otherwise, don't display a REX time
      } else {
        setSelectedRexDateTime(null);
      }
    } else {
      setSelectedRexDateTime(null);
    }
  }, [rexPetTime, runningRexEvaDatetime, sectionSelected, selectedRex]);

  /**
   * Determine actions to show and draw them on map when actions or selections change
   */
  useEffect(() => {
    if (!actions || !map.current || mapDirective) return;

    let actionsToShow: Action[] = [];
    if (mapDisplayActions.show) {
      if ((sectionSelected === "station" || sectionSelected === "evas") && selectedStation) {
        const actionsInStation = actions.filter(
          (action) => action.stationUuid === selectedStation.uuid && action.enabled
        );
        actionsToShow = actionsInStation;
      } else if (sectionSelected === "poi" && selectedPoi) {
        const actionsInPoi = actions.filter(
          (action) => action.poiUuid === selectedPoi.uuid && action.enabled
        );
        actionsToShow = actionsInPoi;
      } else if (sectionSelected === "evas" && selectedTraverse) {
        const actionsInTraverse = actions.filter(
          (action) => action.traverseUuid === selectedTraverse.uuid && action.enabled
        );
        actionsToShow = actionsInTraverse;
      }
    }

    // delete all actions in leaflet
    actionFeatureGroup.current.clearLayers();

    // draw or update all actions
    actionsToShow.forEach((action) => {
      if (action.location) {
        let actionName = `${titleCase(action.type)}: ${action.name}`;
        if (action.stmAction) {
          actionName = getStmActionName({
            actionDefinition: action.actionDefinition,
            missionActionDefs: partialMission.actionDefinitions,
          });
        }

        drawOrUpdateMarkerOnMap({
          map,
          featureGroup: actionFeatureGroup,
          name: actionName,
          uuid: action.uuid,
          iconEmoji: action.icon ? action.icon : "2754", //default to question mark
          location: action.location,
          mapItemType: "action",
          isWin10,
          onDragEnd: (marker: AEGISMarker) => {
            const newLocation = convertLeafletLatLngToAegisPoint(marker.getLatLng());
            saveUpdatedItemPosition({
              dispatch,
              uuid: action.uuid,
              mapItemType: "action",
              location: newLocation,
            });
            dispatch(updateMapDirective(null));
          },
          tooltipOptions: {
            permanent: mapDisplayActions.showLabels,
            offset: new L.Point(0, -10),
          },
          iconClassName: styles.mapIcon,
          iconWin10ClassName: styles.mapIconWin10,
          iconWrapperClassName: styles.iconWrapper,
        });
      }
    });
  }, [
    partialMission.actionDefinitions,
    actions,
    selectedStation,
    selectedPoi,
    selectedTraverse,
    mapDisplayActions,
    sectionSelected,
    mapDirective,
    dispatch,
    isWin10,
  ]);

  /**
   * Determine POIs to show and draw them on map when POIs or selections change
   */
  useEffect(() => {
    if (!pois || !map.current || mapDirective) return;
    let poisToShow: POI[] = [];

    if (mapDisplayPois.show) {
      poisToShow = pois;

      // Get all POI folders and their interfaces
      const poiFolders = folders.filter((folder) => folder.type === "poi");

      // Filter out POIs that are in hidden folders
      poisToShow = poisToShow.filter((poi) => {
        // Always show selected POI regardless of folder visibility
        if (selectedPoi && poi.uuid === selectedPoi.uuid) {
          return true;
        }

        // Find which folder contains this POI
        const containingFolder = poiFolders.find((folder) => folder.items.includes(poi.uuid));

        if (!containingFolder) {
          return true; // Keep POIs not in any folder
        }

        // Check if the folder is visible in the interface
        const folderInterface = foldersInterface.find((fi) => fi.uuid === containingFolder.uuid);

        return !folderInterface || folderInterface.visible;
      });
    } else if (selectedPoi && sectionSelected === "poi") {
      // If map display is off but we're in POI section, show selected POI
      poisToShow = [selectedPoi];
    }

    // delete all pois in leaflet
    poiFeatureGroup.current.clearLayers();

    // draw or update all pois
    poisToShow.forEach((poi) => {
      if (poi.location) {
        drawOrUpdateMarkerOnMap({
          map,
          featureGroup: poiFeatureGroup,
          name: poi.name,
          uuid: poi.uuid,
          iconEmoji: poi.icon, // no default because object always starts red circle
          location: poi.location,
          mapItemType: "poi",
          isWin10,
          onClick: () => {
            dispatch(thunkMarkerOnClick({ markerUuid: poi.uuid, mapItemType: "poi" }));
          },
          onDragEnd: (marker: AEGISMarker) => {
            const newLocation = convertLeafletLatLngToAegisPoint(marker.getLatLng());
            saveUpdatedItemPosition({
              dispatch,
              uuid: poi.uuid,
              mapItemType: "poi",
              location: newLocation,
            });
            dispatch(updateMapDirective(null));
          },
          tooltipOptions: {
            permanent: mapDisplayPois.showLabels,
            offset: new L.Point(0, -10),
          },
          iconClassName: styles.mapIcon,
          iconWin10ClassName: styles.mapIconWin10,
          iconWrapperClassName: styles.iconWrapper,
        });
      }
    });
  }, [
    pois,
    selectedPoi,
    mapDisplayPois,
    sectionSelected,
    mapDirective,
    isWin10,
    dispatch,
    foldersInterface,
    folders,
  ]);

  /**
   * Determine traverses to show and draw them on map when traverses or selections change
   */
  useEffect(() => {
    if (!traverses || !map.current || mapDirective) return;

    let traversesToShow: Traverse[] = [];
    if (sectionSelected === "evas") {
      if (selectedEva) {
        const traverseSequenceItems = selectedEva.sequence.filter(
          (item) => item.type === "traverse"
        );
        const traversesInEva = traverses.filter((traverse) =>
          traverseSequenceItems.find((item) => item.uuid === traverse.uuid)
        );
        traversesToShow = traversesInEva;
      } else if (selectedTraverse) {
        traversesToShow = [selectedTraverse];
      }
    }

    // delete all traverses from the map
    map.current.eachLayer((layer: AEGISMapDrawingLayer) => {
      if (layer.mapItemType === "traverse") {
        map.current.removeLayer(layer);
      }
    });
    // draw all traverses in the selectedEva sequence
    traversesToShow.forEach((traverse) => {
      const baseColor = traverse.color || selectedEva?.traverseColor || "#03adfc";

      drawPolylineOnMap({
        map,
        name: traverse.name,
        uuid: traverse.uuid,
        path: traverse.path,
        color: baseColor,
        mapItemType: "traverse",
        showArrows,
        onClick: () => {
          dispatch(thunkPolylineOnClick({ polylineUuid: traverse.uuid, mapItemType: "traverse" }));
        },
        onMouseOver: () => {
          dispatch(
            setHoverUuidsForSequence({ sequenceUuid: traverse.uuid, mapItemType: "traverse" })
          );
        },
        onMouseOut: () => {
          dispatch(clearMapItemHover());
        },
        polylineOptions: {
          weight: 3,
          outlineWeight: traverse.uuid === selectedTraverse?.uuid ? 8 : 0,
        },
        arrowPatternProp: {
          offset: 10,
          endOffset: 10,
          repeat: 50,
        },
        arrowHeadOptions: {
          pixelSize: 10,
        },
        antPathWeight: 4,
      });
    });
  }, [
    traverses,
    selectedTraverse,
    selectedEva,
    mapDirective,
    dispatch,
    showArrows,
    sectionSelected,
  ]);

  /**
   * Determine measures to show and draw them on map when measures or selections change
   */
  useEffect(() => {
    if (!map.current || mapDirective || !measurements) return;

    // delete all measurements from the map
    map.current.eachLayer((layer: AEGISMapDrawingLayer) => {
      if (layer.mapItemType === "measurement") {
        map.current.removeLayer(layer);
      }
    });

    // draw all measurements
    if (selectedMeasurementUuid === null) {
      return;
    }
    const measurementsToShow = [measurements.find((m) => m.uuid === selectedMeasurementUuid)];
    measurementsToShow.forEach((measurement) => {
      if (measurement?.path.length > 1) {
        drawPolylineOnMap({
          map,
          name: "",
          uuid: measurement.uuid,
          path: measurement.path,
          color: measurement.color,
          mapItemType: "measurement",
          showArrows: true,
          onClick: () => {
            dispatch(
              thunkPolylineOnClick({ polylineUuid: measurement.uuid, mapItemType: "measurement" })
            );
          },
          polylineOptions: {
            weight: 3,
            outlineWeight: 0,
          },
          arrowPatternProp: {
            offset: 10,
            endOffset: 10,
            repeat: 50,
          },
          arrowHeadOptions: {
            pixelSize: 10,
          },
        });
      }
    });
  }, [map, mapDirective, dispatch, measurements, selectedMeasurementUuid]);

  /**
   * Draw lander radius circles
   */
  useEffect(() => {
    if (
      !map ||
      !partialMission?.landerLocation ||
      !partialMission?.circleDefinitions ||
      !selectedPreset?.mapCircleControls ||
      !partialMission?.planetRadius
    )
      return;

    const circleDefinitions = partialMission.circleDefinitions;
    const landerLocation = partialMission.landerLocation;

    map.current.eachLayer((layer: AEGISGeoJSONCircle) => {
      if (layer.mapItemType === "landerCircle") {
        layer.remove();
      }
    });

    Object.entries(circleDefinitions || {}).forEach(([uuid, circleDefinition]) => {
      /*
       * Map does NOT think in terms of planets for coordinates,
       * and currently acts as if coordinates correspond to earth.
       * Therefore, it is necessary to calculate distance in relation
       * to the radius of the earth, and not in relation to the planet
       * the mission is on for the projection.
       *
       * Previously, non-equatorial map projections required an additional
       * adjustment of Initial Radius Adjust * Earth Radius / (2 * Planet Radius).
       * This is seemingly no longer needed, but keep this in mind in case.
       */
      const earthRadiusInMeters = EARTH_RADIUS;
      const radiusAdjustment = earthRadiusInMeters / partialMission.planetRadius;

      const drawDistance = (circleDefinition.radius * radiusAdjustment) / 1000;

      if (selectedPreset.mapCircleControls[uuid]?.visible) {
        const circleStyle = selectedPreset.mapCircleControls[uuid]?.style;

        const landerCircle: AEGISGeoJSONCircle[] = [];

        const dashLen = circleStyle?.dashLen || 10;

        landerCircle.push(
          L.geoJSON(
            circle(point([landerLocation.lng, landerLocation.lat]), drawDistance, {
              steps: 256,
            }),
            {
              style: {
                ...circleStyle,
                interactive: false,
                dashArray: circleStyle.isDashed ? `${dashLen}, ${dashLen}` : undefined,
              },
            }
          ) as AEGISGeoJSONCircle
        );

        if (circleStyle?.isDashed) {
          landerCircle.push(
            L.geoJSON(
              circle(point([landerLocation.lng, landerLocation.lat]), drawDistance, {
                steps: 256,
              }),
              {
                style: {
                  ...circleStyle,
                  color: circleStyle?.altColor,
                  opacity: circleStyle?.altOpacity,
                  interactive: false,
                  dashArray: `${dashLen}, ${dashLen}`,
                  dashOffset: `${dashLen}`,
                },
              }
            ) as AEGISGeoJSONCircle
          );
        }

        landerCircle.forEach((circleLayer) => {
          circleLayer.mapItemType = "landerCircle";
          circleLayer.uuid = `lander-${uuid}`; // Add unique identifier
          map.current.addLayer(circleLayer);
        });
      }
    });
  }, [
    partialMission?.landerLocation,
    partialMission?.circleDefinitions,
    partialMission?.planetRadius,
    map,
    selectedPreset?.mapCircleControls,
  ]);

  /**
   * Set grid settings
   */
  useEffect(() => {
    if (!map || !mapBounds || !globalGrid?.coordinates || !gridCorner || !selectedPreset) return;

    if (selectedPreset.mapGridControl?.visible) {
      const size: L.Point = map.current.getSize();
      const gridStart: AEGISPoint = convertLeafletLatLngToAegisPoint(
        map.current.containerPointToLatLng([0, 0])
      );
      const gridEnd: AEGISPoint = convertLeafletLatLngToAegisPoint(
        map.current.containerPointToLatLng([size.x, size.y])
      );

      setGridBounds([
        findClosestPointInGlobalGrid(
          globalGrid.coordinates,
          gridStart,
          partialMission.planetRadius
        ),
        findClosestPointInGlobalGrid(globalGrid.coordinates, gridEnd, partialMission.planetRadius),
      ]);
      setMapGridControls(selectedPreset.mapGridControl);
    } else {
      setGridBounds(null);
      setMapGridControls(null);
    }
  }, [
    gridCorner,
    map,
    mapBounds,
    mapZoom,
    partialMission.id,
    partialMission.planetRadius,
    selectedPreset,
  ]);

  /**
   * Draw grid
   */
  useEffect(() => {
    if (!map || !partialMission?.planetRadius || !mapBounds || !globalGrid?.coordinates) return;

    map.current.eachLayer((layer: AEGISGeoJSONGrid | AEGISGeoJSONGridPoint) => {
      if (layer?.mapItemType === "Grid System" || layer?.mapItemType === "Grid Point") {
        layer.remove();
      }
    });

    if (!gridBounds || !mapGridControls) return;

    const gridCoordinates: MissionGridPoint[][] = globalGrid.coordinates;

    const basePointsShown =
      (gridBounds[1].row - gridBounds[0].row) * (gridBounds[1].col - gridBounds[0].col);
    let lineZoomLevel = 50;
    if (basePointsShown < 500) {
      lineZoomLevel = 1;
    } else if (basePointsShown < 4000) {
      lineZoomLevel = 10;
    }

    const startIndex: GridIndex = adjustGridIndex(
      gridBounds[0],
      globalGrid.coordinates.length,
      globalGrid.coordinates[0].length,
      lineZoomLevel,
      true
    );
    const endIndex: GridIndex = adjustGridIndex(
      gridBounds[1],
      globalGrid.coordinates.length,
      globalGrid.coordinates[0].length,
      lineZoomLevel,
      false
    );

    const lines: Feature[] = [];
    for (let i = endIndex.row; i >= startIndex.row; i -= lineZoomLevel) {
      lines.push(
        lineString([
          [
            gridCoordinates[i][startIndex.col].coordinates.lng,
            gridCoordinates[i][startIndex.col].coordinates.lat,
          ],
          [
            gridCoordinates[i][endIndex.col].coordinates.lng,
            gridCoordinates[i][endIndex.col].coordinates.lat,
          ],
        ])
      );
    }

    for (let i = startIndex.col; i <= endIndex.col; i += lineZoomLevel) {
      lines.push(
        lineString([
          [
            gridCoordinates[startIndex.row][i].coordinates.lng,
            gridCoordinates[startIndex.row][i].coordinates.lat,
          ],
          [
            gridCoordinates[endIndex.row][i].coordinates.lng,
            gridCoordinates[endIndex.row][i].coordinates.lat,
          ],
        ])
      );
    }

    const geoJSONGrid: AEGISGeoJSONGrid = L.geoJSON(featureCollection(lines), {
      style: {
        interactive: false,
        fillColor: "none",
        ...mapGridControls.style,
      },
    }) as AEGISGeoJSONGrid;
    geoJSONGrid.mapItemType = "Grid System";
    map.current.addLayer(geoJSONGrid);

    if (mapGridControls.labelsVisible) {
      for (let i = endIndex.row; i >= startIndex.row; i -= lineZoomLevel) {
        for (let j = startIndex.col; j < endIndex.col; j += lineZoomLevel) {
          if (i !== startIndex.row && j !== endIndex.col) {
            const point: MissionGridPoint = gridCoordinates[i][j];
            if (point.name === null) {
              continue;
            }
            const latLng: L.LatLng = { ...point.coordinates } as L.LatLng;
            const marker: AEGISGeoJSONGridPoint = L.tooltip({
              sticky: false,
              direction: "right",
              offset: new L.Point(0, -8),
              permanent: true,
              className: "leaflet-tooltip-gridLabels",
              interactive: false,
              opacity: 0.8,
            })
              .setLatLng(latLng)
              .setContent(point.name) as AEGISGeoJSONGridPoint;
            marker.mapItemType = "Grid Point";
            marker.addTo(map.current);
          }
        }
      }
    }
  }, [
    partialMission?.planetRadius,
    map,
    mapZoom,
    mapBounds,
    partialMission.id,
    partialMission.activeGridUuid,
    gridBounds,
    mapGridControls,
  ]);

  /**
   * Draw or update lander
   */
  useEffect(() => {
    if (!map.current || mapDirective || !partialMission.landerLocation) return;

    drawLanderOnMap({
      map,
      location: partialMission.landerLocation,
      onClick: () => {
        dispatch(setSectionSelected("mission"));
        dispatch(thunkSetRightPanelIsOpenIfAuto(true));
      },
      onDragEnd: async (marker: AEGISMarker) => {
        const newLocation = convertLeafletLatLngToAegisPoint(marker.getLatLng());
        try {
          setIsLoading(true);
          await saveUpdatedItemPosition({
            dispatch,
            uuid: "lander",
            mapItemType: "lander",
            location: newLocation,
          });
        } finally {
          setIsLoading(false);
        }
        dispatch(updateMapDirective(null));
      },
      tooltipOptions: {
        permanent: false,
        offset: new L.Point(0, -10),
      },
    });
  }, [map, mapDirective, partialMission.landerLocation, dispatch, setIsLoading]);

  /**
   * Draw station walkback on the map when the selected station changes
   */
  useEffect(() => {
    if (!map.current || mapDirective) return;
    // remove all walkback traverses from the map
    map.current.eachLayer((layer: AEGISMarker | AEGISPolyline) => {
      if (layer.mapItemType === "walkback") {
        map.current.removeLayer(layer);
      }
    });

    // only show walkbacks on station and eva sections
    if (sectionSelected !== "station" && sectionSelected !== "evas") return;

    // draw the walkback traverse
    if (selectedStation?.walkbackPath && mapDisplayStations.showWalkbacks) {
      drawPolylineOnMap({
        map,
        name: selectedStation.name,
        uuid: selectedStation.uuid,
        path: selectedStation.walkbackPath,
        color: "red",
        mapItemType: "walkback",
        dashArray: "5, 5",
        showArrows: false,
        onClick: () => {
          dispatch(setSectionSelected("station"));
          dispatch(setSelectedStationUuid(selectedStation.uuid));
        },
        onMouseOver: () => {
          dispatch(
            setHoverUuidsForSequence({
              sequenceUuid: selectedStation.uuid,
              mapItemType: "walkback",
            })
          );
        },
        onMouseOut: () => {
          dispatch(clearMapItemHover());
        },
        polylineOptions: {
          weight: 3,
          outlineWeight: 0,
        },
        arrowPatternProp: {
          offset: 10,
          endOffset: 10,
          repeat: 50,
        },
        arrowHeadOptions: {
          pixelSize: 10,
        },
      });
    }
  }, [
    map,
    selectedStation,
    mapDirective,
    dispatch,
    sectionSelected,
    mapDisplayStations.showWalkbacks,
  ]);

  /**
   * General Pos Entry drawing function. Determines which pos entries to show and draws them on the map. Also determines latest pos entries for each pos type.
   */
  useEffect(() => {
    if (!map.current) return;

    let posEntriesToShow: PosEntry[] = [];
    let posTypeLatestEntries: { [key: string]: PosEntry[] } = {};

    // determine which pos entries to show
    if (mapDisplayPos.show) {
      //there's a rex selected and we're on the eva section
      if (sectionSelected === "evas" && selectedRex) {
        const posEntriesWithLocations = posEntries?.filter((posEntry) => posEntry.location);
        // filter out the pos entries that are not from a selected source. Empty source array means "all".
        let filteredPosEntries: PosEntry[] = [];
        if (mapDisplayPos.sourceUuids.length > 0) {
          filteredPosEntries = posEntriesWithLocations?.filter((posEntry) =>
            mapDisplayPos.sourceUuids.includes(posEntry.posSourceUuid)
          );
        } else {
          filteredPosEntries = posEntriesWithLocations;
        }
        posEntriesToShow = orderBy(filteredPosEntries, ["createdAt"], "desc");
        // gather the latest 2 pos entries (need 2 in order to draw a polyline) for each type.
        // Most recent/latest entry is first in the array.
        posTypeLatestEntries = getLatestPosEntryByType({
          allPosEntries: filteredPosEntries,
        });
      }
    }

    // delete all pos entries in leaflet
    posEntryFeatureGroup.current.clearLayers();

    if (!selectedRex) return;

    // draw or update all pos markers
    for (const posEntry of posEntriesToShow) {
      if (!mapDisplayPos.showMarkers) break; //exit for, no markers need to be drawn
      if (!posEntry.location) continue; // go to next pos entry
      if (isEqual(posEntry.location, egressLocation)) continue; // don't draw pos entries on top of lander

      // determine if this is one of the latest entries. If so, determine which latest pos types exist in this entry
      const customPosTypesUuids: string[] = [];

      let isRecent = false;
      posEntry.posTypeUuids.forEach((posTypeUuid) => {
        if (posTypeLatestEntries[posTypeUuid]?.[0]?.uuid === posEntry.uuid) {
          isRecent = true;
          customPosTypesUuids.push(posTypeUuid);
        }
      });

      // determine if this position entry should be drawn
      if (!mapDisplayPos.showOldMarkers) {
        if (!isRecent) continue; //this is an old pos entry, go to next entry
      }
      // all pos entries are being drawn. determine if this entry should be faded
      let opacity: number = 1;
      if (mapDisplayPos.fadeOldMarkers) {
        let lastEntry = false;
        // check if this is the latest (most recent) entry for a pos type
        for (const posTypeUuid in posTypeLatestEntries) {
          if (posTypeLatestEntries[posTypeUuid]?.[0]?.uuid === posEntry.uuid) {
            lastEntry = true;
            break;
          }
        }
        if (!lastEntry) opacity = 0.4;
      }

      // determine if label should be shown
      let keepTooltipOpen = mapDisplayPos.showAllLabels;
      if (mapDisplayPos.showLatestLabels) {
        // check each pos type for this pos entry
        posEntry.posTypeUuids.forEach((posTypeUuid) => {
          if (posTypeLatestEntries[posTypeUuid][0]?.uuid === posEntry.uuid) {
            keepTooltipOpen = true;
          }
        });
      }

      drawPosMarkerOnMap({
        map,
        posEntry: posEntry,
        posEntryFeatureGroup,
        selectedOrRunningRex: selectedRex,
        isWin10,
        showOldMarkers: mapDisplayPos.showOldMarkers,
        showLatestLabels: mapDisplayPos.showLatestLabels,
        rexPetTime,
        onClick: () => {
          dispatch(setSelectedPosEntryUuid(posEntry.uuid));
          dispatch(thunkSelectEVASequenceItem({ sequenceItemUuid: null }));
        },
        onDragEnd: (marker: AEGISMarker) => {
          const newLocation = convertLeafletLatLngToAegisPoint(marker.getLatLng());
          saveUpdatedItemPosition({
            dispatch,
            uuid: posEntry.uuid,
            mapItemType: "posEntry",
            location: newLocation,
          });
          dispatch(updateMapDirective(null));
        },
        onMouseOver: (markerUuid) => {
          dispatch(setHoverUuidsForPosEntry(markerUuid));
        },
        onMouseOut: () => {
          dispatch(clearMapItemHover());
        },
        markerOptions: { opacity },
        tooltipOptions: { opacity: 1, permanent: keepTooltipOpen, offset: new L.Point(0, -10) },
        overridePosTypesUuidsToDraw: customPosTypesUuids.length > 0 ? customPosTypesUuids : null,
        iconClassName: styles.posIcon,
        iconWin10ClassName: styles.posIconWin10,
        iconWrapperClassName: styles.iconWrapper,
        barClassName: styles.posBar,
        overrideEVIcon: false,
      });
    }

    // draw or update path
    if (mapDisplayPos.showPaths) {
      //hide old paths
      if (!mapDisplayPos.showOldPaths) {
        for (const posType of posTypes) {
          if (!posTypeLatestEntries[posType.uuid] || posTypeLatestEntries[posType.uuid].length <= 1)
            continue;
          //loop over posTypes and get their latest entries
          drawPosPathOnMap({
            posEntryFeatureGroup,
            coords: reverse(
              posTypeLatestEntries[posType.uuid].map((posEntry) => {
                return posEntry.location;
              })
            ),
            uuid: posType.uuid,
            polylineOptions: {
              opacity: 0.6, //default path opacity
              color: posType.pathColor,
              weight: 2,
            },
          });
        }
      } else {
        // show all paths
        const rexPosTypes = posTypes;
        rexPosTypes?.forEach((posType) => {
          const posEntriesForType = posEntriesToShow.filter((posEntry) =>
            posEntry.posTypeUuids.includes(posType.uuid)
          );

          if (posEntriesForType.length > 1) {
            // determine if should fade old paths
            if (mapDisplayPos.fadeOldPaths) {
              // fade old paths
              drawPosPathOnMap({
                posEntryFeatureGroup,
                coords: reverse(
                  posEntriesForType.slice(1).map((posEntry) => {
                    return posEntry.location;
                  })
                ),
                uuid: `${posType.uuid} faded`,
                polylineOptions: {
                  opacity: 0.2,
                  color: posType.pathColor,
                  weight: 2,
                },
              });
              // latest path is a separate polyline thats not faded
              drawPosPathOnMap({
                posEntryFeatureGroup,
                coords: reverse(
                  posEntriesForType.slice(0, 2).map((posEntry) => {
                    return posEntry.location;
                  })
                ),
                uuid: posType.uuid,
                polylineOptions: {
                  opacity: 0.6, //default path opacity
                  color: posType.pathColor,
                  weight: 2,
                },
              });
            } else {
              // no fade
              drawPosPathOnMap({
                posEntryFeatureGroup,
                coords: reverse(
                  posEntriesForType.map((posEntry) => {
                    return posEntry.location;
                  })
                ),
                uuid: posType.uuid,
                polylineOptions: {
                  opacity: 0.6, //default path opacity
                  color: posType.pathColor,
                  weight: 2,
                },
              });
            }
          }
        });
      }
    }

    //set in local state to be used in other use effects. Do this last so markers exist
    setLatestPosEntriesByType(posTypeLatestEntries);
    setPosEntriesShowing(posEntriesToShow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    map,
    dispatch,
    mapDisplayPos,
    posTypes,
    posSources,
    posEntries,
    sectionSelected,
    isWin10,
    egressLocation,
    selectedEva?.egressLocationUuid,
  ]); // do not include dependency for rexPetTime

  /**
   * Update position entry tooltips when rex is ticking
   */
  useEffect(() => {
    if (!map.current || !posEntriesShowing || posEntriesShowing.length === 0) return;
    const rexPetSeconds = secondsFromhhmmss(rexPetTime);

    // turn on latest label only
    if (mapDisplayPos.showLatestLabels) {
      // get a unique array of the latest pos entries. Multiple types may share the same entry
      const uniqueLatestPosEntries = uniqBy(
        Object.values(latestPosEntriesByType).map((posEntries) => {
          return posEntries[0];
        }),
        "uuid"
      );
      for (const latestPosEntry of orderBy(uniqueLatestPosEntries, ["createdAt", "asc"])) {
        const posMarker = getMapItemByUuid(map, latestPosEntry.uuid) as AEGISMarker;
        if (!posMarker) continue;

        // build the abbreviation string
        const markerPosTypeAbbrs: string[] = [];
        for (const posTypeUuidFromEntry of latestPosEntry.posTypeUuids) {
          // check if this entryPosType is in any other more recent posEntry
          const otherPosEntriesWithThisType = uniqueLatestPosEntries.filter(
            (entry) =>
              entry.posTypeUuids.includes(posTypeUuidFromEntry) &&
              entry.createdAt > latestPosEntry.createdAt
          );
          if (otherPosEntriesWithThisType.length === 0) {
            const posTypeAbbr = posTypes?.find(
              (posTypeFromRex) => posTypeFromRex.uuid === posTypeUuidFromEntry
            )?.abbr;
            markerPosTypeAbbrs.push(posTypeAbbr);
          }
        }

        // set the marker tooltip
        const timeToShow = hhmmssFromSeconds(rexPetSeconds - latestPosEntry.petSeconds);
        const sourceAbbr = posSources?.find(
          (posSource) => posSource.uuid === latestPosEntry.posSourceUuid
        )?.abbr;
        const newLabel = `${timeToShow} / ${markerPosTypeAbbrs} (${sourceAbbr})`;
        posMarker.setTooltipContent(newLabel);
      }
    } else {
      // update all timers on all tooltips
      for (let i = 0; i < posEntriesShowing.length; i++) {
        //build label
        const timeToShow = hhmmssFromSeconds(rexPetSeconds - posEntriesShowing[i].petSeconds);
        const sourceAbbr = posSources?.find(
          (posSource) => posSource.uuid === posEntriesShowing[i].posSourceUuid
        )?.abbr;
        const markerPosTypeAbbrs = posEntriesShowing[i].posTypeUuids.map((posTypeUuid) => {
          const posType = posTypes?.find((posType) => posType.uuid === posTypeUuid);
          return posType?.abbr;
        });
        const newLabel = `${timeToShow} / ${markerPosTypeAbbrs} (${sourceAbbr})`;

        const posMarker = getMapItemByUuid(map, posEntriesShowing[i].uuid) as AEGISMarker;
        if (posMarker) {
          posMarker.setTooltipContent(newLabel);
        }
      }
    }
  }, [
    map,
    rexPetTime,
    posEntriesShowing,
    latestPosEntriesByType,
    mapDisplayPos.showLatestLabels,
    posTypes,
    posSources,
  ]);

  /**
   * Draw or update hover timeline marker (astronaut) on the map when the hover seconds change.
   */
  useEffect(() => {
    const updateHoverTimelineMarkerAsync = async () => {
      if (!map.current) return;

      //hoverSeconds is null meaning we're not hovering.
      if (!hover.sequenceItemPercentElapsed || !selectedEva) {
        //Remove the marker from map if exists
        hoverAstronautFeatureGroup.current.clearLayers();
        return;
      }

      //find where this point should be drawn on the eva
      const sequenceItem = selectedEva.sequence.find(
        (seqItem) => seqItem.uuid === hover.mapItemUuid
      );
      if (sequenceItem) {
        let location: AEGISPoint = { lat: 0, lng: 0 };
        const matchedStation = allStations.find((s) => s.uuid === sequenceItem.uuid);
        const matchedTraverse = traverses.find((t) => t.uuid === sequenceItem.uuid);
        if (!matchedStation && !matchedTraverse) return location;

        if (matchedStation) {
          location = matchedStation.location;
        } else if (matchedTraverse) {
          const traverse = matchedTraverse as Traverse;

          //how far (in distance) are we along the entire traverse. Ex: 5m into a 25m traverse
          const cumulativeCurrentDistance =
            traverse.pathSegmentDistances.reduce(
              (accumulator, currentValue) => accumulator + currentValue,
              0
            ) * hover.sequenceItemPercentElapsed;
          //determine which segment we are in
          let cumulativePrevSegDistances = 0;
          for (let i = 0; i < traverse.pathSegmentDistances.length; i++) {
            if (
              cumulativePrevSegDistances + traverse.pathSegmentDistances[i] >
              cumulativeCurrentDistance
            ) {
              //we are in this segment

              // Here we use the fact that Leaflet is already projecting the map and we convert
              // between pixel points on the leaflet instance against the coordinates underlying those points.
              // This helps us around the south pole where we can't really use bearing to determine our path to the next point.
              // This method results in a parabola at the south pole

              // get the x, y pixel coordinates of the source and destination points
              const sourcePixelCoords = map.current.latLngToLayerPoint(
                new L.LatLng(traverse.path[i].lat, traverse.path[i].lng)
              );
              const destPixelCoords = map.current.latLngToLayerPoint(
                new L.LatLng(traverse.path[i + 1].lat, traverse.path[i + 1].lng)
              );

              // get the distance between the two points in pixels using pythagorean theorem
              const distancePixels = Math.sqrt(
                Math.pow(destPixelCoords.x - sourcePixelCoords.x, 2) +
                  Math.pow(destPixelCoords.y - sourcePixelCoords.y, 2)
              );

              // distance of segment in meters
              const distanceMeters = traverse.pathSegmentDistances[i];

              // distance along this segment in meters
              const percentAlongDistanceMeters =
                traverse.pathSegmentDistances[i] -
                (cumulativePrevSegDistances +
                  traverse.pathSegmentDistances[i] -
                  cumulativeCurrentDistance);

              // distance along this segment in pixels using ratio comparison
              const percentAlongDistancePixels =
                (percentAlongDistanceMeters * distancePixels) / distanceMeters;

              // x, y pixel coordinates of the point along the segment using the sourcePixelCoords as the origin
              const x =
                sourcePixelCoords.x +
                (percentAlongDistancePixels * (destPixelCoords.x - sourcePixelCoords.x)) /
                  distancePixels;
              const y =
                sourcePixelCoords.y +
                (percentAlongDistancePixels * (destPixelCoords.y - sourcePixelCoords.y)) /
                  distancePixels;

              // convert the pixel coordinates back to lat/lng
              const latLng = map.current.layerPointToLatLng(new L.Point(x, y));
              location = { lat: latLng.lat, lng: latLng.lng };

              break;
            } else {
              cumulativePrevSegDistances += traverse.pathSegmentDistances[i];
            }
          }
        }
        const html = ReactDOMServer.renderToString(
          <div className={isWin10 ? styles.mapIconWin10 : styles.mapIcon}>
            <EmojiRenderer iconValue="1f468-200d-1f680" />
          </div>
        );
        const icon = L.divIcon({ html });

        if (isNaN(location.lat) || isNaN(location.lng)) return;
        //if exists, set location
        //for each layer in hoverAstronautFeatureGroup find the one with the uuid
        const existingLayer = hoverAstronautFeatureGroup.current
          .getLayers()
          .find((layer: AEGISMarker | AEGISPolyline) => {
            return layer.uuid === "hover-marker-uuid";
          }) as AEGISMarker;

        if (existingLayer) {
          existingLayer.setLatLng(location as L.LatLng);
        } else {
          //marker doesn't exist, draw it and add it to leaflet
          const marker = L.marker(location as AEGISPoint, {
            icon,
          }) as AEGISMarker;
          marker.uuid = "hover-marker-uuid";
          marker.mapItemType = "hover";
          marker.setZIndexOffset(2000);

          hoverAstronautFeatureGroup.current.addLayer(marker);
        }
      }
    };
    updateHoverTimelineMarkerAsync();
  }, [hover, selectedEva, dispatch, partialMission.planetRadius, isWin10, allStations, traverses]);

  /**
   * Draw or update hover measure marker (cross mark) on the map when the hover x value changes.
   */
  useEffect(() => {
    if (!map.current) return;

    if (!hover.measurementUuid) {
      //if no hover, remove the layer from leaflet
      const measureHover = getMapItemByUuid(map, "measure-hover-marker-uuid") as AEGISMarker;
      if (measureHover) map.current.removeLayer(measureHover);
      return;
    }

    //search for marker on the map
    let measureHover = getMapItemByUuid(map, "measure-hover-marker-uuid") as AEGISMarker;
    if (!measureHover) {
      //if doesn't exist, draw it and add it to leaflet
      measureHover = L.marker([0, 0], {
        icon: L.divIcon({
          html: ReactDOMServer.renderToString(
            <div className={isWin10 ? styles.mapIconWin10 : styles.mapIcon}>
              <EmojiRenderer iconValue="274c" />
            </div>
          ),
        }),
      }) as AEGISMarker;
      measureHover.uuid = "measure-hover-marker-uuid";
      measureHover.mapItemType = "hover";
      measureHover.setZIndexOffset(2000);
      map.current.addLayer(measureHover);
    }

    const measurement = measurements.find((m) => m.uuid === hover.measurementUuid);
    if (!measurement?.pathSegmentDistances) return;

    //how far (in distance) are we along the entire measurement. Ex: 5m into a 25m measurement
    const percentAlongTotalDistanceMeters =
      measurement.pathSegmentDistances.reduce(
        (accumulator: number, currentValue: number) => accumulator + currentValue,
        0
      ) * hover.measurementPercentDistance;

    let cumulativePrevSegDistances = 0;
    let location: AEGISPoint = { lat: 0, lng: 0 };
    for (let i = 0; i < measurement.pathSegmentDistances.length; i++) {
      if (
        cumulativePrevSegDistances + measurement.pathSegmentDistances[i] >
        percentAlongTotalDistanceMeters
      ) {
        //we are in this segment

        // Here we use the fact that Leaflet is already projecting the map and we convert
        // between pixel points on the leaflet instance against the coordinates underlying those points.
        // This helps us around the south pole where we can't really use bearing to determine our path to the next point.
        // This method results in a parabola at the south pole

        // get the x, y pixel coordinates of the source and destination points
        const sourcePixelCoords = map.current.latLngToLayerPoint(
          new L.LatLng(measurement.path[i].lat, measurement.path[i].lng)
        );
        const destPixelCoords = map.current.latLngToLayerPoint(
          new L.LatLng(measurement.path[i + 1].lat, measurement.path[i + 1].lng)
        );

        // get the distance between the two points in pixels using pythagorean theorem
        const distancePixels = Math.sqrt(
          Math.pow(destPixelCoords.x - sourcePixelCoords.x, 2) +
            Math.pow(destPixelCoords.y - sourcePixelCoords.y, 2)
        );

        // distance of segment in meters
        const distanceMeters = measurement.pathSegmentDistances[i];

        // distance along this segment in meters
        const percentAlongSegmentDistanceMeters =
          measurement.pathSegmentDistances[i] -
          (cumulativePrevSegDistances +
            measurement.pathSegmentDistances[i] -
            percentAlongTotalDistanceMeters);

        // distance along this segment in pixels using ratio comparison
        const percentAlongSegmentDistancePixels =
          (percentAlongSegmentDistanceMeters * distancePixels) / distanceMeters;

        // x, y pixel coordinates of the point along the segment using the sourcePixelCoords as the origin
        const x =
          sourcePixelCoords.x +
          (percentAlongSegmentDistancePixels * (destPixelCoords.x - sourcePixelCoords.x)) /
            distancePixels;
        const y =
          sourcePixelCoords.y +
          (percentAlongSegmentDistancePixels * (destPixelCoords.y - sourcePixelCoords.y)) /
            distancePixels;

        // convert the pixel coordinates back to lat/lng
        const latLng = map.current.layerPointToLatLng(new L.Point(x, y));
        location = { lat: latLng.lat, lng: latLng.lng };

        break;
      } else {
        cumulativePrevSegDistances += measurement.pathSegmentDistances[i];
      }
    }
    if (isNaN(location.lat) || isNaN(location.lng)) return;
    measureHover.setLatLng(location as L.LatLng);
  }, [map, hover, isWin10, measurements]);

  /**
   * Monitor map item selection and draw selected layer on the map
   */
  useEffect(() => {
    const handler = async () => {
      if (!map.current) return;

      // remove any existing highlight layers
      map.current.eachLayer((layer: AEGISCircleMarker) => {
        if (layer?.mapItemType === "selected") {
          map.current.removeLayer(layer);
        }
      });

      let highlightLocation: AEGISPoint = null;
      let panMapToLocation: AEGISPoint = null;
      if (sectionSelected === "poi" && selectedPoi?.location) {
        // highlight selectedPoi if the poi section is selected
        highlightLocation = selectedPoi.location;
        panMapToLocation = selectedPoi.location;
      } else if (sectionSelected === "station" && selectedStation?.location) {
        highlightLocation = selectedStation.location;
        panMapToLocation = selectedStation.location;
      } else if (sectionSelected === "evas") {
        // if a pos entry is selected, highlight and pan to the pos
        if (selectedPosEntryUuid && selectedRex?.posEntries) {
          const posLocation = selectedRex.posEntries.find(
            (c) => c.uuid === selectedPosEntryUuid
          )?.location;
          highlightLocation = posLocation;
          panMapToLocation = posLocation;
        } else if (selectedEvaSequenceItemUuid) {
          // if a sequence item is selected. highlight and pan over there
          const matchedStation = allStations.find((s) => s.uuid === selectedEvaSequenceItemUuid);
          const matchedTraverse = traverses.find((t) => t.uuid === selectedEvaSequenceItemUuid);
          if (matchedTraverse) {
            panMapToLocation = getMidpoint(matchedTraverse.path);
          } else if (matchedStation) {
            highlightLocation = matchedStation.location;
            panMapToLocation = matchedStation.location;
          }
        } else if (selectedEva) {
          // if eva title is selected, pan to the midpoint of all stations in the eva
          const allStationUuids = selectedEva.sequence
            .filter((seqItem) => seqItem.type === "station")
            .map((seqItem) => seqItem.uuid);
          const allStationLocations = allStations
            .filter((s) => allStationUuids.includes(s.uuid))
            ?.map((s) => s.location);
          panMapToLocation = getMidpoint(allStationLocations);
        }
      } else if (selectedMeasurementUuid) {
        const measurement = measurements.find((m) => m.uuid === selectedMeasurementUuid);
        if (measurement) {
          panMapToLocation = getMidpoint(measurement.path);
        }
      }

      if (highlightLocation) {
        drawSelectedMarker(map, highlightLocation);
      }

      if (panMapToLocation && mapDirective === null) {
        if (isNaN(panMapToLocation.lat) || isNaN(panMapToLocation.lng)) return;
        // only pan if the location is not already in view
        if (!map.current.getBounds().contains(panMapToLocation)) {
          map.current.panTo(panMapToLocation);
        }
      }
    };
    handler();
    // do not include selectedOrRunningRex in deps or else this will trigger a map re-pan whenever rex statuses change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    map,
    selectedPoi?.location,
    selectedStation?.location,
    dispatch,
    sectionSelected,
    mapDirective,
    selectedEvaSequenceItemUuid,
    selectedPosEntryUuid,
    selectedMeasurementUuid,
    measurements,
    selectedEva?.sequence,
    allStations,
    traverses,
  ]);

  /**
   * If hover uuid changes, show a hover highlight on the map
   * This is the hover on item
   */
  useEffect(() => {
    // remove hoverMarker layer and any existing highlight layers
    hoverFeatureGroup.current?.clearLayers();

    if (mapHoverItemUuid) {
      // search for this item on the map to get the lat lng
      let latLngs: L.LatLng[] = [];
      if (mapHoverItemType) {
        if (mapHoverItemType === "poi") {
          poiFeatureGroup.current.eachLayer((layer: AEGISMarker) => {
            if (layer?.uuid === mapHoverItemUuid) {
              latLngs.push(layer.getLatLng());
            }
          });
        } else if (mapHoverItemType === "station") {
          stationFeatureGroup.current.eachLayer((layer: AEGISMarker) => {
            if (layer?.uuid === mapHoverItemUuid) {
              latLngs.push(layer.getLatLng());
            }
          });
        } else if (mapHoverItemType === "posEntry") {
          posEntryFeatureGroup.current.eachLayer((layer: AEGISMarker) => {
            if (layer?.uuid === mapHoverItemUuid) {
              latLngs.push(layer.getLatLng());
            }
          });
        } else if (mapHoverItemType === "traverse") {
          map.current.eachLayer((layer: AEGISPolyline) => {
            if (layer?.uuid === mapHoverItemUuid) {
              latLngs = layer.getLatLngs() as L.LatLng[];
            }
          });
        }
      } else {
        // no map type defined. Search the brute force way
        map.current.eachLayer((layer: AEGISMapDrawingLayer) => {
          if (layer?.uuid === mapHoverItemUuid) {
            if (
              layer.mapItemType === "poi" ||
              layer.mapItemType === "station" ||
              layer.mapItemType === "posEntry"
            ) {
              const markerLayer = layer as AEGISMarker;
              latLngs.push(markerLayer.getLatLng());
            } else if (layer.mapItemType === "traverse") {
              const polylineLayer = layer as AEGISPolyline;
              latLngs = polylineLayer.getLatLngs() as L.LatLng[];
            }
          }
        });
      }

      if (latLngs.length === 1) {
        // highlight markers
        // create markers that are dotted stroke with no fill
        const marker = L.circleMarker(latLngs[0], {
          radius: 25,
          color: "#ffffff",
          stroke: true,
          weight: 1,
          opacity: 1,
          fill: false,
          dashArray: "5, 5",
        }) as AEGISCircleMarker;
        marker.mapItemType = "hover";
        marker.bringToFront();
        hoverFeatureGroup.current.addLayer(marker);
      } else if (latLngs.length > 1) {
        //highlight polylines (aka traverses)
        const polyline = L.polyline(latLngs, {
          color: "#ffffff",
          weight: 4,
          opacity: 1,
          smoothFactor: 1,
        }) as AEGISPolyline;
        polyline.mapItemType = "hover";
        polyline.bringToFront();
        hoverFeatureGroup.current.addLayer(polyline);
      }
    }
  }, [mapHoverItemUuid, mapHoverItemType]);

  return (
    <>
      <div className={styles.mapContainer} ref={mapContainerRef}>
        <PetInterval
          runningRex={selectedRex}
          rexPetTime={rexPetTime}
          setRexPetTime={setRexPetTime}
        />
        <div className={styles.map} ref={mapRef} />

        <div className={styles.mapViewDisplay}>
          <MapViewMenu
            mapDisplayPois={mapDisplayPois}
            setMapDisplayPois={setMapDisplayPois}
            mapDisplayStations={mapDisplayStations}
            setMapDisplayStations={setMapDisplayStations}
            mapDisplayActions={mapDisplayActions}
            setMapDisplayActions={setMapDisplayActions}
            showArrows={showArrows}
            setShowArrows={setShowArrows}
            mapDisplayPos={mapDisplayPos}
            setMapDisplayPos={setMapDisplayPos}
            showScaleBar={showScaleBar}
            setShowScaleBar={setShowScaleBar}
            showMouseLatLon={showMouseLatLon}
            setShowMouseLatLon={setShowMouseLatLon}
            showSunEarth={showSunEarth}
            setShowSunEarth={setShowSunEarth}
          />
        </div>
        {sectionSelected === "evas" && selectedRex && <MapPositionMenu />}
        <div className={styles.mapPresetDisplay}>
          <MapPresetMenu
            selectedPreset={selectedPreset}
            setSelectedPreset={(preset: Preset) => {
              dispatch(setSelectedPresetUuid(preset.uuid));
            }}
            presetsFromDb={presetsFromDb}
          />
        </div>
        <div className={styles.mapScaleDisplay}>{showScaleBar && drawScaleBar()}</div>
        <div className={styles.mapPositionDisplay}>
          {showMouseLatLon && mouseLatLng && latLngDiv(mouseLatLng)}
          {mouseGridCoord && mouseGridCoordDiv(mouseGridCoord)}
          {timeLayerInfo && layerTimeDiv(timeLayerInfo)}
        </div>
        {showSunEarth && <SunEarth type="editor" selectedPreset={selectedPreset} />}
      </div>

      {isLoading && (
        <div>
          <LoadingOverlay message="Please Wait..." />
        </div>
      )}
    </>
  );
};

export default MapBody;
