import * as L from "leaflet";
L.Icon.Default.imagePath = "/leaflet/images/";
// Import the plugin libraries so they will modify L
import "leaflet.tilelayer.colorfilter";
import { HighlightablePolyline } from "leaflet-highlightable-layers";
import DraggableLines from "leaflet-draggable-lines";
import { antPath } from "leaflet-ant-path";
import "proj4leaflet";

import styles from "components/interface/map-body.module.css";

import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";

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
import { setSelectedPoiUuid, updatePoiLocation } from "store/poi";
import { setSectionSelected } from "store/interface";
import {
  deleteStationWalkbackElevation,
  revertWalkbackPath,
  setSelectedStationUuid,
} from "store/station";
import { setSelectedEvaSequenceItemUuid } from "store/eva";
import { deleteTraverseElevation, revertTraversePath } from "store/traverse";
import {
  convertLeafletLatLngsToAegisPoints,
  convertLeafletLatLngToAegisPoint,
  getDistanceBetweenTwoCoordinates,
} from "utils/geoMath";
import { decodeEmoji } from "utils/formatting";
import { Checkbox } from "./_global-elements";
import {
  setLeftPanelHoverUuid,
  setMapItemHoverUuid,
  setTimelineHoverUuid,
} from "store/playheadHover";
import {
  thunkUpdateStationLocation,
  thunkFullUpdateWalkbackPath,
  thunkUpdateWalkbackPath,
} from "store/thunk/thunkStation";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkFullUpdateTraversePath, thunkUpdateTraversePath } from "store/thunk/thunkTraverse";

// const center = [51.505, -0.09] as L.LatLngExpression; // London
const center = [64.833445, -16.378351] as L.LatLngExpression; // Iceland
const zoom = 13;

const layerBaseURL = "/static/missionFiles";

const MapBody: FunctionComponent = () => {
  const dispatch = useDispatch();
  const appDispatch = useAppDispatch();
  const mapRef = useRef(null);
  const map = useRef<L.Map>(null);
  const crs = useRef<L.Proj.CRS>(null);
  const draggableLines: MutableRefObject<DraggableLines> = useRef(null);
  const stationFeatureGroup = useRef<L.FeatureGroup>(null);
  const poiFeatureGroup = useRef<L.FeatureGroup>(null);

  const mission = useAppSelector((state) => state.mission.mission, shallowEqual);
  const missionLayers = useAppSelector((state) => state.mission.layers, shallowEqual);

  const rightPanelOpen = useAppSelector((state) => state.interface.rightPanelOpen, shallowEqual);

  const layerControls = useAppSelector((state) => state.map.layerControls, shallowEqual);
  const mapDirective = useAppSelector((state) => state.map.mapDirective, shallowEqual);

  const pois = useAppSelector((state) => state.poi.pois, shallowEqual);
  const selectedPoi = useAppSelector(
    (state) => state.poi.pois.find((poi) => poi.uuid === state.poi.selectedPoiUuid),
    refEqual
  );
  const stations = useAppSelector((state) => state.station.stations, shallowEqual);
  const selectedStation = useAppSelector(
    (state) =>
      state.station.stations.find((station) => station.uuid === state.station.selectedStationUuid),
    refEqual
  );

  const selectedEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid),
    refEqual
  );

  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const playheadHover = useAppSelector((state) => state.playheadHover, shallowEqual); //astronaut hover timeline

  const traverses = useAppSelector((state) => state.traverse.traverses, shallowEqual);
  const sectionSelected = useAppSelector((state) => state.interface.sectionSelectedLabel, refEqual);

  const mapHoverItemUuid = useAppSelector((state) => state.playheadHover.mapItemUuid, refEqual);

  const [layersOnMap, setLayersOnMap] = useState([]);
  const [showSelectedItemOnMap, setShowSelectedItemOnMap] = useState(false); //click selected items

  const [poisToShow, setPoisToShow] = useState<POI[]>([]);
  const [stationsToShow, setStationsToShow] = useState<Station[]>([]);
  const [traversesToShow, setTraversesToShow] = useState<Traverse[]>([]);
  const [showAllPois, setShowAllPois] = useState(true);
  const [showAllStations, setShowAllStations] = useState(true);

  const [scale, setScale] = useState(0);
  const [mapZoom, setMapZoom] = useState(0); // value used to show correct scale bar

  // make color filter settings for any sublayer. This is the format of leaflet.tilelayer.colorfilter package
  const makeLayerColorFilter = (lControls: LayerControls, sublayerName: string): string[] => {
    return [
      `brightness:${
        lControls[sublayerName].style?.brightness
          ? lControls[sublayerName].style?.brightness * 100
          : 100
      }%`,
      `contrast:${
        lControls[sublayerName].style?.contrast
          ? lControls[sublayerName].style?.contrast * 100
          : 100
      }%`,
      `opacity:${
        lControls[sublayerName].style?.opacity ? lControls[sublayerName].style?.opacity * 100 : 100
      }%`,
      `saturate:${
        lControls[sublayerName].style?.saturation
          ? lControls[sublayerName].style?.saturation * 100
          : 100
      }%`,
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
   * Map tile layers display management
   */
  useEffect(() => {
    if (!mission || !layerControls || !map.current) return;

    // go through all layers in mission config and add make a list of the ones that are enabled
    const layersToAdd: Sublayer[] = [];
    for (const configLayer of missionLayers) {
      for (const configSublayer of configLayer.layerConfig.sublayers) {
        if (configSublayer.type === "tile") {
          if (layerControls[configSublayer.name].enabled) {
            layersToAdd.push(configSublayer);
          }
        }
      }
    }
    // reverse the array to add the ones at the bottom of the tree first
    const layersToAddInOrder = layersToAdd.reverse();

    // if there are no changes to the layers enabled, do nothing
    if (_.isEqual(layersToAddInOrder, layersOnMap)) {
      return;
    } else {
      setLayersOnMap(layersToAddInOrder);
    }

    // remove map layers that are not enabled in layerControls
    map.current.eachLayer((layer) => {
      if ((layer as L.TileLayer).options.id) {
        if (!layerControls[(layer as L.TileLayer).options.id].enabled) {
          map.current.removeLayer(layer);
        }
      }
    });

    // check map layers in order
    layersToAddInOrder.map((configSublayer, index) => {
      // if layer isn't already on the map, add it
      if (!isLayerOnMapByName(map, configSublayer.name)) {
        const filter = makeLayerColorFilter(layerControls, configSublayer.name);
        const tileLayer = (L.tileLayer as any).colorFilter(
          `${layerBaseURL}/${mission.id}/Layers/${configSublayer.aegisURL}`,
          {
            tileSize: 256,
            bounds: [
              [configSublayer.boundingBox[1], configSublayer.boundingBox[0]],
              [configSublayer.boundingBox[3], configSublayer.boundingBox[2]],
            ],
            tms: configSublayer.tileformat === "tms",
            minZoom: 1,
            minNativeZoom: configSublayer.minZoom,
            maxZoom: configSublayer.maxZoom,
            maxNativeZoom: configSublayer.maxNativeZoom,
            id: `${configSublayer.name}`,
            opacity: layerControls[configSublayer.name].style?.opacity,
            zIndex: index,
            filter,
          }
        );
        map.current.addLayer(tileLayer);
        tileLayer.bringToFront();
      } else {
        // if layer is already on the map, bring it to the front. This has the effect of controlling zorder of layers
        const layer = getLayerByName(map, configSublayer.name);
        layer.bringToFront();
      }
    });
  }, [mission, layerControls, map, layersOnMap, missionLayers]);

  /**
   * Update map with opacity value for sublayers as sliders are moved
   */
  useEffect(() => {
    if (!map.current || !layerControls) return;
    map.current.eachLayer((layer) => {
      for (const layerControl of Object.values(layerControls)) {
        if ((layer as L.TileLayer).options.id === layerControl.name) {
          (layer as L.TileLayer).updateFilter(
            makeLayerColorFilter(layerControls, layerControl.name)
          );
        }
      }
    });
  }, [layerControls, map]);

  /**
   * Get the map item by uuid
   * Optionally provide a test for mapItemType as well
   */
  const getMapItemByUuid = useCallback(
    (uuid: string, mapItemType?: MapItemType): AEGISMarker | AEGISPolyline => {
      let itemToSave: AEGISMarker | AEGISPolyline = null;

      map.current.eachLayer((layer: AEGISMarker | AEGISPolyline) => {
        if (layer.uuid === uuid) {
          if (mapItemType && layer.mapItemType !== mapItemType) return null;
          itemToSave = layer;
        }
      });
      return itemToSave;
    },
    [map]
  );

  /**
   * Update scale bar value
   */
  useEffect(() => {
    if (!mission || !map.current) return;

    const center = map.current.getCenter();
    const pointC = map.current.latLngToContainerPoint(center);
    const pointX: L.PointExpression = [pointC.x + 100, pointC.y];
    const latLngC = map.current.containerPointToLatLng(pointC);
    const latLngX = map.current.containerPointToLatLng(pointX);
    const distance = getDistanceBetweenTwoCoordinates(
      convertLeafletLatLngToAegisPoint(latLngC),
      convertLeafletLatLngToAegisPoint(latLngX),
      parseFloat(mission.config.msv.radius.minor)
    );
    setScale(distance);
  }, [mission, map, mapZoom]);

  /**
   * Draw scale bar div
   */
  const drawScaleBarDiv = useCallback(() => {
    if (!mission || !map.current) return;

    // size scale bar to the nearest 50m, 100m, 500m, 1km, 5km, 10km, 50km, 100km, 500km, 1000km
    const nearestRoundNum = Math.ceil(scale / 100) * 100;
    // scale / 100 = nearestRoundNum / x
    const scaleBarSize = nearestRoundNum / (scale / 100);

    return (
      <>
        {scaleBarSize < 500 ? (
          <div className={styles.scaleValue} style={{ width: scaleBarSize }}>
            {nearestRoundNum}m
          </div>
        ) : (
          <div className={styles.scaleValue} style={{ width: 100 }}>
            {scale.toFixed(3)} m
          </div>
        )}
      </>
    );
  }, [mission, map, scale]);

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
    }: {
      name: string;
      uuid: string;
      iconEmoji: string;
      location: AEGISPoint;
      mapItemType: MapMarkerType;
      onClick?: Function;
      onDragEnd?: Function;
    }) => {
      const html = `<div class="leaflet-aegis-icon">${decodeEmoji(iconEmoji)}</div>`;
      const icon = L.divIcon({ html });

      let typeName = "";
      switch (mapItemType) {
        case "poi":
          typeName = "POI";
          break;
        case "station":
          typeName = "Station";
          break;
      }

      const existingLayer = getMapItemByUuid(uuid, mapItemType) as AEGISMarker;

      if (existingLayer && existingLayer.mapItemType === mapItemType) {
        existingLayer.setLatLng(location as L.LatLng);
        existingLayer.setIcon(icon);
      } else {
        const marker = L.marker(location as AEGISPoint, {
          icon,
        }) as AEGISMarker;
        marker.uuid = uuid;
        marker.mapItemType = mapItemType;

        // marker handlers
        marker.bindTooltip(`${name} ${typeName}`, {
          sticky: true,
          direction: "top",
          offset: new L.Point(0, -20),
        });
        if (onClick) {
          marker
            .on("click", () => {
              onClick();
            })
            .on("mouseover", () => {
              dispatch(setLeftPanelHoverUuid(marker.uuid));
              dispatch(setTimelineHoverUuid(marker.uuid));
              dispatch(setMapItemHoverUuid(marker.uuid));
            })
            .on("mouseout", () => {
              dispatch(setLeftPanelHoverUuid(null));
              dispatch(setTimelineHoverUuid(null));
              dispatch(setMapItemHoverUuid(null));
            });
        }
        if (onDragEnd) {
          // dragend handler that causes edit to be saved on mouseup
          marker.on("dragend", (e) => {
            map.current.getContainer().style.cursor = "grab";
            onDragEnd(e.target as AEGISMarker);
          });
        }

        if (typeName === "Station") {
          marker.setZIndexOffset(1000);
          stationFeatureGroup.current.addLayer(marker);
        } else if (typeName === "Poi") {
          poiFeatureGroup.current.addLayer(marker);
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

      const typeName = mapItemType.charAt(0).toUpperCase() + mapItemType.slice(1);

      const polyline = new HighlightablePolyline(path as AEGISPoint[], {
        color: color,
        weight: 3,
        dashArray: dashArray,
        opacity: 0.5,
        smoothFactor: 1,
        outlineColor: "#8b8680",
        raised: false,
      }) as any; //TODO: figure out the weird HighlightablePolyline typescript implementation
      polyline.uuid = uuid;
      polyline.mapItemType = mapItemType;

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
          dispatch(setLeftPanelHoverUuid(polyline.uuid));
          dispatch(setTimelineHoverUuid(polyline.uuid));
          dispatch(setMapItemHoverUuid(polyline.uuid));
        })
        .on("mouseout", () => {
          dispatch(setLeftPanelHoverUuid(null));
          dispatch(setTimelineHoverUuid(null));
          dispatch(setMapItemHoverUuid(null));
        });

      map.current.addLayer(polyline);

      if (drawAntPath) {
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
    [map, dispatch]
  );

  const saveUpdatedPoiOrStationPosition = useCallback(
    async (uuid: string, mapItemType: MapItemType, location: AEGISPoint) => {
      if (mapItemType === "poi") {
        dispatch(updatePoiLocation({ uuid, location }));
      } else if (mapItemType === "station") {
        await appDispatch(thunkUpdateStationLocation({ location, stationUuid: uuid }));
      }
    },
    [dispatch, appDispatch]
  );

  /**
   * Map instantiation
   */
  useLayoutEffect(() => {
    if (!mapRef.current || !map || !mission.config) return;

    // instantiate the prog4leaflet crs using the values in the mission config
    if (mission.config.projection.custom === true) {
      const baseRes =
        mission.config.projection.resunitsperpixel *
        Math.pow(2, mission.config.projection.reszoomlevel);

      const resolutions = [];
      for (let i = 0; i < 32; i++) {
        resolutions.push(baseRes / Math.pow(2, i));
      }

      crs.current = new L.Proj.CRS(
        Number.isFinite(parseInt(mission.config.projection.epsg[0]))
          ? `EPSG:${mission.config.projection.epsg}`
          : mission.config.projection.epsg,
        mission.config.projection.proj,
        {
          origin: [
            parseFloat(mission.config.projection.origin[0]),
            parseFloat(mission.config.projection.origin[1]),
          ],
          resolutions,
          bounds: L.bounds(
            [
              parseFloat(mission.config.projection.bounds[0]),
              parseFloat(mission.config.projection.bounds[1]),
            ],
            [
              parseFloat(mission.config.projection.bounds[2]),
              parseFloat(mission.config.projection.bounds[3]),
            ]
          ),
        }
      );
    }

    // Instantiate the map
    if (!map.current) {
      // debugger;
      map.current = L.map(mapRef.current, {
        center: center,
        zoom: zoom,
        zoomDelta: 0.05,
        zoomSnap: 0,
        fadeAnimation: true,
      });
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
    }
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [mapRef, map, draggableLines, mission]);

  /**
   * Set the center of the map to the center of the selected mission (config.msv.view)
   */
  useEffect(() => {
    if (!map.current || !mission) return;
    const config = mission?.config;

    const center = [+config?.msv?.view[0], +config?.msv?.view[1]] as L.LatLngExpression;
    const zoom = +config?.msv?.view[2];
    map.current.setView(center, zoom);
  }, [mission, map]);

  /**
   * Map event listeners, redefined when state values changes via useEffect to allow their functions to access the latest state values
   */
  useEffect(() => {
    if (!map.current) return;

    map.current.on("click", (e) => {
      // if user is creating or updating a new poi or station, use the click update the location of the new poi/station

      if (
        (mapDirective?.mapItemType === "station" || mapDirective?.mapItemType === "poi") &&
        (mapDirective?.mapAction === "editMarker" || mapDirective?.mapAction === "createMarker")
      ) {
        saveUpdatedPoiOrStationPosition(
          mapDirective?.uuid,
          mapDirective.mapItemType,
          convertLeafletLatLngToAegisPoint(e.latlng)
        );

        // reset the map directive
        dispatch(updateMapDirective(null));
        // set the mouse cursor back to the default
        map.current.getContainer().style.cursor = "grab";
      }
    });

    map.current.on("zoomend", () => {
      setMapZoom(map.current.getZoom());
    });

    return () => {
      if (map.current) {
        map.current.off("click");
      }
    };
  }, [map, mapDirective, saveUpdatedPoiOrStationPosition, dispatch]);

  /**
   * Listen for mapDirective for stations, pois, and traverses, and trigger map draw/edit modes appropriately
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
                await appDispatch(
                  thunkUpdateTraversePath({
                    path,
                    traverseUuid: mapDirective.uuid,
                  })
                );
              } else {
                //update path, elevation, and snap endpoints
                const response = await appDispatch(
                  thunkFullUpdateTraversePath({
                    path,
                    traverseUuid: mapDirective.uuid,
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
                await appDispatch(
                  thunkUpdateWalkbackPath({
                    path,
                    stationUuid: mapDirective.uuid,
                  })
                );
              } else {
                //update path, elevation, and snap endpoints
                const response = await appDispatch(
                  thunkFullUpdateWalkbackPath({
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

          draggableLines.current.on("dragstart", (e) => {
            if (e.layer.mapItemType === "traverse") {
              dispatch(deleteTraverseElevation(e.layer.uuid));
            }
            if (e.layer.mapItemType === "walkback") {
              dispatch(deleteStationWalkbackElevation(e.layer.uuid));
            }
          });

          draggableLines.current.on(
            "drag",
            _.throttle((e) => {
              dispatchPath(e, false);
            }, 15)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    map,
    mission.config.msv.radius.minor,
    draggableLines,
    mapDirective,
    dispatch,
    getMapItemByUuid,
  ]);

  /**
   * Populate stationsToShow when stations or selections change
   */
  useEffect(() => {
    if (!stations) return;
    if (showAllStations) {
      setStationsToShow(stations);
    } else if (selectedStation) {
      setStationsToShow([selectedStation]);
    } else if (selectedEva) {
      const stationSequenceItems = selectedEva.sequence.filter((item) => item.type === "station");
      const stationsInEva = stations.filter((station) =>
        stationSequenceItems.find((item) => item.uuid === station.uuid)
      );
      setStationsToShow(stationsInEva);
    } else {
      setStationsToShow([]);
    }
  }, [stations, selectedStation, selectedEva, showAllStations]);

  /**
   * Populate POIs to show when POIs or selections change
   */
  useEffect(() => {
    if (!pois) return;
    if (showAllPois) {
      setPoisToShow(pois);
    } else if (selectedPoi) {
      setPoisToShow([selectedPoi]);
    } else {
      setPoisToShow([]);
    }
  }, [pois, selectedPoi, showAllPois]);

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
   * Draw or update lander
   */
  useEffect(() => {
    if (!map.current || mapDirective || !mission.landerLocation) return;

    drawOrUpdateMarkerOnMap({
      name: "Lander",
      uuid: mission.id.toString(),
      iconEmoji: "1F315",
      mapItemType: "lander",
      location: mission.landerLocation,
    });
  }, [map, mapDirective, mission.landerLocation, drawOrUpdateMarkerOnMap, mission.id]);

  /**
   * Draw or update POIs on the map when pois change. Serves as draw when page loads
   */
  useEffect(() => {
    if (!map.current || mapDirective) return;

    // delete all poi in leaflet
    poiFeatureGroup.current.clearLayers();

    // draw or update all pois
    poisToShow.forEach((poi) => {
      if (poi.location) {
        drawOrUpdateMarkerOnMap({
          name: poi.name,
          uuid: poi.uuid,
          iconEmoji: poi.icon ? poi.icon : "1F3F4",
          mapItemType: "poi",
          location: poi.location,
          onClick: () => {
            setShowSelectedItemOnMap(true);
            dispatch(setSectionSelected("poi"));
            dispatch(setSelectedPoiUuid(poi.uuid));
          },
          onDragEnd: (marker: AEGISMarker) => {
            const newLocation = convertLeafletLatLngToAegisPoint(marker.getLatLng());
            saveUpdatedPoiOrStationPosition(poi.uuid, "poi", newLocation);
            dispatch(updateMapDirective(null));
          },
        });
      }
    });
  }, [
    map,
    mapDirective,
    drawOrUpdateMarkerOnMap,
    saveUpdatedPoiOrStationPosition,
    dispatch,
    poisToShow,
  ]);

  /**
   * Draw stationsToShow on the map when stations or selections change. Linked to checkbox at top of map.
   */
  useEffect(() => {
    if (!map.current || mapDirective) return;
    if (!stationsToShow) return;

    // remove all stations from the map
    stationFeatureGroup.current.clearLayers();

    // draw all stations
    stationsToShow.forEach((station) => {
      if (station.location) {
        drawOrUpdateMarkerOnMap({
          name: station.name,
          uuid: station.uuid,
          iconEmoji: station.icon,
          mapItemType: "station",
          location: station.location,
          onClick: () => {
            setShowSelectedItemOnMap(true);
            dispatch(setSectionSelected("station"));
            dispatch(setSelectedStationUuid(station.uuid));
          },
          onDragEnd: (marker: AEGISMarker) => {
            const newLocation = convertLeafletLatLngToAegisPoint(marker.getLatLng());
            saveUpdatedPoiOrStationPosition(station.uuid, "station", newLocation);
            dispatch(updateMapDirective(null));
          },
        });
      }
    });

    stationFeatureGroup.current.setZIndex(999);
  }, [
    map,
    mapDirective,
    drawOrUpdateMarkerOnMap,
    saveUpdatedPoiOrStationPosition,
    dispatch,
    stationsToShow,
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
  }, [map, selectedStation, mapDirective, drawPolylineOnMap, dispatch]);

  /**
   * Draw or update traverses on the map when selections or traverses change. Serves as draw when page loads
   */
  useEffect(() => {
    if (!map.current) return;
    // abort if there is an active map action ongoing
    if (mapDirective) return;

    if (traversesToShow) {
      // delete all traverses from the map
      map.current.eachLayer((layer: AEGISMapLayer) => {
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
            dispatch(setSelectedEvaSequenceItemUuid(traverse.uuid));
          },
          color: "blue",
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
  ]);

  /**
   * Draw or update hover timeline marker (astronaut) on the map when the hover seconds change.
   */
  useEffect(() => {
    if (!map.current || mapDirective) return;

    //search for marker on the map
    const existingLayer = getMapItemByUuid("hover-marker-uuid") as AEGISMarker;

    //hoverSeconds is null meaning we're not hovering.
    if (!playheadHover.evaSecondsElapsed || !selectedEva) {
      //Also remove the marker from map if exists
      if (existingLayer) map.current.removeLayer(existingLayer);
      return;
    }

    //find where this point should be drawn on the eva
    let location: AEGISPoint = { lat: 0, lng: 0 };

    const sequenceItem = selectedEva.sequence.find(
      (seqItem) => seqItem.uuid === playheadHover.mapItemUuid
    );
    if (sequenceItem) {
      if (sequenceItem.type === "station") {
        location = stations.find((station) => station.uuid === sequenceItem.uuid).location;
      } else if (sequenceItem.type === "traverse") {
        const traverse = traverses.find((traverse) => traverse.uuid === sequenceItem.uuid);

        //how far (in distance) are we along the entire traverse. Ex: 5m into a 25m traverse
        const cumulativeCurrentDistance =
          traverse.pathSegmentDistances.reduce(
            (accumulator, currentValue) => accumulator + currentValue,
            0
          ) * playheadHover.sequenceItemPercentElapsed;
        //determine which segment we are in
        let cumulativePrevSegDistances = 0;
        for (let i = 0; i < traverse.pathSegmentDistances.length; i++) {
          if (
            cumulativePrevSegDistances + traverse.pathSegmentDistances[i] >
            cumulativeCurrentDistance
          ) {
            //we are in this segment
            const percentSegmentDistance =
              (cumulativeCurrentDistance - cumulativePrevSegDistances) /
              traverse.pathSegmentDistances[i];
            const lat =
              traverse.path[i].lat +
              (traverse.path[i + 1].lat - traverse.path[i].lat) * percentSegmentDistance;
            const lng =
              traverse.path[i].lng +
              (traverse.path[i + 1].lng - traverse.path[i].lng) * percentSegmentDistance;
            location = { lat, lng };
            break;
          } else {
            cumulativePrevSegDistances += traverse.pathSegmentDistances[i];
          }
        }
      }

      const html = `<div class="leaflet-aegis-icon">${decodeEmoji("1f468-200d-1f680")}</div>`;
      const icon = L.divIcon({ html });
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

        map.current.addLayer(marker);
      }
    }
  }, [playheadHover, getMapItemByUuid, mapDirective, selectedEva, stations, traverses]);

  /**
   * Monitor map item highlights and draw highlight layer on the map
   */
  useEffect(() => {
    if (!map.current) return;

    // remove any existing highlight layers
    map.current.eachLayer((layer: AEGISCircleMarker) => {
      if (layer?.mapItemType === "selected") {
        map.current.removeLayer(layer);
      }
    });

    if (!showSelectedItemOnMap) return;

    let highlightLocation: AEGISPoint = null;
    if (sectionSelected === "poi" && selectedPoi?.location) {
      // highlight selectedPpo if the poi section is selected
      highlightLocation = selectedPoi.location;
    } else if (selectedStation?.location) {
      highlightLocation = selectedStation.location;
    }

    if (highlightLocation) {
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
    }
  }, [map, selectedPoi, selectedStation, dispatch, showSelectedItemOnMap, sectionSelected]);

  /**
   * if selected Poi or Station changes, then show the highlight on the map
   */
  useEffect(() => {
    if (selectedPoi || selectedStation) {
      setShowSelectedItemOnMap(true);
    }
  }, [selectedPoi, selectedStation]);

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
      map.current.eachLayer((layer: AEGISMapLayer) => {
        if (
          layer?.uuid === mapHoverItemUuid &&
          (layer.mapItemType === "poi" || layer.mapItemType === "station")
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
      <div className={styles.map} ref={mapRef} />

      <div className={styles.mapDisplayControls}>
        <div className={styles.controlsContainer}>
          <div className={styles.control}>
            <div className={styles.controlCheckbox}>
              <Checkbox
                checked={showAllPois}
                onChange={(e) => {
                  setShowAllPois(e.target.checked);
                }}
              />
            </div>
            <div className={styles.controlTitle}>All POIs</div>
          </div>
          <div className={styles.control}>
            <div className={styles.controlCheckbox}>
              <Checkbox
                checked={showAllStations}
                onChange={(e) => {
                  setShowAllStations(e.target.checked);
                }}
              />
            </div>
            <div className={styles.controlTitle}>All Stations</div>
          </div>
        </div>
      </div>

      <div className={styles.mapScaleDisplay}>{drawScaleBarDiv()}</div>
    </div>
  );
};

export default MapBody;

const isLayerOnMapByName = (map: MutableRefObject<any>, name: string) => {
  let layerFound = false;
  map.current.eachLayer((layer) => {
    if (layer.options.id === name) layerFound = true;
  });
  return layerFound;
};

const getLayerByName = (map: MutableRefObject<any>, name: string) => {
  let returnVal = null;

  map.current.eachLayer((layer) => {
    if (layer.options.id === name) returnVal = layer;
  });
  return returnVal;
};
