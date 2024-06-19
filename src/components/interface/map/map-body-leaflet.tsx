import * as L from "leaflet";
L.Icon.Default.imagePath = "/leaflet/images/";
// Import the plugin libraries so they will modify L
import "leaflet.tilelayer.colorfilter";
import "proj4leaflet";
import "leaflet-polylinedecorator";
import DraggableLines from "leaflet-draggable-lines";

import styles from "components/interface/map/map-body.module.css";
import { useAppSelector, shallowEqual, refEqual, deepEqual } from "utils/useAppSelector";
import {
  MutableRefObject,
  useEffect,
  useRef,
  useState,
  useCallback,
  FunctionComponent,
  useLayoutEffect,
} from "react";
import _ from "lodash";
import { updateMapDirective } from "store/map";
import { setSectionSelected } from "store/interface";
import { setSelectedStationUuid } from "store/station";
import { setSelectedPosEntryUuid } from "store/rex";
import { convertLeafletLatLngToAegisPoint, getMidpoint } from "utils/geoMath";
import { decodeEmoji, secondsFromhhmmss, hhmmssFromSeconds, titleCase } from "utils/formatting";
import { clearMapItemHover, setHoverUuidsForSequence, setHoverUuidsForPosEntry } from "store/hover";

import { useAppDispatch } from "utils/useAppDispatch";
import { thunkSelectEVASequenceItem } from "store/thunk/crossThunk";
import { thunkGetStationOrTraverse } from "store/thunk/thunkEva";
import { MapViewMenu } from "./map-menu-view";
import { MapPositionMenu } from "./map-menu-pos";
import PetInterval from "../../page/petInterval";
import { isWindows10 } from "utils/browser";
import { useCookies } from "react-cookie";
import ReactDOMServer from "react-dom/server";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";
import { SunEarth } from "./map-sunearth";
import { point } from "@turf/helpers";
import { circle } from "@turf/turf";
import {
  makeTileLayerColorFilter,
  latLngDiv,
  getMapItemByUuid,
  scaleBarDiv,
  drawOrUpdateMarkerOnMap,
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
} from "components/page/leaflet-helper";
import { thunkMarkerOnClick, thunkPolylineOnClick } from "store/thunk/thunkMap";

const MapBody: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const mapRef = useRef(null);
  const map = useRef<L.Map>(null);
  const crs = useRef<L.Proj.CRS>(null);
  const draggableLines: MutableRefObject<DraggableLines> = useRef(null);
  const stationFeatureGroup = useRef<L.FeatureGroup>(null);
  const poiFeatureGroup = useRef<L.FeatureGroup>(null);
  const actionFeatureGroup = useRef<L.FeatureGroup>(null);
  const gridLabelFeatureGroup = useRef<L.FeatureGroup>(null);
  const posEntryFeatureGroup = useRef<L.FeatureGroup>(null);
  const hoverFeatureGroup = useRef<L.FeatureGroup>(null);
  const hoverAstronautFeatureGroup = useRef<L.FeatureGroup>(null);

  const mission: MissionSelectProperties = useAppSelector(
    (state) =>
      _.pick(state.mission.mission, [
        "id",
        "landerLocation",
        "initialZoom",
        "planetRadius",
        "projBoundsMaxX",
        "projBoundsMaxY",
        "projBoundsMinX",
        "projBoundsMinY",
        "projEpsg",
        "projProj4String",
        "projResZoomLevel",
        "projResUnitsPerPixel",
        "projIsCustom",
        "projOriginX",
        "projOriginY",
        "landerRadii",
      ]),
    deepEqual
  );
  const missionLayers = useAppSelector((state) => state.mission.layers, deepEqual);
  const missionSublayers = useAppSelector((state) => state.mission.sublayers, deepEqual);
  const sectionSelected = useAppSelector((state) => state.interface.sectionSelectedLabel, refEqual);
  const mapDirective = useAppSelector((state) => state.map.mapDirective, shallowEqual);
  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const selectedPreset = useAppSelector(
    (state) => state.preset.presets.find((p) => p.uuid === selectedPresetUuid),
    deepEqual
  );

  const pois = useAppSelector((state) => state.poi.pois, deepEqual);
  const stations = useAppSelector((state) => state.station.stations, deepEqual);
  const actions = useAppSelector((state) => state.action.actions, deepEqual);
  const selectedPoi = useAppSelector(
    (state) => state.poi.pois.find((poi) => poi.uuid === state.poi.selectedPoiUuid),
    deepEqual
  );
  const selectedStation = useAppSelector(
    (state) =>
      state.station.stations.find((station) => station.uuid === state.station.selectedStationUuid),
    deepEqual
  );
  const selectedEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid),
    deepEqual
  );
  const selectedOrRunningRex = useAppSelector((state) => {
    //if a rex is running, show that one. If not, just show whatever rex is selected
    const runningRexFromDb = state.rex.rexesFromDb.find((r) => r.isRunning);
    if (runningRexFromDb) {
      return runningRexFromDb;
    } else {
      return state.rex.rexes.find((r) => r.uuid === state.rex.selectedRexUuid);
    }
  }, deepEqual);
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const hover = useAppSelector((state) => state.hover, shallowEqual); //astronaut hover timeline

  const selectedPosEntryUuid = useAppSelector((state) => state.rex.selectedPosEntryUuid, refEqual);
  const traverses = useAppSelector((state) => state.traverse.traverses, deepEqual);
  const measurements = useAppSelector((state) => state.measure.measurements, deepEqual);
  const selectedMeasurementUuid = useAppSelector(
    (state) => state.measure.selectedMeasurementUuid,
    refEqual
  );

  const mapHoverItemUuid = useAppSelector((state) => state.hover.mapItemUuid, refEqual);
  const mapHoverItemType = useAppSelector((state) => state.hover.mapItemType, refEqual);

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
  });
  const [mapDisplayActions, setMapDisplayActions] = useState<MapDisplayMarkers>({
    show: true,
    showLabels: false,
  });
  const [mapDisplayPositions, setMapDisplayPositions] = useState<MapDisplayPos>({
    show: true,
    showAllLabels: false,
    showLatestLabels: true,
    showPaths: true,
    showOldPaths: true,
    fadeOldPaths: true,
    showMarkers: true,
    showOldMarkers: false,
    fadeOldMarkers: false,
  });
  const [showArrows, setShowArrows] = useState(true);
  const [showGridLabels, setShowGridLabels] = useState(true);
  const [showScaleBar, setShowScaleBar] = useState(true);
  const [showMouseLatLon, setShowMouseLatLon] = useState(true);
  const [showSunEarth, setShowSunEarth] = useState(false);

  const [eyeballMenuCookie, setEyeballMenuCookie] = useCookies(["AEGIS_Map_View_Settings"]);
  /*** end Eyeball menu toggles */

  const [mousePosition, setMousePosition] = useState<AEGISPoint>(null);
  const [mapZoom, setMapZoom] = useState<number>(0); // Used to trigger re-draw of scale. Value doens't matter
  const [gridLabels, setGridLabels] = useState<GridLabelItem[]>([]);
  const [mapBounds, setMapBounds] = useState<string>(null); // Used to trigger re-draw of grid labels. Value doens't matter
  const [rexPetTime, setRexPetTime] = useState(""); // used to update the PET value via the PetInterval component

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
    if (eyeballMenuSettings.mapDisplayPositions) {
      setMapDisplayPositions(eyeballMenuSettings.mapDisplayPositions);
    }
    setShowArrows(eyeballMenuSettings.showArrows);
    setShowGridLabels(eyeballMenuSettings.showGridLabels);

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
        mapDisplayPositions,
        showArrows,
        showGridLabels,
      }),
      { path: "/" }
    );
  }, [
    setEyeballMenuCookie,
    mapDisplayPois,
    mapDisplayStations,
    mapDisplayActions,
    mapDisplayPositions,
    showArrows,
    showGridLabels,
  ]);

  /**
   * Map instantiation
   */
  useLayoutEffect(() => {
    if (!mapRef.current || !map || !mission) return;

    const isWin10Async = async () => {
      const isWin10 = await isWindows10();
      setIsWin10(isWin10);
    };
    isWin10Async();

    // instantiate the prog4leaflet crs using the values in the mission config
    if (mission.projIsCustom === true) {
      const baseRes = mission.projResUnitsPerPixel * Math.pow(2, mission.projResZoomLevel);

      const resolutions = [];
      for (let i = 0; i < 32; i++) {
        resolutions.push(baseRes / Math.pow(2, i));
      }

      crs.current = new L.Proj.CRS(mission.projEpsg, mission.projProj4String, {
        origin: [mission.projOriginX, mission.projOriginY],
        resolutions,
        bounds: L.bounds(
          [mission.projBoundsMinX, mission.projBoundsMinY],
          [mission.projBoundsMaxX, mission.projBoundsMaxY]
        ),
      });
    }

    // Instantiate the map
    if (!map.current) {
      const center = [mission.landerLocation.lat, mission.landerLocation.lng] as L.LatLngExpression;
      const zoom = mission.initialZoom || 13;

      map.current = L.map(mapRef.current, {
        center: center,
        zoom: zoom,
        fadeAnimation: true,
      });
    }

    if (crs.current) {
      map.current.options.crs = crs.current;
    }
    if (!draggableLines.current) {
      draggableLines.current = new DraggableLines(map.current, { allowExtendingLine: false });
    }
    if (!stationFeatureGroup.current) {
      stationFeatureGroup.current = L.featureGroup().addTo(map.current);
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
  }, [mapRef, map, draggableLines, mission]);

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
    return scaleBarDiv(map, mission.planetRadius, styles.scaleValue);

    // Include mapZoom but we arn't using it. Just need a way to re-trigger this effect when mapZoom changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, mission.planetRadius, mapZoom]);

  /**
   * Update which grid labels are visible based on map zoom level
   */
  useEffect(() => {
    drawGridLabels({
      map,
      gridLabelFeatureGroup,
      gridLabels,
      showGridLabels,
      planetRadius: mission.planetRadius,
    });
    // include map bounds in the depdencey array so the grid labels will re-draw when map moves
  }, [gridLabels, mission.planetRadius, showGridLabels, mapBounds]);

  /**
   * Map layers display management
   */
  useEffect(() => {
    if (!mission.id || !map.current || !selectedPreset || !missionLayers) return;

    const layersToAddInOrder = getLayersToAddInOrder({
      selectedPreset,
      missionSublayers,
      missionLayers,
    });

    // no new layers are newly visible/hidden or reordered. do nothing
    if (_.isEqual(layersToAddInOrder, layersOnMap)) {
      return;
    } else {
      setLayersOnMap(layersToAddInOrder);
    }

    drawLayersOnMap({
      map,
      mapSublayerControls: selectedPreset.mapSublayerControls,
      layersToAddInOrder,
      missionId: mission.id,
      setGridLabels,
    });
  }, [mission?.id, map, layersOnMap, missionLayers, missionSublayers, selectedPreset]);

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
            tileLayer.updateFilter(
              makeTileLayerColorFilter(
                selectedPreset.mapSublayerControls,
                sublayerControl.sublayerUuid
              )
            );
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

    map.current.on("click", (e) => {
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
        saveUpdatedItemPosition({
          dispatch,
          uuid: mapDirective.uuid,
          mapItemType: mapDirective.mapItemType,
          location: convertLeafletLatLngToAegisPoint(e.latlng),
        });

        // reset the map directive
        dispatch(updateMapDirective(null));
        // set the mouse cursor back to the default
        map.current.getContainer().style.cursor = "grab";
      }
    });

    map.current.on("mousemove", (e) => {
      setMousePosition({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    map.current.on("zoomend", () => {
      setMapBounds(map.current.getBounds().toBBoxString()); // trigger to redraw grid labels
      setMeasureStartingCoords(map, dispatch);
      setMapZoom(map.current.getZoom()); // triger to redraw scale bar
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
  }, [map, mapDirective, dispatch, gridLabels, showGridLabels, mission]);

  /**
   * Listen for mapDirective for stations, pois, actions, traverses, and measurements, and trigger map draw/edit modes appropriately
   */
  useEffect(() => {
    if (!map.current || !draggableLines || !mapDirective) return;

    handleMapDirective({ map, mapDirective, draggableLines, dispatch });
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
  }, [map, draggableLines, mapDirective, dispatch]);

  /**
   * Determine stations to show and draw them on map when stations or selections change
   */
  useEffect(() => {
    if (!stations || !map.current || mapDirective) return;

    let stationsToShow: Station[] = [];
    if (mapDisplayStations.show) {
      stationsToShow = stations;
    } else {
      if (selectedEva) {
        const stationSequenceItems = selectedEva.sequence.filter((item) => item.type === "station");
        const stationsInEva = stations.filter((station) =>
          stationSequenceItems.find((item) => item.uuid === station.uuid)
        );
        stationsToShow = stationsInEva;
      } else if (selectedStation && (sectionSelected === "station" || sectionSelected === "evas")) {
        stationsToShow = [selectedStation];
      }
    }

    // remove all stations from the map
    stationFeatureGroup.current.clearLayers();

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
      }
    });

    stationFeatureGroup.current.setZIndex(999);
  }, [
    stations,
    selectedStation,
    selectedEva,
    mapDisplayStations,
    sectionSelected,
    mapDirective,
    dispatch,
    isWin10,
  ]);

  /**
   * Determine actions to show and draw them on map when actions or selections change
   */
  useEffect(() => {
    if (!actions || !map.current || mapDirective) return;

    let actionsToShow: Action[] = [];
    if (mapDisplayActions.show) {
      if (
        (sectionSelected === "station" ||
          sectionSelected === "evas" ||
          sectionSelected === "rex") &&
        selectedStation
      ) {
        const actionsInStation = actions.filter(
          (action) => action.stationUuid === selectedStation.uuid && action.enabled
        );
        actionsToShow = actionsInStation;
      } else if (sectionSelected === "poi" && selectedPoi) {
        const actionsInPoi = actions.filter(
          (action) => action.poiUuid === selectedPoi.uuid && action.enabled
        );
        actionsToShow = actionsInPoi;
      }
    }

    // delete all actions in leaflet
    actionFeatureGroup.current.clearLayers();

    // draw or update all actions
    actionsToShow.forEach((action) => {
      if (action.location) {
        drawOrUpdateMarkerOnMap({
          map,
          featureGroup: actionFeatureGroup,
          name: `${titleCase(action.type)}: ${action.name}`,
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
    actions,
    selectedStation,
    selectedPoi,
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
    } else {
      if (selectedPoi && sectionSelected === "poi") {
        poisToShow = [selectedPoi];
      }
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
  }, [pois, selectedPoi, mapDisplayPois, sectionSelected, mapDirective, isWin10, dispatch]);

  /**
   * Determine traverses to show and draw them on map when traverses or selections change
   */
  useEffect(() => {
    if (!traverses || !map.current || mapDirective) return;

    let traversesToShow: Traverse[] = [];
    if (selectedEvaSequenceItemUuid) {
      const traverse = traverses.find((traverse) => traverse.uuid === selectedEvaSequenceItemUuid);
      if (traverse) {
        traversesToShow = [traverse];
      }
    }
    if (selectedEva) {
      const traverseSequenceItems = selectedEva.sequence.filter((item) => item.type === "traverse");
      const traversesInEva = traverses.filter((traverse) =>
        traverseSequenceItems.find((item) => item.uuid === traverse.uuid)
      );
      traversesToShow = traversesInEva;
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
          outlineWeight: selectedEvaSequenceItemUuid === traverse.uuid ? 8 : 0,
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
  }, [traverses, selectedEvaSequenceItemUuid, selectedEva, mapDirective, dispatch, showArrows]);

  /**
   * Determine measures to show and draw them on map when measures or selections change
   */
  useEffect(() => {
    if (!map.current || mapDirective || !measurements || selectedMeasurementUuid === null) return;

    // delete all measurements from the map
    map.current.eachLayer((layer: AEGISMapDrawingLayer) => {
      if (layer.mapItemType === "measurement") {
        map.current.removeLayer(layer);
      }
    });

    // draw all measurements
    const measurementsToShow = [measurements.find((m) => m.uuid === selectedMeasurementUuid)];
    measurementsToShow.forEach((measurement) => {
      if (measurement.path.length > 1) {
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
   * Draw lander radii
   */
  useEffect(() => {
    if (
      !map ||
      !mission?.landerLocation ||
      !mission?.landerRadii ||
      !selectedPreset?.mapCircleControls ||
      !mission?.planetRadius
    )
      return;

    const landerRadii = mission.landerRadii;
    const landerLocation = mission.landerLocation;

    map.current.eachLayer((layer: AEGISGeoJSONCircle) => {
      if (layer.mapItemType === "Lander Radius") {
        layer.remove();
      }
    });

    landerRadii.forEach((landerRadius) => {
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
      const earthRadiusInMeters = 6378137;
      const radiusAdjustment = earthRadiusInMeters / mission.planetRadius;

      const drawDistance = (landerRadius.radius * radiusAdjustment) / 1000;

      if (selectedPreset.mapCircleControls[landerRadius.uuid]?.visible) {
        if (selectedPreset.mapCircleControls[landerRadius.uuid]?.visible) {
          // Turf Coords are in (lng, lat) format
          const geoJSONCircle: AEGISGeoJSONCircle = L.geoJSON(
            circle(point([landerLocation.lng, landerLocation.lat]), drawDistance, {
              steps: 256,
            }),
            {
              style: {
                ...selectedPreset.mapCircleControls[landerRadius.uuid]?.style,
                interactive: false,
              },
            }
          ) as AEGISGeoJSONCircle;

          geoJSONCircle.mapItemType = "Lander Radius";

          map.current.addLayer(geoJSONCircle);
        }
      }
    });
  }, [
    mission?.landerLocation,
    mission?.landerRadii,
    mission?.planetRadius,
    map,
    selectedPreset?.mapCircleControls,
  ]);

  /**
   * Draw or update lander
   */
  useEffect(() => {
    if (!map.current || mapDirective || !mission.landerLocation) return;

    drawOrUpdateMarkerOnMap({
      map,
      name: "Lander",
      uuid: "lander",
      iconEmoji: "1f680", //rocket
      mapItemType: "lander",
      location: mission.landerLocation,
      isWin10,
      onClick: () => {
        dispatch(setSectionSelected("mission"));
        dispatch(thunkSetRightPanelIsOpenIfAuto(true));
      },
      onDragEnd: (marker: AEGISMarker) => {
        const newLocation = convertLeafletLatLngToAegisPoint(marker.getLatLng());
        saveUpdatedItemPosition({
          dispatch,
          uuid: "lander",
          mapItemType: "lander",
          location: newLocation,
        });
        dispatch(updateMapDirective(null));
      },
      tooltipOptions: {
        permanent: false,
        offset: new L.Point(0, -10),
      },
      iconClassName: styles.mapIcon,
      iconWin10ClassName: styles.mapIconWin10,
      iconWrapperClassName: styles.iconWrapper,
    });
  }, [map, mapDirective, mission.landerLocation, isWin10, dispatch]);

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

    if (sectionSelected !== "station" && sectionSelected !== "evas" && sectionSelected !== "rex")
      return;

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
    if (mapDisplayPositions.show) {
      //if there is a running rex, or no running rex but we're on the rex section and there's a rex selected
      if (selectedOrRunningRex?.isRunning || (sectionSelected === "rex" && selectedOrRunningRex)) {
        const posEntriesWithLocations = selectedOrRunningRex?.posEntries?.filter(
          (posEntry) => posEntry.location
        );
        posEntriesToShow = _.orderBy(posEntriesWithLocations, ["createdAt"], "desc");
        posTypeLatestEntries = getLatestPosEntryByType({
          allPosEntries: posEntriesWithLocations,
        });
      }
    }

    // delete all pos entries in leaflet
    posEntryFeatureGroup.current.clearLayers();

    if (!selectedOrRunningRex) return;

    // draw or update all pos markers
    for (const posEntry of posEntriesToShow) {
      if (!mapDisplayPositions.showMarkers) break; //exit for, no markers need to be drawn
      if (!posEntry.location) continue; // go to next pos entry

      // determine if this is one of the latest entries. If so, determine which latest pos types exist in this entry
      const customPosTypesUuids: string[] = [];
      let isRecent = false;
      posEntry.posTypeUuids.forEach((posTypeUuid) => {
        if (posTypeLatestEntries[posTypeUuid][0]?.uuid === posEntry.uuid) {
          isRecent = true;
          customPosTypesUuids.push(posTypeUuid);
        }
      });

      // determine if this position entry should be drawn
      if (!mapDisplayPositions.showOldMarkers) {
        if (!isRecent) continue; //this is an old pos entry, go to next entry
      }
      // all pos entries are being drawn. determine if this entry should be faded
      let opacity: number = 1;
      if (mapDisplayPositions.fadeOldMarkers) {
        let lastEntry = false;
        // check if this is the latest (most recent) entry for a pos type
        for (const posTypeUuid in posTypeLatestEntries) {
          if (posTypeLatestEntries[posTypeUuid][0].uuid === posEntry.uuid) {
            lastEntry = true;
            break;
          }
        }
        if (!lastEntry) opacity = 0.4;
      }

      // determine if label should be shown
      let keepTooltipOpen = mapDisplayPositions.showAllLabels;
      if (mapDisplayPositions.showLatestLabels) {
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
        selectedOrRunningRex,
        isWin10,
        showOldMarkers: mapDisplayPositions.showOldMarkers,
        showLatestLabels: mapDisplayPositions.showLatestLabels,
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
    if (mapDisplayPositions.showPaths) {
      //hide old paths
      if (!mapDisplayPositions.showOldPaths) {
        for (const posType of selectedOrRunningRex.posTypes) {
          if (!posTypeLatestEntries[posType.uuid] || posTypeLatestEntries[posType.uuid].length <= 1)
            continue;
          //loop over posTypes and get their latest entries
          drawPosPathOnMap({
            posEntryFeatureGroup,
            coords: _.reverse(
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
        const posTypes = selectedOrRunningRex.posTypes;
        posTypes?.forEach((posType) => {
          const posEntriesForType = posEntriesToShow.filter((posEntry) =>
            posEntry.posTypeUuids.includes(posType.uuid)
          );

          if (posEntriesForType.length > 1) {
            // determine if should fade old paths
            if (mapDisplayPositions.fadeOldPaths) {
              // fade old paths
              drawPosPathOnMap({
                posEntryFeatureGroup,
                coords: _.reverse(
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
                coords: _.reverse(
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
                coords: _.reverse(
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
  }, [
    map,
    dispatch,
    mapDisplayPositions,
    selectedOrRunningRex,
    sectionSelected,
    isWin10,
    rexPetTime,
  ]);

  /**
   * Update position entry tooltips when rex is ticking
   */
  useEffect(() => {
    if (!map.current || !posEntriesShowing || posEntriesShowing.length === 0) return;
    const rexPetSeconds = secondsFromhhmmss(rexPetTime);

    // turn on latest label only
    if (mapDisplayPositions.showLatestLabels) {
      // get a unique array of the latest pos entries. Multiple types may share the same entry
      const uniqueLatestPosEntries = _.uniqBy(
        Object.values(latestPosEntriesByType).map((posEntries) => {
          return posEntries[0];
        }),
        "uuid"
      );
      for (const latestPosEntry of _.orderBy(uniqueLatestPosEntries, ["createdAt", "asc"])) {
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
            const posTypeAbbr = selectedOrRunningRex?.posTypes?.find(
              (posTypeFromRex) => posTypeFromRex.uuid === posTypeUuidFromEntry
            )?.abbr;
            markerPosTypeAbbrs.push(posTypeAbbr);
          }
        }

        // set the marker tooltip
        const timeToShow = hhmmssFromSeconds(rexPetSeconds - latestPosEntry.seconds);
        const newLabel = `${timeToShow} / ${markerPosTypeAbbrs}`;
        posMarker.setTooltipContent(newLabel);
      }
    } else {
      // update all timers on all tooltips
      for (let i = 0; i < posEntriesShowing.length; i++) {
        //build label
        const timeToShow = hhmmssFromSeconds(rexPetSeconds - posEntriesShowing[i].seconds);
        const markerPosTypeAbbrs = posEntriesShowing[i].posTypeUuids.map((posTypeUuid) => {
          const posType = selectedOrRunningRex?.posTypes?.find(
            (posType) => posType.uuid === posTypeUuid
          );
          return posType?.abbr;
        });
        const newLabel = `${timeToShow} / ${markerPosTypeAbbrs}`;

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
    mapDisplayPositions.showLatestLabels,
    selectedOrRunningRex?.posTypes,
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
        const seqItemRes = await dispatch(thunkGetStationOrTraverse({ uuid: sequenceItem.uuid }));
        if (!seqItemRes.payload) return location;

        if (seqItemRes.payload.type === "station") {
          location = (seqItemRes.payload.item as Station).location;
        } else if (seqItemRes.payload.type === "traverse") {
          const traverse = seqItemRes.payload.item as Traverse;

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
              // This helps us around the south pole where we can't really use bearing to deterine our path to the next point.
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
            {decodeEmoji("1f468-200d-1f680")}
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
  }, [hover, selectedEva, dispatch, mission.planetRadius, isWin10]);

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
              {decodeEmoji("274c")}
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
        // This helps us around the south pole where we can't really use bearing to deterine our path to the next point.
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
      } else if (sectionSelected === "evas" && selectedEvaSequenceItemUuid) {
        const seqItemRes = await dispatch(
          thunkGetStationOrTraverse({ uuid: selectedEvaSequenceItemUuid })
        );
        if (seqItemRes.payload) {
          const seqItem = seqItemRes.payload;
          if (seqItem.type === "traverse") {
            panMapToLocation = getMidpoint((seqItem.item as Traverse).path);
          } else if (seqItem.type === "station") {
            const selectedStation = seqItem.item as Station;
            highlightLocation = selectedStation.location;
            panMapToLocation = selectedStation.location;
          }
        }
      } else if (sectionSelected === "rex") {
        // highlight pos
        if (selectedPosEntryUuid && selectedOrRunningRex?.posEntries) {
          const posLocation = selectedOrRunningRex.posEntries.find(
            (c) => c.uuid === selectedPosEntryUuid
          )?.location;
          highlightLocation = posLocation;
          panMapToLocation = posLocation;
        }
        if (selectedEvaSequenceItemUuid) {
          const seqItemRes = await dispatch(
            thunkGetStationOrTraverse({ uuid: selectedEvaSequenceItemUuid })
          );
          if (seqItemRes.payload && seqItemRes.payload.type === "station") {
            const selectedStation = seqItemRes.payload.item as Station;
            highlightLocation = selectedStation.location;
          }
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
        if (!map.current.getBounds().contains(panMapToLocation)) {
          map.current.panTo(panMapToLocation);
        }
      }
    };
    handler();
    // do not include selectedOrRunningRex in deps or else this will trigger a map repan whenever rex statuses change
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
    <div className={styles.mapContainer} ref={mapContainerRef}>
      <PetInterval
        runningRex={selectedOrRunningRex}
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
          mapDisplayPosMarkers={mapDisplayPositions}
          setMapDisplayPosMarkers={setMapDisplayPositions}
          showGridLabels={showGridLabels}
          setShowGridLabels={setShowGridLabels}
          showScaleBar={showScaleBar}
          setShowScaleBar={setShowScaleBar}
          showMouseLatLon={showMouseLatLon}
          setShowMouseLatLon={setShowMouseLatLon}
          showSunEarth={showSunEarth}
          setShowSunEarth={setShowSunEarth}
        />
      </div>
      {selectedOrRunningRex && <MapPositionMenu />}
      <div className={styles.mapScaleDisplay}>{showScaleBar && drawScaleBar()}</div>
      <div className={styles.mapPositionDisplay}>
        {showMouseLatLon && mousePosition && latLngDiv(mousePosition)}
      </div>
      {showSunEarth && <SunEarth type="editor" />}
    </div>
  );
};

export default MapBody;
