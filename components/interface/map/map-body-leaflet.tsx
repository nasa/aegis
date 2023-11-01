import * as L from "leaflet";
L.Icon.Default.imagePath = "/leaflet/images/";
// Import the plugin libraries so they will modify L
import { HighlightablePolyline } from "leaflet-highlightable-layers";
import DraggableLines from "leaflet-draggable-lines";
import { antPath } from "leaflet-ant-path";
import "leaflet-textpath";
import "leaflet.tilelayer.colorfilter";
import "proj4leaflet";
import "leaflet-polylineoffset";
import * as geojson from "geojson";

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
import { setMapSublayerControls, updateMapDirective } from "store/map";
import { setSelectedPoiUuid } from "store/poi";
import { setRightPanelOpen, setSectionSelected } from "store/interface";
import { revertWalkbackPath, setSelectedStationUuid } from "store/station";
import { revertTraversePath } from "store/traverse";
import { setSelectedCrewPosUuid } from "store/rex";
import {
  convertLeafletLatLngsToAegisPoints,
  convertLeafletLatLngToAegisPoint,
  getBoundsFromMapViewport,
  getDistanceBetweenTwoCoordinates,
  getMidpoint,
} from "utils/geoMath";
import { decodeEmoji, secondsFromhhmmss, hhmmssFromSeconds, titleCase } from "utils/formatting";
import { clearMapItemHover, setHoverUuidsForSequence, setHoverUuidsForCrewPos } from "store/hover";

import {
  thunkUpdateStationLocation,
  thunkFullUpdateWalkback,
  thunkUpdateWalkbackPath,
} from "store/thunk/thunkStation";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkFullUpdateTraverse, thunkUpdateTraversePath } from "store/thunk/thunkTraverse";
import { getPercentOrDefault } from "utils/formatting";
import { thunkUpdatePoiLocation } from "store/thunk/thunkPoi";
import { selectEVASequenceItem } from "store/cross-slice";
import { thunkGetStationOrTraverse } from "store/thunk/thunkEva";
import { thunkUpdateLanderLocation } from "store/thunk/thunkMission";
import { thunkUpdateActionLocation } from "store/thunk/thunkAction";
import { MapViewMenu } from "./map-menu-view";
import { MapCrewPositionMenu } from "./map-menu-crewPos";
import { thunkUpdateCrewPosLocation } from "store/thunk/thunkRex";
import PetInterval from "../page/petInterval";
import ReactDOMServer from "react-dom/server";

type MissionSelectProperties = Pick<
  Mission,
  | "id"
  | "landerLocation"
  | "initialZoom"
  | "planetRadius"
  | "projBoundsMaxX"
  | "projBoundsMaxY"
  | "projBoundsMinX"
  | "projBoundsMinY"
  | "projEpsg"
  | "projProj4String"
  | "projResZoomLevel"
  | "projResUnitsPerPixel"
  | "projIsCustom"
  | "projOriginX"
  | "projOriginY"
  | "landerRadii"
>;

type GridLabelItem = {
  id: string;
  latLng: L.LatLngExpression;
};

// const center = [51.505, -0.09] as L.LatLngExpression; // London
const center = [64.833445, -16.378351] as L.LatLngExpression; // Iceland
const zoom = 13;

const layerBaseURL = "/static/missionFiles";

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
  const crewPosFeatureGroup = useRef<L.FeatureGroup>(null);

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
  const missionLayers = useAppSelector((state) => state.mission.layers, shallowEqual);
  const missionSublayers = useAppSelector((state) => state.mission.sublayers, shallowEqual);
  const rightPanelOpen = useAppSelector((state) => state.interface.rightPanelOpen, shallowEqual);
  const sectionSelected = useAppSelector((state) => state.interface.sectionSelectedLabel, refEqual);

  const mapSublayerControls = useAppSelector(
    (state) => state.map.mapSublayerControls,
    shallowEqual
  );
  const mapDirective = useAppSelector((state) => state.map.mapDirective, shallowEqual);

  const presets = useAppSelector((state) => state.preset.presets, shallowEqual);
  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const selectedPreset = useAppSelector(
    (state) => state.preset.presets.find((p) => p.uuid === selectedPresetUuid),
    shallowEqual
  );

  const pois = useAppSelector((state) => state.poi.pois, shallowEqual);
  const stations = useAppSelector((state) => state.station.stations, shallowEqual);
  const actions = useAppSelector((state) => state.action.actions, shallowEqual);
  const selectedPoi = useAppSelector(
    (state) => state.poi.pois.find((poi) => poi.uuid === state.poi.selectedPoiUuid),
    refEqual
  );
  const selectedStation = useAppSelector(
    (state) =>
      state.station.stations.find((station) => station.uuid === state.station.selectedStationUuid),
    refEqual
  );
  const selectedEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid),
    refEqual
  );
  const selectedOrRunningRex = useAppSelector((state) => {
    //if a rex is running, show that one. If not, just show whatever rex is selected
    const runningRexFromDb = state.rex.rexesFromDb.find((r) => r.rexRunning);
    if (runningRexFromDb) {
      return runningRexFromDb;
    } else {
      return state.rex.rexes.find((r) => r.uuid === state.rex.selectedRexUuid);
    }
  }, shallowEqual);
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const hover = useAppSelector((state) => state.hover, shallowEqual); //astronaut hover timeline

  const selectedCrewPosUuid = useAppSelector((state) => state.rex.selectedCrewPosUuid, refEqual);
  const traverses = useAppSelector((state) => state.traverse.traverses, shallowEqual);

  const mapHoverItemUuid = useAppSelector((state) => state.hover.mapItemUuid, refEqual);

  const [layersOnMap, setLayersOnMap] = useState([]);
  const [showSelectedItemOnMap, setShowSelectedItemOnMap] = useState(true); //click selected items

  const [poisToShow, setPoisToShow] = useState<POI[]>([]);
  const [stationsToShow, setStationsToShow] = useState<Station[]>([]);
  const [traversesToShow, setTraversesToShow] = useState<Traverse[]>([]);
  const [actionsToShow, setActionsToShow] = useState<Action[]>([]);
  const [crewPosToShow, setCrewPosToShow] = useState<CrewPos[]>([]);
  const [mapDisplayPois, setMapDisplayPois] = useState<MapMarkersDisplay>({
    show: true,
    showLabels: false,
  });
  const [mapDisplayStations, setMapDisplayStations] = useState<MapMarkersDisplay>({
    show: true,
    showLabels: false,
  });
  const [mapDisplayActions, setMapDisplayActions] = useState<MapMarkersDisplay>({
    show: true,
    showLabels: false,
  });
  const [mapDisplayCrewPos, setMapDisplayCrewPos] = useState<MapCrewPosDisplay>({
    show: true,
    showPaths: true,
    showAllLabels: false,
    showLatestLabels: true,
    fadeOldPositions: false,
  });

  const [mapPosition, setMapPosition] = useState<string[]>([]);

  const [scale, setScale] = useState(0);
  const [mapZoom, setMapZoom] = useState(null); // value used to show correct scale bar
  const [mapBounds, setMapBounds] = useState<L.LatLngBoundsLiteral>(null);
  const [gridLabels, setGridLabels] = useState<GridLabelItem[]>([]);
  const [showArrows, setShowArrows] = useState(false);

  // make color filter settings for tile sublayer. This is the format of leaflet.tilelayer.colorfilter package
  const makeTileLayerColorFilter = (
    lControls: MapSublayerControls,
    sublayerUuid: string
  ): string[] => {
    return [
      `brightness:${getPercentOrDefault(lControls[sublayerUuid].style?.brightness)}%`,
      `contrast:${getPercentOrDefault(lControls[sublayerUuid].style?.contrast)}%`,
      `opacity:${getPercentOrDefault(lControls[sublayerUuid].style?.opacity)}%`,
      `saturate:${getPercentOrDefault(lControls[sublayerUuid].style?.saturation)}%`,
    ];
  };

  /**
   * If the window layout changes, resize the map
   */
  useLayoutEffect(() => {
    if (map.current) {
      // all this to keep the map in the same position when the right window closes or opens
      const prevCenterPixels = map.current.project(map.current.getCenter(), map.current.getZoom());
      const currentWidth = map.current.getSize().x;

      map.current.invalidateSize();

      const newWidth = map.current.getSize().x;
      const newCenterPixels = prevCenterPixels.add([(newWidth - currentWidth) / 2, 0]);
      const newCenter = map.current.unproject(newCenterPixels, map.current.getZoom());
      map.current.setView(newCenter, map.current.getZoom(), { animate: true });
    }
  }, [rightPanelOpen]);

  /**
   * Map layers display management
   */
  useEffect(() => {
    if (!mission.id || !mapSublayerControls || !map.current || !selectedPreset || !missionLayers)
      return;

    // go through all layers in mission config,  add make a list of the ones that are visible
    const layersToAdd: Sublayer[] = [];

    //build layer list
    //loop through layers in the preset in order
    if (selectedPreset.layerOrder) {
      for (const headerLayer of selectedPreset.layerOrder) {
        //loop through the sublayer uuids
        for (const sublayerUuid of headerLayer.sublayerUuids) {
          //check if sublayer is toggled visible in the preset
          if (selectedPreset.mapSublayerControls[sublayerUuid].visible) {
            //this layer is visible - get the sublayer object from misson
            const sublayer = missionSublayers.find((sublayer) => sublayer.uuid === sublayerUuid);
            layersToAdd.push(sublayer); //add sublayer
          }
        }
      }
    } else {
      //preset does not have ordering, sort by name
      for (const layer of _.sortBy(missionLayers, ["name"])) {
        for (const sublayer of _.sortBy(
          missionSublayers.filter((s) => s.layerUuid === layer.uuid),
          ["name"]
        )) {
          if (mapSublayerControls[sublayer.uuid].visible) {
            layersToAdd.push(sublayer);
          }
        }
      }
    }

    // reverse the array to add the ones at the bottom of the tree first
    const layersToAddInOrder = layersToAdd.reverse();

    // no new layers are newly visible/hidden or reordered. do nothing
    if (_.isEqual(layersToAddInOrder, layersOnMap)) {
      return;
    } else {
      setLayersOnMap(layersToAddInOrder);
    }

    // remove map layers that are not visible in layerControls
    map.current.eachLayer((layer) => {
      const uuid = (layer as L.TileLayer).options.uuid || (layer as L.FeatureGroup).uuid;
      const sublayerControls = mapSublayerControls[uuid];
      if (sublayerControls && !sublayerControls.visible) {
        map.current.removeLayer(layer);

        // remove grid labels if grid layer is removed
        //TODO: this is a hacky way to check if it's a grid layer
        if (sublayerControls.name.includes("Grid")) {
          setGridLabels([]);
        }
      }
    });

    // check map layers in order
    layersToAddInOrder.map((sublayer, index) => {
      if (sublayer.type === "tile") {
        // if layer isn't already on the map, add it
        const filter = makeTileLayerColorFilter(mapSublayerControls, sublayer.uuid);
        if (!isLayerOnMapByName(map, sublayer.name)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tileLayer = (L.tileLayer as any).colorFilter(
            `${layerBaseURL}/${mission.id}/Layers/${sublayer.url}`,
            {
              //manually add id and type fields for tracking later on
              id: sublayer.name,
              uuid: sublayer.uuid,
              type: "tile",

              tileSize: 256,
              bounds: [
                [sublayer.boundingBox[1], sublayer.boundingBox[0]],
                [sublayer.boundingBox[3], sublayer.boundingBox[2]],
              ],
              tms: sublayer.tileFormat === "tms",
              minZoom: sublayer.minNativeZoom || 1,
              minNativeZoom: sublayer.minNativeZoom,
              maxZoom: sublayer.maxZoom,
              maxNativeZoom: sublayer.maxNativeZoom,
              opacity: mapSublayerControls[sublayer.uuid].style?.opacity,
              zIndex: index,
              filter,
              // custom class name that we use to control mix-blend-mode
              className: `leaflet-layer leaflet-blend-${mapSublayerControls[sublayer.uuid].style
                ?.blendMode}`,
            }
          );

          map.current.addLayer(tileLayer);
          tileLayer.bringToFront();
        } else {
          // if layer is already on the map, bring it to the front. This has the effect of controlling zorder of layers
          const layer: L.TileLayer = getLayerByName(map, sublayer.name);
          // set all the options for the layer that are in the mapSublayerControls
          layer.setOpacity(mapSublayerControls[sublayer.uuid].style?.opacity);
          layer.updateFilter(filter);

          layer.bringToFront();
        }
      } else if (sublayer.type === "vector") {
        // if layer isn't already on the map, add it
        if (!isLayerOnMapByName(map, sublayer.name)) {
          // fetch geojson object from url
          (async () => {
            const res = await fetch(`${layerBaseURL}/${mission.id}/Data/${sublayer.filePath}`, {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
              },
            });
            const geojson = await res.json();

            // create a featureGroup for the layer
            const featureGroup = L.featureGroup();
            featureGroup.name = sublayer.name;
            featureGroup.uuid = sublayer.uuid;

            const newGridLabels: GridLabelItem[] = [];

            const gridLayerOnEachFeature = (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              feature: geojson.Feature<geojson.GeometryObject, any>
            ) => {
              // if this grid has a MGRS_UTM property, that means it was made via MGRS process (for earth things like JETT 5).
              // This means the 2nd coordinate is the bottom left
              // If not, that means it's a bespoke grid made by the ARES GIS team, this means the 4th coordinate is the bottom left

              const bottomLeftCoordinate = feature.properties["MGRS_UTM"] ? 1 : 3;

              if (feature.properties["CELL_ID"]) {
                const multiPolygon = feature.geometry as geojson.MultiPolygon;
                const latLng = new L.LatLng(
                  multiPolygon.coordinates[0][0][bottomLeftCoordinate][1],
                  multiPolygon.coordinates[0][0][bottomLeftCoordinate][0]
                );

                newGridLabels.push({
                  id: feature.properties["CELL_ID"],
                  latLng: { lat: latLng.lat, lng: latLng.lng },
                });
              }
            };

            const vectorLayer = L.geoJSON(geojson, {
              style: (geoJsonFeature) => {
                //fill color defaults to color if not defined
                let fillColor = mapSublayerControls[sublayer.uuid].style?.color;
                if (mapSublayerControls[sublayer.uuid].style?.fillColor?.startsWith("prop:")) {
                  const fillPropertyName =
                    mapSublayerControls[sublayer.uuid].style?.fillColor.slice(5);
                  fillColor = geoJsonFeature.properties[fillPropertyName];
                }
                return {
                  //manually add uuid and type fields for tracking later on
                  id: sublayer.name,
                  uuid: sublayer.uuid,
                  type: "vector",
                  //manually define defaults
                  color: mapSublayerControls[sublayer.uuid].style?.color,
                  opacity: mapSublayerControls[sublayer.uuid].style?.opacity,
                  weight: mapSublayerControls[sublayer.uuid].style?.weight,
                  fillColor: fillColor,
                  fillOpacity: mapSublayerControls[sublayer.uuid].style?.fillOpacity,
                };
              },
              onEachFeature: sublayer.name.includes("Grid") ? gridLayerOnEachFeature : null, //TODO: this is a hacky way to check if it's a grid layer
              interactive: false,
            });
            featureGroup.addLayer(vectorLayer);
            map.current.addLayer(featureGroup);
            if (sublayer.name.includes("Grid")) {
              setGridLabels(newGridLabels);
            }
          })();
        } else {
          // if layer is already on the map, bring it to the front. This has the effect of controlling zorder of layers
          const layer = getLayerByName(map, sublayer.name);
          layer.bringToFront();
        }
      }
    });
  }, [
    mission.id,
    mapSublayerControls,
    map,
    layersOnMap,
    missionLayers,
    missionSublayers,
    selectedPreset,
    presets,
  ]);

  /**
   * Update which grid labels are visible based on map zoom level
   */
  useEffect(() => {
    if (!mapZoom || !mapBounds) return;

    let modulo = 1;
    //zoom levels are different for earth and moon because you have to zoom in more to see the same amount of detail on the Earth
    if (mission.planetRadius >= 6370000) {
      //if earth (6378137)
      if (mapZoom < 15) {
        modulo = 10;
      } else if (mapZoom < 16) {
        modulo = 5;
      } else if (mapZoom < 18) {
        modulo = 2;
      } else if (mapZoom >= 18) {
        modulo = 1;
      }
    } else {
      //if moon
      if (mapZoom < 13) {
        modulo = 10;
      } else if (mapZoom < 14) {
        modulo = 5;
      } else if (mapZoom < 15) {
        modulo = 2;
      } else if (mapZoom >= 15) {
        modulo = 1;
      }
    }

    // clear all grid labels
    gridLabelFeatureGroup.current.clearLayers();

    // bounds near the south pole becomes a scewed shape when pulled straight from Leaflet.
    // This process makes a square polygon using the map viewport as extents
    // Then turns that into a polygon and gets the bounds from that for checking if a grid label is in the map bounds
    const perimeter = getBoundsFromMapViewport(map);
    const polygon = L.polygon(perimeter);
    const bounds = polygon.getBounds();

    // loop through all grid labels and draw tooltips for the ones that match the modulo
    gridLabels.forEach((gridLabel) => {
      // ignore the label if it's not in the current map bounds

      if (!bounds.contains(gridLabel.latLng)) return;

      // get the label name and check the numbers to see if they match the modulo
      const labelNumberX = parseInt(gridLabel.id.split(" ")[0].slice(1));
      const labelNumberY = parseInt(gridLabel.id.split(" ")[1].slice(1));

      if (!(labelNumberX % modulo !== 0 || labelNumberY % modulo !== 0)) {
        // make a new tooltip for this grid label
        const tooltip = new L.Tooltip({
          sticky: false,
          direction: "right",
          offset: new L.Point(0, -8),
          permanent: true,
          className: "leaflet-tooltip-gridLabels",
          interactive: false,
          opacity: 0.8,
        });
        tooltip.setLatLng(gridLabel.latLng);
        tooltip.setContent(gridLabel.id);
        tooltip.addTo(gridLabelFeatureGroup.current);
      }
    });
  }, [mapBounds, mapZoom, gridLabels, mission.planetRadius]);

  /**
   * Update sublayer controls if presets change
   * This happens if presets are changed via incoming socket update
   */
  useEffect(() => {
    if (!selectedPreset) return;
    dispatch(setMapSublayerControls(selectedPreset.mapSublayerControls));
  }, [selectedPreset, dispatch, presets]);

  /**
   * Update map with display adjustments for sublayers as sliders are moved
   */
  useEffect(() => {
    if (!map.current || !mapSublayerControls) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.current.eachLayer((layer: any) => {
      for (const [uuid, sublayerControl] of Object.entries(mapSublayerControls)) {
        if (layer.options.uuid === uuid) {
          if (layer.options.type === "tile") {
            const tileLayer = layer as L.TileLayer;
            tileLayer.updateFilter(
              makeTileLayerColorFilter(mapSublayerControls, sublayerControl.sublayerUuid)
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
  }, [mapSublayerControls, map]);

  /**
   * Get the map item by uuid
   * Optionally provide a test for mapItemType as well
   */
  const getMapItemByUuid = useCallback(
    (uuid: string, mapItemType?: MapItemType): AEGISMarker | AEGISPolyline => {
      let mapItem: AEGISMarker | AEGISPolyline = null;

      map.current.eachLayer((layer: AEGISMarker | AEGISPolyline) => {
        if (layer.uuid === uuid) {
          if (mapItemType && layer.mapItemType !== mapItemType) return null;
          mapItem = layer;
        }
      });
      return mapItem;
    },
    [map]
  );

  /**
   * Update scale bar value
   */
  const calculateScale = useCallback(() => {
    const center = map.current.getCenter();
    const pointC = map.current.latLngToContainerPoint(center);
    const pointX: L.PointExpression = [pointC.x + 100, pointC.y]; //measure scale for 100 pixels(?)
    const latLngC = map.current.containerPointToLatLng(pointC);
    const latLngX = map.current.containerPointToLatLng(pointX);
    const distance = getDistanceBetweenTwoCoordinates(
      convertLeafletLatLngToAegisPoint(latLngC),
      convertLeafletLatLngToAegisPoint(latLngX),
      mission.planetRadius
    );
    setScale(distance);
  }, [mission.planetRadius]);

  useEffect(() => {
    if (!map.current) return;
    calculateScale();
  }, [map, mapZoom, calculateScale]);

  /**
   * Draw scale bar div.
   * Scale represents how many meters represents 100 pixels on the map
   */
  const drawScaleBarDiv = useCallback(() => {
    if (!map.current) return;

    // round up the scale value to the nearest custom meter marks. Ex: if scale is 51 it will round to 100.
    let roundedScale: number;
    const meters = [1, 2, 5, 10, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
    for (const meter of meters) {
      roundedScale = Math.ceil(scale / meter) * meter;
      if (scale < meter) {
        break;
      }
    }
    // if it's over 1000m, turn the label into km
    const roundedScaleLabel =
      roundedScale >= 1000 ? `${roundedScale / 1000}km` : `${roundedScale}m`;

    // determine how wide to draw the scale bar
    // scale / 100 = roundedScale / x
    const scaleBarSize = roundedScale / (scale / 100);

    return (
      <>
        <div className={styles.scaleValue} style={{ width: scaleBarSize }}>
          {roundedScaleLabel}
        </div>
      </>
    );
  }, [map, scale]);

  const drawLatLongDiv = useCallback(() => {
    if (!map.current || mapPosition.length === 0) return;

    const latLngStr = `${mapPosition[0]}, ${mapPosition[1]}`;

    return (
      <>
        <div className={styles.positionValue}>{latLngStr}</div>
      </>
    );
  }, [mapPosition]);

  const drawOrUpdateCrewPosOnMap = useCallback(
    ({
      crewPos,
      permanentLabel,
      onClick = () => {},
      onDragEnd = () => {},
      markerOptions,
      tooltipOptions = {},
    }: {
      crewPos: CrewPos;
      permanentLabel: boolean;
      onClick: Function;
      onDragEnd: Function;
      markerOptions: L.MarkerOptions;
      tooltipOptions: L.TooltipOptions;
    }) => {
      const { uuid, location, crew } = crewPos;
      if (isNaN(crewPos?.location?.lat) || isNaN(crewPos?.location?.lng)) return;
      const mapItemType = "crewPos";

      // make html for all permutations of crew loc crewItem types
      const crewEmoji = "1f468-200d-1f680"; //crew
      const cartEmoji = "1f6d2"; //cart

      let jsx = null;
      // if only cart is in the item, show a cart emoji only
      if (crew.find((crewType) => crewType === "Cart") && crew.length === 1) {
        jsx = (
          <div className={styles.crewPosWrapper}>
            <div className={styles.crewPosCart}>{decodeEmoji(cartEmoji)}</div>
          </div>
        );
      } else if (
        crew.find((crewType) => crewType === "EV1") &&
        !crew.find((crewType) => crewType === "EV2")
      ) {
        // if only EV1 is in the item, show a full bar with EV1 color and optionally show cart dot if a cart is in the item
        jsx = (
          <div className={styles.crewPosWrapper}>
            <div className={styles.crewPosIcon}>{decodeEmoji(crewEmoji)}</div>
            <div className={`${styles.crewPosBarFull} ${styles.crewPosBarEv1}`}></div>
            {crew.find((crewType) => crewType === "Cart") && (
              <div className={`${styles.crewPosMiniCart}`}>{decodeEmoji(cartEmoji)}</div>
            )}
          </div>
        );
      } else if (
        crew.find((crewType) => crewType === "EV2") &&
        !crew.find((crewType) => crewType === "EV1")
      ) {
        // if only EV2 is in the item, show a full bar with EV2 color and optionally show cart dot if a cart is in the item
        jsx = (
          <div className={styles.crewPosWrapper}>
            <div className={styles.crewPosIcon}>{decodeEmoji(crewEmoji)}</div>
            <div className={`${styles.crewPosBarFull} ${styles.crewPosBarEv2}`}></div>
            {crew.find((crewType) => crewType === "Cart") && (
              <div className={`${styles.crewPosMiniCart}`}>{decodeEmoji(cartEmoji)}</div>
            )}
          </div>
        );
      } else {
        // show EV1 and EV2 half bars and optionally show cart dot if a cart is in the item
        jsx = (
          <div className={styles.crewPosWrapper}>
            <div className={styles.crewPosIconBackground}>{decodeEmoji(crewEmoji)}</div>
            <div className={styles.crewPosIcon}>{decodeEmoji(crewEmoji)}</div>
            <div className={`${styles.crewPosBarLeft} ${styles.crewPosBarEv1}`}></div>
            <div className={`${styles.crewPosBarRight} ${styles.crewPosBarEv2}`}></div>
            {crew.find((crewType) => crewType === "Cart") && (
              <div className={`${styles.crewPosMiniCart}`}>{decodeEmoji(cartEmoji)}</div>
            )}
          </div>
        );
      }

      const html = ReactDOMServer.renderToString(jsx);
      const icon = L.divIcon({ html });

      const existingLayer = getMapItemByUuid(uuid, mapItemType) as AEGISMarker;
      if (existingLayer && existingLayer.mapItemType === mapItemType) {
        existingLayer.setLatLng(location as L.LatLng);
        existingLayer.setIcon(icon);
      } else {
        const marker = L.marker(location as AEGISPoint, {
          icon,
          ...markerOptions,
        }) as AEGISMarker;
        marker.uuid = uuid;
        marker.mapItemType = mapItemType;

        // marker handlers
        marker.bindTooltip(``, {
          sticky: false,
          direction: "top",
          offset: new L.Point(0, -10),
          permanent: permanentLabel,
          className: "leaflet-tooltip-own",
          ...tooltipOptions,
        });

        marker
          .on("click", () => {
            onClick();
          })
          .on("mouseover", () => {
            dispatch(setHoverUuidsForCrewPos(marker.uuid));
          })
          .on("mouseout", () => {
            dispatch(clearMapItemHover());
          });
        if (onDragEnd) {
          // dragend handler that causes edit to be saved on mouseup
          marker.on("dragend", (e) => {
            map.current.getContainer().style.cursor = "grab";
            onDragEnd(e.target as AEGISMarker);
          });
        }
        crewPosFeatureGroup.current.addLayer(marker);
      }
    },
    [map, getMapItemByUuid, dispatch]
  );

  /**
   * Draw or update markers on the map
   */
  const drawOrUpdateMarkerOnMap = useCallback(
    ({
      name,
      uuid,
      iconEmoji,
      location,
      mapItemType,
      onClick = () => {},
      onDragEnd = () => {},
      permanentLabel = false,
      markerOptions = {},
      tooltipOptions = {},
    }: {
      name: string;
      uuid: string;
      iconEmoji: string;
      location: AEGISPoint;
      mapItemType: MapMarkerType;
      onClick?: Function;
      onDragEnd?: Function;
      permanentLabel?: boolean;
      markerOptions?: L.MarkerOptions;
      tooltipOptions?: L.TooltipOptions;
    }) => {
      if (isNaN(location.lat) || isNaN(location.lng)) return;

      const html = ReactDOMServer.renderToString(
        <div className={styles.mapIcon}>{decodeEmoji(iconEmoji)}</div>
      );
      const icon = L.divIcon({ html });

      const existingLayer = getMapItemByUuid(uuid, mapItemType) as AEGISMarker;

      if (existingLayer && existingLayer.mapItemType === mapItemType) {
        existingLayer.setLatLng(location as L.LatLng);
        existingLayer.setIcon(icon);
      } else {
        const marker = L.marker(location as AEGISPoint, {
          icon,
          ...markerOptions,
        }) as AEGISMarker;
        marker.uuid = uuid;
        marker.mapItemType = mapItemType;

        // marker handlers
        marker.bindTooltip(`${name}`, {
          sticky: false,
          direction: "top",
          offset: new L.Point(0, -10),
          permanent: permanentLabel,
          className: "leaflet-tooltip-own",
          ...tooltipOptions,
        });
        if (onClick) {
          marker
            .on("click", () => {
              onClick();
            })
            .on("mouseover", () => {
              if (mapItemType === "crewPos") {
                dispatch(setHoverUuidsForCrewPos(marker.uuid));
              } else {
                dispatch(setHoverUuidsForSequence(marker.uuid));
              }
            })
            .on("mouseout", () => {
              dispatch(clearMapItemHover());
            });
        }
        if (onDragEnd) {
          // dragend handler that causes edit to be saved on mouseup
          marker.on("dragend", (e) => {
            map.current.getContainer().style.cursor = "grab";
            onDragEnd(e.target as AEGISMarker);
          });
        }

        if (mapItemType === "station") {
          marker.setZIndexOffset(1000);
          stationFeatureGroup.current.addLayer(marker);
        } else if (mapItemType === "poi") {
          poiFeatureGroup.current.addLayer(marker);
        } else if (mapItemType === "action") {
          actionFeatureGroup.current.addLayer(marker);
        } else if (mapItemType === "crewPos") {
          crewPosFeatureGroup.current.addLayer(marker);
        } else {
          map.current.addLayer(marker);
        }
      }
    },
    [map, getMapItemByUuid, dispatch]
  );

  /**
   * update polyline on map
   */
  const updatePolylineOnMap = useCallback(
    ({
      uuid,
      path,
      mapItemType,
    }: {
      uuid: string;
      path: AEGISPoint[];
      mapItemType: MapPolylineType;
    }) => {
      if (
        !Array.isArray(path) ||
        !path[0]?.lat ||
        !path[0]?.lng ||
        !path[path.length - 1]?.lat ||
        !path[path.length - 1]?.lng
      )
        return;
      for (let i = 0; i < path.length; i++) {
        if (isNaN(path[i].lat) || isNaN(path[i].lng)) return;
      }

      const existingLayer = getMapItemByUuid(uuid, mapItemType) as AEGISPolyline;

      if (existingLayer && existingLayer.mapItemType === mapItemType) {
        existingLayer.setLatLngs(path);
      }
    },
    [getMapItemByUuid]
  );

  /**
   * Draw polylines on the map
   */
  const drawPolylineOnMap = useCallback(
    ({
      name,
      uuid,
      path,
      mapItemType,
      color,
      dashArray,
      onClick,
      drawAntPath,
    }: {
      name: string;
      uuid: string;
      path: AEGISPoint[];
      onClick?: Function;
      color: string;
      dashArray?: string;
      mapItemType: MapPolylineType;
      drawAntPath: boolean;
    }) => {
      // if the location isn't the null default, draw it on the map
      if (
        !Array.isArray(path) ||
        !path[0]?.lat ||
        !path[0]?.lng ||
        !path[path.length - 1]?.lat ||
        !path[path.length - 1]?.lng
      )
        return;
      for (let i = 0; i < path.length; i++) {
        if (isNaN(path[i].lat) || isNaN(path[i].lng)) return;
      }

      const typeName = mapItemType.charAt(0).toUpperCase() + mapItemType.slice(1);

      const polyline = new HighlightablePolyline(path as AEGISPoint[], {
        color: color,
        weight: 3,
        dashArray,
        opacity: 0.5,
        smoothFactor: 1,
        outlineColor: "#8b8680",
        raised: false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any; //TODO: figure out the weird HighlightablePolyline typescript implementation
      polyline.uuid = uuid;
      polyline.mapItemType = mapItemType;

      // polyline arrows
      if (showArrows) {
        polyline.setText("➤             ", {
          repeat: true,
          offset: 6,
          attributes: { fill: color, "font-weight": "bold", "font-size": "16" },
        });
      }

      // polyline handlers
      polyline
        .bindTooltip(`${name} ${typeName}`, {
          sticky: true,
          direction: "top",
          offset: new L.Point(0, -20),
        })
        .on("click", () => {
          onClick();
        })
        .on("mouseover", () => {
          dispatch(setHoverUuidsForSequence(polyline.uuid));
        })
        .on("mouseout", () => {
          dispatch(clearMapItemHover());
        });

      map.current.addLayer(polyline);

      if (drawAntPath && !showArrows) {
        const aPath = antPath(path, {
          delay: 9000,
          dashArray: [10, 20],
          weight: 5,
          opacity: 1,
          color: "rgb(0, 0, 0, 0)",
          pulseColor: "rgb(255, 255, 255, 1)",
          paused: false,
          reverse: false,
          hardwareAccelerated: true,
        });
        aPath.mapItemType = "antPath" as MapItemType;

        map.current.addLayer(aPath);
      }
    },
    [map, dispatch, showArrows]
  );

  const saveUpdatedItemPosition = useCallback(
    async (uuid: string, mapItemType: MapItemType, location: AEGISPoint) => {
      switch (mapItemType) {
        case "lander":
          await dispatch(thunkUpdateLanderLocation({ location }));
          break;
        case "poi":
          await dispatch(thunkUpdatePoiLocation({ location, poiUuid: uuid }));
          break;
        case "station":
          await dispatch(thunkUpdateStationLocation({ location, stationUuid: uuid }));
          break;
        case "action":
          await dispatch(thunkUpdateActionLocation({ location, actionUuid: uuid }));
          break;
        case "crewPos":
          await dispatch(thunkUpdateCrewPosLocation({ location, crewPosUuid: uuid }));
          break;
      }
    },
    [dispatch]
  );

  /**
   * Map instantiation
   */
  useLayoutEffect(() => {
    if (!mapRef.current || !map || !mission) return;

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

    if (!crewPosFeatureGroup.current) {
      crewPosFeatureGroup.current = L.featureGroup().addTo(map.current);
    }
  }, [mapRef, map, draggableLines, mission]);

  /**
   * Set the center of the map to the center of the selected mission
   */
  useEffect(() => {
    if (!map.current || !mission) return;

    const center = [mission.landerLocation.lat, mission.landerLocation.lng] as L.LatLngExpression;
    const zoom = mission.initialZoom;

    map.current.setView(center, zoom);
    //react does not detect a change to the map ref when setView is called. Manually re-calculate scale
    calculateScale();

    // set the map zoom
    setMapZoom(map.current.getZoom());

    // set the map bounds
    const bounds = map.current.getBounds();
    const boundsArray: L.LatLngBoundsLiteral = [
      [bounds.getSouthWest().lat, bounds.getSouthWest().lng],
      [bounds.getNorthEast().lat, bounds.getNorthEast().lng],
    ];
    setMapBounds(boundsArray);
  }, [mission, map, calculateScale]);

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
          mapDirective.mapItemType === "crewPos") &&
        (mapDirective.mapAction === "editMarker" || mapDirective.mapAction === "createMarker")
      ) {
        saveUpdatedItemPosition(
          mapDirective.uuid,
          mapDirective.mapItemType,
          convertLeafletLatLngToAegisPoint(e.latlng)
        );

        // reset the map directive
        dispatch(updateMapDirective(null));
        // set the mouse cursor back to the default
        map.current.getContainer().style.cursor = "grab";
      }
    });

    map.current.on("mousemove", (e) => {
      setMapPosition([e.latlng.lat.toFixed(6), e.latlng.lng.toFixed(6)]);
    });

    map.current.on("zoomend", () => {
      // set the map zoom
      setMapZoom(map.current.getZoom());

      // set the map bounds
      const bounds = map.current.getBounds();
      const boundsArray: L.LatLngBoundsLiteral = [
        [bounds.getSouthWest().lat, bounds.getSouthWest().lng],
        [bounds.getNorthEast().lat, bounds.getNorthEast().lng],
      ];
      setMapBounds(boundsArray);
    });

    map.current.on("moveend", () => {
      // set the map bounds
      const bounds = map.current.getBounds();
      const boundsArray: L.LatLngBoundsLiteral = [
        [bounds.getSouthWest().lat, bounds.getSouthWest().lng],
        [bounds.getNorthEast().lat, bounds.getNorthEast().lng],
      ];
      setMapBounds(boundsArray);
    });

    map.current.on("load", () => {
      // set the map zoom
      setMapZoom(map.current.getZoom());

      // set the map bounds
      const bounds = map.current.getBounds();
      const boundsArray: L.LatLngBoundsLiteral = [
        [bounds.getSouthWest().lat, bounds.getSouthWest().lng],
        [bounds.getNorthEast().lat, bounds.getNorthEast().lng],
      ];
      setMapBounds(boundsArray);
    });

    return () => {
      if (map.current) {
        map.current.off("click");
      }
    };
  }, [map, mapDirective, saveUpdatedItemPosition, dispatch]);

  /**
   * Listen for mapDirective for stations, pois, actions, and traverses, and trigger map draw/edit modes appropriately
   */
  useEffect(() => {
    if (!map.current || !draggableLines || !mapDirective) return;

    switch (mapDirective.mapAction) {
      case "createMarker":
        // create events only come from Marker obejcts (pois and stations) since traverses are initially created by the app
        map.current.getContainer().style.cursor = "crosshair";
        break;

      case "cancelCreateMarker":
        clearAction();
        break;

      case "editMarker":
        map.current.getContainer().style.cursor = "crosshair";

        // find the marker on the map using uuid
        const markerToUpdate = getMapItemByUuid(
          mapDirective.uuid,
          mapDirective.mapItemType
        ) as AEGISMarker;

        if (markerToUpdate) {
          // make the marker draggable
          markerToUpdate.dragging.enable();
        }
        break;

      case "cancelEditMarker":
        clearAction();
        break;

      case "editPolyline":
        map.current.getContainer().style.cursor = "crosshair";
        setShowSelectedItemOnMap(false);

        // find this polyline layer on the map
        const polylineToUpdate = getMapItemByUuid(
          mapDirective.uuid,
          mapDirective.mapItemType
        ) as AEGISPolyline;

        if (polylineToUpdate) {
          draggableLines.current.enableForLayer(polylineToUpdate);

          const dispatchPath = async (e: L.LeafletEvent, saveElevation: boolean) => {
            //TODO: layer is deprecated but changing this to propagatedFrom throws a null when dragging?
            if (e.layer.uuid !== mapDirective.uuid) return;

            const path = convertLeafletLatLngsToAegisPoints(e.layer.getLatLngs());

            if (e.layer.mapItemType === "traverse") {
              if (!saveElevation) {
                //update just the path
                await dispatch(
                  thunkUpdateTraversePath({
                    path,
                    traverseUuid: mapDirective.uuid,
                  })
                );
              } else {
                //update path, elevation, and snap endpoints
                const response = await dispatch(
                  thunkFullUpdateTraverse({
                    traverseUuid: mapDirective.uuid,
                    path,
                  })
                );

                //redraw the line incase we had to snap endpoints
                updatePolylineOnMap({
                  uuid: mapDirective.uuid,
                  path: response.payload as AEGISPoint[],
                  mapItemType: "traverse",
                });
              }
            }
            if (e.layer.mapItemType === "walkback") {
              if (!saveElevation) {
                //update just the path
                await dispatch(
                  thunkUpdateWalkbackPath({
                    path,
                    stationUuid: mapDirective.uuid,
                  })
                );
              } else {
                //update path, elevation, and snap endpoints
                const response = await dispatch(
                  thunkFullUpdateWalkback({
                    path,
                    stationUuid: mapDirective.uuid,
                  })
                );
                //redraw the line incase we had to snap endpoints
                updatePolylineOnMap({
                  uuid: mapDirective.uuid,
                  path: response.payload as AEGISPoint[],
                  mapItemType: "walkback",
                });
              }
            }
          };

          draggableLines.current.on(
            "drag",
            _.throttle((e) => {
              dispatchPath(e, true);
            }, 100)
          );

          draggableLines.current.on("dragend", (e) => {
            dispatchPath(e, true);
          });

          draggableLines.current.on("remove", (e) => {
            dispatchPath(e, true);
          });
        }

        break;

      case "saveEditPolyline":
        // only called by polyline edits. Markers happen on click or draggend events
        // **** no need to save because we love updating the store with the new location as the user drags the polyline ****

        // find this polyline layer on the map
        draggableLines.current.disableForLayer(
          getMapItemByUuid(mapDirective.uuid, mapDirective.mapItemType) as L.Polyline
        );

        draggableLines.current.off("drag");
        draggableLines.current.off("remove");

        clearAction();
        break;

      case "cancelEditPolyline":
        draggableLines.current.disableForLayer(
          getMapItemByUuid(mapDirective.uuid, mapDirective.mapItemType) as L.Polyline
        );
        if (mapDirective.mapItemType === "traverse") {
          dispatch(revertTraversePath({ uuid: mapDirective.uuid }));
        }
        if (mapDirective.mapItemType === "walkback") {
          dispatch(revertWalkbackPath({ uuid: mapDirective.uuid }));
        }

        draggableLines.current.off("drag");
        draggableLines.current.off("remove");

        clearAction();
        break;
      default:
    }

    function clearAction() {
      dispatch(updateMapDirective(null));
      setShowSelectedItemOnMap(true);
      map.current.getContainer().style.cursor = "grab";
    }

    return () => {
      if (draggableLines.current) {
        draggableLines.current.disable();
        draggableLines.current.off("drag");
      }
    };
  }, [map, draggableLines, mapDirective, dispatch, getMapItemByUuid, updatePolylineOnMap]);

  /**
   * Populate stationsToShow when stations or selections change
   */
  useEffect(() => {
    if (!stations) return;
    if (mapDisplayStations.show) {
      setStationsToShow(stations);
      return;
    }
    if (selectedEva) {
      const stationSequenceItems = selectedEva.sequence.filter((item) => item.type === "station");
      const stationsInEva = stations.filter((station) =>
        stationSequenceItems.find((item) => item.uuid === station.uuid)
      );
      setStationsToShow(stationsInEva);
      return;
    }
    if (selectedStation && (sectionSelected === "station" || sectionSelected === "evas")) {
      setStationsToShow([selectedStation]);
      return;
    }
    setStationsToShow([]);
  }, [stations, selectedStation, selectedEva, mapDisplayStations, sectionSelected, actions]);

  /**
   * Populate actions to show when actions or selections change
   */
  useEffect(() => {
    if (!actions) return;
    if (!mapDisplayActions.show) {
      setActionsToShow([]);
      return;
    }
    if ((sectionSelected === "station" || sectionSelected === "evas") && selectedStation) {
      // set actions to show
      const actionsInStation = actions.filter(
        (action) => action.stationUuid === selectedStation.uuid && action.enabled
      );
      setActionsToShow(actionsInStation);
    } else if (sectionSelected === "poi" && selectedPoi) {
      // set actions to show
      const actionsInPoi = actions.filter(
        (action) => action.poiUuid === selectedPoi.uuid && action.enabled
      );
      setActionsToShow(actionsInPoi);
    } else {
      setActionsToShow([]);
    }
  }, [actions, selectedStation, selectedPoi, mapDisplayActions, sectionSelected]);

  /**
   * Populate POIs to show when POIs or selections change
   */
  useEffect(() => {
    if (!pois) return;
    if (mapDisplayPois.show) {
      setPoisToShow(pois);
      return;
    }
    if (selectedPoi && sectionSelected === "poi") {
      setPoisToShow([selectedPoi]);
      return;
    }
    setPoisToShow([]);
  }, [pois, selectedPoi, mapDisplayPois, sectionSelected, actions]);

  /**
   * Populate traverses to show when traverses or selections change
   */
  useEffect(() => {
    if (!traverses) return;

    if (selectedEvaSequenceItemUuid) {
      const traverse = traverses.find((traverse) => traverse.uuid === selectedEvaSequenceItemUuid);
      if (traverse) {
        setTraversesToShow([traverse]);
      } else {
        setTraversesToShow([]);
      }
    }
    if (selectedEva) {
      const traverseSequenceItems = selectedEva.sequence.filter((item) => item.type === "traverse");
      const traversesInEva = traverses.filter((traverse) =>
        traverseSequenceItems.find((item) => item.uuid === traverse.uuid)
      );
      setTraversesToShow(traversesInEva);
    } else {
      setTraversesToShow([]);
    }
  }, [traverses, selectedEvaSequenceItemUuid, selectedEva]);

  /**
   * Populate Crew positions to show when crew pos or selections change
   */
  useEffect(() => {
    setCrewPosToShow([]);
    if (mapDisplayCrewPos.show) {
      //if there is a running rex, or no running rex but we're on the rex section and there's a rex selected
      if (selectedOrRunningRex?.rexRunning || (sectionSelected === "rex" && selectedOrRunningRex)) {
        setCrewPosToShow(_.orderBy(selectedOrRunningRex.crewPos, ["createdAt"], "desc"));
      }
    }
  }, [selectedOrRunningRex, sectionSelected, mapDisplayCrewPos]);

  /**
   * Populate lander radii
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
    const mapCircleControls = selectedPreset.mapCircleControls;

    // remove any existing radii
    map.current.eachLayer((layer: CircleWithUuid) => {
      if (layer.mapItemType === "radius") {
        map.current.removeLayer(layer);
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
       * If this is in a non-equatorial landing location of a non-earth celestial body,
       * a further adjustment will be made to the distance calculated that instead
       * takes the integral of the ratio between the two planets.
       */
      const earthRadiusInMeters = 6378137;
      let radiusAdjustment = earthRadiusInMeters / mission.planetRadius;

      if (
        earthRadiusInMeters !== mission.planetRadius &&
        Math.abs(mission.landerLocation.lat) > 10
      ) {
        radiusAdjustment = radiusAdjustment * (earthRadiusInMeters / (2 * mission.planetRadius));
      }

      const distance = landerRadius.radius * radiusAdjustment;

      if (mapCircleControls[landerRadius.uuid]?.visible) {
        const circle: CircleWithUuid = L.circle(landerLocation, {
          ...mapCircleControls[landerRadius.uuid].style,
          radius: distance,
          interactive: false,
        });
        circle.mapItemType = "radius";
        circle.addTo(map.current);
      }
    });
  }, [
    mission?.landerLocation,
    mission?.landerRadii,
    map,
    selectedPreset?.mapCircleControls,
    mission?.planetRadius,
  ]);

  /**
   * Draw or update lander
   */
  useEffect(() => {
    if (!map.current || mapDirective || !mission.landerLocation) return;

    drawOrUpdateMarkerOnMap({
      name: "Lander",
      uuid: "lander",
      iconEmoji: "1F315",
      mapItemType: "lander",
      location: mission.landerLocation,
      onClick: () => {
        dispatch(setSectionSelected("mission"));
        dispatch(setRightPanelOpen(true));
      },
      onDragEnd: (marker: AEGISMarker) => {
        const newLocation = convertLeafletLatLngToAegisPoint(marker.getLatLng());
        saveUpdatedItemPosition("lander", "lander", newLocation);
        dispatch(updateMapDirective(null));
      },
    });
  }, [
    map,
    mapDirective,
    mission.landerLocation,
    drawOrUpdateMarkerOnMap,
    dispatch,
    saveUpdatedItemPosition,
  ]);

  /**
   * Draw or update POIs on the map when pois change. Serves as draw when page loads
   */
  useEffect(() => {
    if (!map.current || mapDirective) return;

    // delete all pois in leaflet
    poiFeatureGroup.current.clearLayers();

    // draw or update all pois
    poisToShow.forEach((poi) => {
      if (poi.location) {
        drawOrUpdateMarkerOnMap({
          name: poi.name,
          uuid: poi.uuid,
          iconEmoji: poi.icon, // no default because object always starts red circle
          mapItemType: "poi",
          location: poi.location,
          onClick: () => {
            setShowSelectedItemOnMap(true);
            dispatch(setSectionSelected("poi"));
            dispatch(setSelectedPoiUuid(poi.uuid));
            dispatch(setRightPanelOpen(true));
          },
          onDragEnd: (marker: AEGISMarker) => {
            const newLocation = convertLeafletLatLngToAegisPoint(marker.getLatLng());
            saveUpdatedItemPosition(poi.uuid, "poi", newLocation);
            dispatch(updateMapDirective(null));
          },
          permanentLabel: mapDisplayPois.showLabels,
        });
      }
    });
  }, [
    map,
    mapDirective,
    drawOrUpdateMarkerOnMap,
    saveUpdatedItemPosition,
    dispatch,
    poisToShow,
    mapDisplayPois,
  ]);

  /**
   * Draw or update actions on the map when actions change. Serves as draw when page loads
   */
  useEffect(() => {
    if (!map.current || mapDirective) return;

    // delete all actions in leaflet
    actionFeatureGroup.current.clearLayers();

    // draw or update all actions
    actionsToShow.forEach((action) => {
      if (action.location) {
        drawOrUpdateMarkerOnMap({
          name: `${titleCase(action.type)}: ${action.name}`,
          uuid: action.uuid,
          iconEmoji: action.icon ? action.icon : "2754", //default to question mark
          mapItemType: "action",
          location: action.location,
          onDragEnd: (marker: AEGISMarker) => {
            const newLocation = convertLeafletLatLngToAegisPoint(marker.getLatLng());
            saveUpdatedItemPosition(action.uuid, "action", newLocation);
            dispatch(updateMapDirective(null));
          },
          permanentLabel: mapDisplayActions.showLabels,
        });
      }
    });
  }, [
    map,
    mapDirective,
    drawOrUpdateMarkerOnMap,
    saveUpdatedItemPosition,
    dispatch,
    actionsToShow,
    mapDisplayActions,
    selectedPoi,
    selectedStation,
    actions,
  ]);

  /**
   * Draw stationsToShow on the map when stations or selections change. Linked to checkbox at top of map.
   */
  useEffect(() => {
    if (!map.current || mapDirective) return;

    // remove all stations from the map
    stationFeatureGroup.current.clearLayers();

    // draw all stations
    stationsToShow.forEach((station) => {
      if (station.location) {
        drawOrUpdateMarkerOnMap({
          name: station.name,
          uuid: station.uuid,
          iconEmoji: station.icon ? station.icon : "2754", //default to question mark
          mapItemType: "station",
          location: station.location,
          onClick: () => {
            setShowSelectedItemOnMap(true);
            dispatch(setSectionSelected("station"));
            dispatch(setSelectedStationUuid(station.uuid));
            dispatch(setRightPanelOpen(true));
          },
          onDragEnd: (marker: AEGISMarker) => {
            const newLocation = convertLeafletLatLngToAegisPoint(marker.getLatLng());
            saveUpdatedItemPosition(station.uuid, "station", newLocation);
            dispatch(updateMapDirective(null));
          },
          permanentLabel: mapDisplayStations.showLabels,
        });
      }
    });

    stationFeatureGroup.current.setZIndex(999);
  }, [
    map,
    mapDirective,
    drawOrUpdateMarkerOnMap,
    saveUpdatedItemPosition,
    dispatch,
    stationsToShow,
    mapDisplayStations,
  ]);

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

    if (sectionSelected !== "station" && sectionSelected !== "evas") return;

    // draw the walkback traverse
    if (!mapDirective && selectedStation?.walkbackPath) {
      drawPolylineOnMap({
        name: selectedStation.name,
        uuid: selectedStation.uuid,
        mapItemType: "walkback",
        path: selectedStation.walkbackPath,
        color: "red",
        dashArray: "5, 5",
        onClick: () => {
          setShowSelectedItemOnMap(true);
          dispatch(setSectionSelected("station"));
          dispatch(setSelectedStationUuid(selectedStation.uuid));
        },
        drawAntPath: false,
      });
    }
  }, [
    map,
    selectedStation,
    mapDirective,
    drawPolylineOnMap,
    dispatch,
    sectionSelected,
    showArrows,
  ]);

  /**
   * Draw or update traverses on the map when selections or traverses change. Serves as draw when page loads
   */
  useEffect(() => {
    if (!map.current) return;
    // abort if there is an active map action ongoing
    if (mapDirective) return;

    if (traversesToShow) {
      // delete all traverses from the map
      map.current.eachLayer((layer: AEGISMapDrawingLayer) => {
        if (layer.mapItemType === "traverse" || layer.mapItemType === "antPath") {
          map.current.removeLayer(layer);
        }
      });

      // draw all traverses in the selectedEva sequence
      traversesToShow.forEach((traverse) => {
        drawPolylineOnMap({
          name: traverse.name,
          uuid: traverse.uuid,
          path: traverse.path,
          onClick: () => {
            dispatch(setSectionSelected("evas"));
            dispatch(selectEVASequenceItem({ sequenceItemUuid: traverse.uuid }));
            dispatch(setSelectedCrewPosUuid(null));
          },
          color: selectedEvaSequenceItemUuid === traverse.uuid ? "#64ceff" : "#03adfc",
          mapItemType: "traverse",
          drawAntPath: selectedEvaSequenceItemUuid !== traverse.uuid, //make it an ant path if this is not the selected traverse
        });
      });
    }
  }, [
    map,
    mapDirective,
    drawPolylineOnMap,
    dispatch,
    traversesToShow,
    selectedEvaSequenceItemUuid,
    showArrows,
  ]);

  /**
   * Draw or update crew positions on the map when crew pos change. Serves as draw when page loads
   */

  const drawCrewPath = useCallback(
    ({
      coords,
      color,
      uuid,
      offset,
    }: {
      coords: AEGISPoint[];
      color: string;
      uuid: string;
      offset: number;
    }) => {
      const existingPath = getMapItemByUuid(uuid, "crewPosPath") as AEGISPolyline;
      if (existingPath && existingPath.mapItemType === "crewPosPath") {
        existingPath.setLatLngs(coords);
      } else {
        // polyline offset doesn't have correct type override, so using any
        const path = L.polyline(coords, {
          color,
          weight: 2,
          opacity: 0.6,
          smoothFactor: 1,
          offset,
          //eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any) as any; // being able to set the text and offset is a custom extension to the polyline class
        path.uuid = uuid;
        path.mapItemType = "crewPosPath";

        path.setText("➤             ", {
          repeat: true,
          offset: 4,
          attributes: { fill: color, "font-weight": "bold", "font-size": "12", opacity: 0.6 },
        });

        crewPosFeatureGroup.current.addLayer(path);
      }
    },
    [getMapItemByUuid]
  );

  useEffect(() => {
    if (!map.current || mapDirective) return;

    // delete all crew pos in leaflet
    crewPosFeatureGroup.current.clearLayers();

    // draw or update all crew pos
    crewPosToShow.forEach((crewPos, index, array) => {
      if (crewPos.location) {
        //if this is the most recent crew pos, add a circle around it
        if (index === 0) {
          // highlight current crew pos
          const marker = L.circleMarker(
            { lat: crewPos.location.lat, lng: crewPos.location.lng },
            {
              radius: 25,
              color: "#52f075",
              stroke: true,
              weight: 2,
              fill: false,
            }
          ) as AEGISCircleMarker;
          marker.bringToFront();
          crewPosFeatureGroup.current.addLayer(marker);
        }

        let opacity: number = 1;
        if (mapDisplayCrewPos.fadeOldPositions) {
          //set opacity for historic crew pos. No less than 0.3
          opacity = 1 - index / array.length;
          if (opacity <= 0.3) opacity = 0.3;
        }

        drawOrUpdateCrewPosOnMap({
          crewPos,
          onClick: () => {
            setShowSelectedItemOnMap(true);
            dispatch(setSelectedCrewPosUuid(crewPos.uuid));
            dispatch(selectEVASequenceItem({ sequenceItemUuid: null }));
          },
          onDragEnd: (marker: AEGISMarker) => {
            const newLocation = convertLeafletLatLngToAegisPoint(marker.getLatLng());
            saveUpdatedItemPosition(crewPos.uuid, "crewPos", newLocation);
            dispatch(updateMapDirective(null));
          },
          permanentLabel: mapDisplayCrewPos.showAllLabels,
          markerOptions: { opacity },
          tooltipOptions: { opacity: 1 },
        });
      }
    });

    // draw or update path
    if (mapDisplayCrewPos.showPaths) {
      drawCrewPath({
        coords: crewPosToShow
          .filter((crewPos) => crewPos.crew.includes("Cart"))
          .map((crewPos) => {
            return crewPos.location;
          })
          .reverse(),
        color: "#aaaaaa",
        uuid: "cart-crew-path",
        offset: 4,
      });
      drawCrewPath({
        coords: crewPosToShow
          .filter((crewPos) => crewPos.crew.includes("EV2"))
          .map((crewPos) => {
            return crewPos.location;
          })
          .reverse(),
        color: "#ffffff",
        uuid: "ev2-crew-path",
        offset: 2,
      });
      drawCrewPath({
        coords: crewPosToShow
          .filter((crewPos) => crewPos.crew.includes("EV1"))
          .map((crewPos) => {
            return crewPos.location;
          })
          .reverse(),
        color: "#ff0000",
        uuid: "ev1-crew-path",
        offset: 0,
      });
    }
  }, [
    map,
    mapDirective,
    drawOrUpdateCrewPosOnMap,
    saveUpdatedItemPosition,
    dispatch,
    crewPosToShow,
    mapDisplayCrewPos,
    drawCrewPath,
  ]);

  // used to update the PET value via the PetInterval component
  const [rexPetTime, setRexPetTime] = useState("");

  //handle when rex is ticking
  useEffect(() => {
    if (!crewPosToShow || crewPosToShow.length === 0) return;
    for (let i = 0; i < crewPosToShow.length; i++) {
      const crewPosMarker = getMapItemByUuid(crewPosToShow[i].uuid) as AEGISMarker;
      if (crewPosMarker) {
        const rexPetSeconds = secondsFromhhmmss(rexPetTime);
        const timeToShow = hhmmssFromSeconds(rexPetSeconds - crewPosToShow[i].seconds);
        const newLabel = `<div style="text-align: center">${timeToShow}</div>`;
        crewPosMarker.setTooltipContent(newLabel);
      }
    }
    if (mapDisplayCrewPos.showLatestLabels) {
      const crewPosToShowSortedByTime = _.orderBy(crewPosToShow, ["createdAt"], ["desc"]);
      const latestCrewPosMarkerWithEv1 = crewPosToShowSortedByTime.find((crewPos) =>
        crewPos.crew.includes("EV1")
      );
      const latestCrewPosMarkerWithEv2 = crewPosToShowSortedByTime.find((crewPos) =>
        crewPos.crew.includes("EV2")
      );
      const latestCrewPosMarkerWithCart = crewPosToShowSortedByTime.find((crewPos) =>
        crewPos.crew.includes("Cart")
      );
      // open the tooltip for each latest crew pos
      if (latestCrewPosMarkerWithEv1) {
        const crewPosMarker = getMapItemByUuid(latestCrewPosMarkerWithEv1.uuid) as AEGISMarker;
        if (crewPosMarker) crewPosMarker.openTooltip();
      }
      if (latestCrewPosMarkerWithEv2) {
        const crewPosMarker = getMapItemByUuid(latestCrewPosMarkerWithEv2.uuid) as AEGISMarker;
        if (crewPosMarker) crewPosMarker.openTooltip();
      }
      if (latestCrewPosMarkerWithCart) {
        const crewPosMarker = getMapItemByUuid(latestCrewPosMarkerWithCart.uuid) as AEGISMarker;
        if (crewPosMarker) crewPosMarker.openTooltip();
      }
    }
  }, [rexPetTime, getMapItemByUuid, crewPosToShow, mapDisplayCrewPos]);

  /**
   * Draw or update hover timeline marker (astronaut) on the map when the hover seconds change.
   */
  useEffect(() => {
    (async () => {
      if (!map.current || mapDirective) return;

      //search for marker on the map
      const existingLayer = getMapItemByUuid("hover-marker-uuid") as AEGISMarker;

      //hoverSeconds is null meaning we're not hovering.
      if (!hover.evaSecondsElapsed || !selectedEva) {
        //Also remove the marker from map if exists
        if (existingLayer) map.current.removeLayer(existingLayer);
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
          <div className={styles.mapIcon}>{decodeEmoji("1f468-200d-1f680")}</div>
        );
        const icon = L.divIcon({ html });

        if (isNaN(location.lat) || isNaN(location.lng)) return;
        //if exists, set location
        if (existingLayer) {
          existingLayer.setLatLng(location as L.LatLng);
          existingLayer.setIcon(icon);
        } else {
          //marker doesn't exist, draw it and add it to leaflet
          const marker = L.marker(location as AEGISPoint, {
            icon,
          }) as AEGISMarker;
          marker.uuid = "hover-marker-uuid";
          marker.mapItemType = "hover";
          marker.setZIndexOffset(2000);

          map.current.addLayer(marker);
        }
      }
    })();
  }, [hover, getMapItemByUuid, mapDirective, selectedEva, dispatch, mission.planetRadius]);

  const removeSelectedMarker = useCallback(() => {
    // remove any existing highlight layers
    map.current.eachLayer((layer: AEGISCircleMarker) => {
      if (layer?.mapItemType === "selected") {
        map.current.removeLayer(layer);
      }
    });
  }, [map]);

  const drawSelectedMarker = useCallback(
    (highlightLocation: AEGISPoint) => {
      if (!showSelectedItemOnMap) return;
      if (isNaN(highlightLocation.lat) || isNaN(highlightLocation.lng)) return;

      const latLng = new L.LatLng(highlightLocation.lat, highlightLocation.lng);

      // create a circle marker that is a white dotted stroke with no fill
      const marker = L.circleMarker(latLng, {
        radius: 25,
        color: "#ffffff",
        stroke: true,
        weight: 1,
        opacity: 1,
        fill: false,
        dashArray: "5, 5",
      }) as AEGISCircleMarker;
      marker.mapItemType = "selected";
      marker.bringToBack();

      map.current.addLayer(marker);
    },
    [map, showSelectedItemOnMap]
  );

  /**
   * Monitor map item selection and draw selected layer on the map
   */
  useEffect(() => {
    const handler = async () => {
      if (!map.current) return;

      removeSelectedMarker();

      if (!showSelectedItemOnMap) return;

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
        if (seqItemRes.payload !== false) {
          const seqItem = seqItemRes.payload;
          if (seqItem.type === "traverse") {
            panMapToLocation = getMidpoint((seqItem.item as Traverse).path);
          } else if (seqItem.type === "station") {
            const selectedStation = seqItem.item as Station;
            highlightLocation = selectedStation.location;
            panMapToLocation = selectedStation.location;
          }
        }
      } else if (
        sectionSelected === "rex" &&
        selectedOrRunningRex?.crewPos &&
        selectedCrewPosUuid
      ) {
        const crewPosLocation = selectedOrRunningRex.crewPos.find(
          (c) => c.uuid === selectedCrewPosUuid
        )?.location;
        highlightLocation = crewPosLocation;
        panMapToLocation = crewPosLocation;
      }

      if (highlightLocation) {
        drawSelectedMarker(highlightLocation);
      }

      if (panMapToLocation && mapDirective === null) {
        if (isNaN(panMapToLocation.lat) || isNaN(panMapToLocation.lng)) return;
        if (!map.current.getBounds().contains(panMapToLocation)) {
          map.current.panTo(panMapToLocation);
        }
      }
    };
    handler();
  }, [
    map,
    selectedPoi,
    selectedStation,
    dispatch,
    showSelectedItemOnMap,
    sectionSelected,
    removeSelectedMarker,
    drawSelectedMarker,
    mapDirective,
    selectedEvaSequenceItemUuid,
    selectedCrewPosUuid,
    selectedOrRunningRex,
  ]);

  /**
   * if selected marker changes, then show the highlight on the map
   */
  useEffect(() => {
    if (selectedPoi || selectedStation || selectedCrewPosUuid) {
      setShowSelectedItemOnMap(true);
    }
  }, [selectedPoi, selectedStation, selectedCrewPosUuid]);

  /**
   * If hover uuid changes, show a hover highlight on the map
   * This is the hover on item
   */
  useEffect(() => {
    // remove hoverMarker layer
    // remove any existing highlight layers
    map.current.eachLayer((layer: AEGISCircleMarker | AEGISPolyline) => {
      if (layer?.mapItemType === "hover") {
        map.current.removeLayer(layer);
      }
    });

    if (mapHoverItemUuid) {
      // search for this item on the map to get the lat lng
      let latLngs: L.LatLng[] = [];
      map.current.eachLayer((layer: AEGISMapDrawingLayer) => {
        if (
          layer?.uuid === mapHoverItemUuid &&
          (layer.mapItemType === "poi" ||
            layer.mapItemType === "station" ||
            layer.mapItemType === "crewPos")
        ) {
          const markerLayer = layer as AEGISMarker;
          latLngs.push(markerLayer.getLatLng());
        } else if (layer?.uuid === mapHoverItemUuid && layer.mapItemType === "traverse") {
          const polylineLayer = layer as AEGISPolyline;
          latLngs = polylineLayer.getLatLngs() as L.LatLng[];
        }
      });
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
        map.current.addLayer(marker);
      } else if (latLngs.length > 1) {
        //highlight polylines (aka traverses)
        const polyline = L.polyline(latLngs, {
          color: "#ffffff",
          weight: 3,
          opacity: 1,
          smoothFactor: 1,
        }) as AEGISPolyline;
        polyline.mapItemType = "hover";
        polyline.bringToFront();
        map.current.addLayer(polyline);
      }
    }
  }, [mapHoverItemUuid]);

  return (
    <div className={styles.mapContainer}>
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
          mapDisplayCrewPos={mapDisplayCrewPos}
          setMapDisplayCrewPos={setMapDisplayCrewPos}
        />
      </div>
      {sectionSelected === "rex" && selectedOrRunningRex && <MapCrewPositionMenu />}
      <div className={styles.mapScaleDisplay}>{drawScaleBarDiv()}</div>
      <div className={styles.mapPositionDisplay}>{drawLatLongDiv()}</div>
    </div>
  );
};

export default MapBody;

const isLayerOnMapByName = (map: MutableRefObject<L.Map>, name: string) => {
  let layerFound = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map.current.eachLayer((layer: any) => {
    if (layer.options.id === name) layerFound = true;
  });
  return layerFound;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getLayerByName = (map: MutableRefObject<L.Map>, name: string): any => {
  let returnVal = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map.current.eachLayer((layer: any) => {
    if (layer.options.id === name) returnVal = layer;
  });
  return returnVal;
};
