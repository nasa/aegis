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
// import { updateEvaItemLocation } from "store/eva";
import { updateMapDirective } from "store/map";
import { setSelectedPoiUuid, updatePoiLocation } from "store/poi";
import { setSectionSelected } from "store/interface";
import {
  revertWalkbackLocationAndDistance,
  setSelectedStationUuid,
  updateStationLocation,
  updateWalkbackLocationAndDistance,
} from "store/station";
import { setSelectedEvaRightNavItem, setSelectedEvaSequenceItemUuid } from "store/eva";
import {
  revertTraverseLocationAndDistance,
  updateTraverseLocationAndDistance,
} from "store/traverse";
import {
  convertLeafletLatLngsToAegisPoints,
  convertLeafletLatLngToAegisPoint,
  getTotalDistance,
} from "utils/geoMath";
import { decodeEmoji } from "utils/formatting";

// import { upsertTraverse } from "store/traverse";
// import { setSelectedEvaSequenceItemUuid } from "store/eva";

// const center = [51.505, -0.09] as L.LatLngExpression; // London
const center = [64.833445, -16.378351] as L.LatLngExpression; // Iceland
const zoom = 13;

const layerBaseURL = process.env.NEXT_PUBLIC_LAYER_BASE_URL;

const MapBody: FunctionComponent = () => {
  const dispatch = useDispatch();
  const mapRef = useRef(null);
  const map = useRef(null);
  const crs = useRef(null);
  const draggableLines = useRef(null);

  const mission = useAppSelector((state) => state.mission.mission, shallowEqual);
  const missionLayers = useAppSelector((state) => state.mission.layers, shallowEqual);
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

  const traverses = useAppSelector((state) => state.traverse.traverses, shallowEqual);
  const sectionSelected = useAppSelector((state) => state.interface.sectionSelectedLabel, refEqual);

  const [layersOnMap, setLayersOnMap] = useState([]);
  const [showHightlightOnMap, setShowHighlightOnMap] = useState(false);

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
   * Map tile layers display management
   */
  useEffect(() => {
    if (!mission || !layerControls || !map.current) return;

    // go through all layers in mission config and add make a list of the ones that are enabled
    const layersToAdd: MMGIS_Sublayer[] = [];
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
      if (layer.options.id) {
        if (!layerControls[layer.options.id].enabled) {
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
          `${layerBaseURL}${mission.name}/${configSublayer.url}`,
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
        if (layer.options.id === layerControl.name) {
          layer.updateFilter(makeLayerColorFilter(layerControls, layerControl.name));
        }
      }
    });
  }, [layerControls, map]);

  const getMapItemByUuid = useCallback(
    (uuid: string, mapItemType: MapItemType): AEGISMapLayer => {
      let itemToSave: AEGISMapLayer = null;
      map.current.eachLayer((layer: AEGISMapLayer) => {
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
   * Draw or update markers on the map
   */
  const drawOrUpdateMarkerOnMap = useCallback(
    ({
      uuid,
      iconEmoji,
      location,
      mapItemType,
      onClick = () => {},
      onDraggend = () => {},
    }: {
      uuid: string;
      iconEmoji: string;
      location: AEGISPoint;
      mapItemType: "poi" | "station";
      onClick?: Function;
      onDraggend?: Function;
    }) => {
      const html = `<div class="leaflet-aegis-icon">${decodeEmoji(iconEmoji)}</div>`;
      const icon = L.divIcon({ html });

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
        marker.on("click", () => {
          onClick();
        });

        // dragend handler that causes edit to be saved on mouseup
        marker.on("dragend", (e) => {
          map.current.getContainer().style.cursor = "grab";
          onDraggend(e.target as AEGISMarker);
        });

        map.current.addLayer(marker);
      }
    },
    [map, getMapItemByUuid]
  );

  /**
   * Draw or update polylines on the map
   */
  const drawOrUpdatePolylineOnMap = useCallback(
    ({
      uuid,
      location,
      mapItemType,
      color,
      dashArray,
      onClick,
      drawAntPath,
    }: {
      uuid: string;
      location: AEGISPoint[];
      onClick?: Function;
      color: string;
      dashArray?: string;
      mapItemType: "traverse" | "antPath" | "walkback";
      drawAntPath: boolean;
    }) => {
      // if the location isn't the null default, draw it on the map
      if (
        !Array.isArray(location) ||
        !location[0]?.lat ||
        !location[0]?.lng ||
        !location[location.length - 1]?.lat ||
        !location[location.length - 1]?.lng
      )
        return;

      const existingLayer = getMapItemByUuid(uuid, mapItemType) as AEGISPolyline;

      if (existingLayer && existingLayer.mapItemType === mapItemType) {
        existingLayer.setLatLngs(location);
      } else {
        const polyline = new HighlightablePolyline(location as AEGISPoint[], {
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
        polyline.on("click", () => {
          onClick();
        });

        map.current.addLayer(polyline);

        if (drawAntPath) {
          const aPath = antPath(location, {
            delay: 9000,
            dashArray: [10, 20],
            weight: 5,
            opacity: 1,
            color: "rgb(0, 0, 0, 0)",
            pulseColor: "rgb(255, 255, 255, 0.3)",
            paused: false,
            reverse: false,
            hardwareAccelerated: true,
          });
          aPath.mapItemType = "antPath" as MapItemType;

          map.current.addLayer(aPath);
        }
      }
    },
    [map, getMapItemByUuid]
  );

  const saveUpdatedPoiOrStationPosition = useCallback(
    (uuid: string, mapItemType: MapItemType, location: AEGISPoint) => {
      if (mapItemType === "poi") {
        dispatch(updatePoiLocation({ uuid, location }));
      } else if (mapItemType === "station") {
        dispatch(updateStationLocation({ uuid, location }));
      }
    },
    [dispatch]
  );

  /**
   * Map instantiation and event listeners.
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

      const scaleControl = L.control.scale({ metric: true, imperial: false, maxWidth: 200 });
      scaleControl.addTo(map.current);

      if (!draggableLines.current) {
        draggableLines.current = new DraggableLines(map.current, { allowExtendingLine: false });
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

    const center = [config?.msv?.view[0], config?.msv?.view[1]];
    const zoom = config?.msv?.view[2];
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
    if (!map.current || !draggableLines) return;

    switch (mapDirective?.mapAction) {
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
        setShowHighlightOnMap(false);

        // edit polyline is only possible when user has selected a traverse, so only one polyline is on the map
        // set all polylines on the map to editable

        // find this polyline layer on the map
        const polylineToUpdate = getMapItemByUuid(
          mapDirective.uuid,
          mapDirective.mapItemType
        ) as AEGISPolyline;

        if (polylineToUpdate) {
          draggableLines.current.enableForLayer(polylineToUpdate);

          const dispatchLocationAndDistance = (e) => {
            if (e.layer.uuid === mapDirective?.uuid) {
              const location = convertLeafletLatLngsToAegisPoints(e.layer.getLatLngs());
              const polylinePoints: AEGISPoint[] = convertLeafletLatLngsToAegisPoints(
                e.layer.getLatLngs()
              );
              const distance: number[] = [];
              for (let i = 1; i < polylinePoints.length; i++) {
                distance.push(
                  getTotalDistance(
                    [polylinePoints[i - 1], polylinePoints[i]],
                    parseFloat(mission.config.msv.radius.minor)
                  )
                );
              }
              if (e.layer.mapItemType === "traverse") {
                dispatch(
                  updateTraverseLocationAndDistance({
                    uuid: mapDirective?.uuid,
                    location,
                    distance,
                  })
                );
              }
              if (e.layer.mapItemType === "walkback") {
                dispatch(
                  updateWalkbackLocationAndDistance({
                    uuid: mapDirective?.uuid,
                    location,
                    distance,
                  })
                );
              }
            }
          };

          draggableLines.current.on("drag", (e) => {
            dispatchLocationAndDistance(e);
          });

          draggableLines.current.on("remove", (e) => {
            dispatchLocationAndDistance(e);
          });
        }

        break;

      case "saveEditPolyline":
        // only called by polyline edits. Markers happen on click or draggend events
        // **** no need to save because we're love updating the store with the new location as the user drags the polyline ****

        // find this polyline layer on the map
        draggableLines.current.disableForLayer(
          getMapItemByUuid(mapDirective.uuid, mapDirective.mapItemType)
        );

        draggableLines.current.off("drag");
        draggableLines.current.off("remove");

        clearAction();
        break;

      case "cancelEditPolyline":
        draggableLines.current.disableForLayer(
          getMapItemByUuid(mapDirective.uuid, mapDirective.mapItemType)
        );
        if (mapDirective.mapItemType === "traverse") {
          dispatch(revertTraverseLocationAndDistance({ uuid: mapDirective?.uuid }));
        }
        if (mapDirective.mapItemType === "walkback") {
          dispatch(revertWalkbackLocationAndDistance({ uuid: mapDirective?.uuid }));
        }

        draggableLines.current.off("drag");
        draggableLines.current.off("remove");

        clearAction();
        break;
      default:
    }

    function clearAction() {
      dispatch(updateMapDirective(null));
      setShowHighlightOnMap(true);
      map.current.getContainer().style.cursor = "grab";
    }

    return () => {
      if (draggableLines.current) {
        draggableLines.current.disable();
        draggableLines.current.off("drag");
      }
    };
  }, [map, mission, draggableLines, mapDirective, dispatch, getMapItemByUuid]);

  /**
   * Draw or update POIs on the map when pois change. Serves as draw when page loads
   */
  useEffect(() => {
    if (!map.current || mapDirective) return;

    if (pois) {
      // delete all poi in leaflet that are not in the poi store
      map.current.eachLayer((layer: AEGISMarker | AEGISPolyline) => {
        if (layer.mapItemType === "poi") {
          map.current.removeLayer(layer);
        }
      });

      // draw or update all pois
      pois.forEach((poi) => {
        if (poi.location) {
          drawOrUpdateMarkerOnMap({
            uuid: poi.uuid,
            iconEmoji: poi.icon ? poi.icon : "1F3F4",
            mapItemType: "poi",
            location: poi.location,
            onClick: () => {
              setShowHighlightOnMap(true);
              dispatch(setSectionSelected("poi"));
              dispatch(setSelectedPoiUuid(poi.uuid));
            },
            onDraggend: (marker: AEGISMarker) => {
              const newLocation = convertLeafletLatLngToAegisPoint(marker.getLatLng());
              saveUpdatedPoiOrStationPosition(poi.uuid, "poi", newLocation);
              dispatch(updateMapDirective(null));
            },
          });
        }
      });
    }
  }, [map, pois, mapDirective, drawOrUpdateMarkerOnMap, saveUpdatedPoiOrStationPosition, dispatch]);

  /**
   * Draw or update stations on the map when stations change. Serves as draw when page loads
   */
  useEffect(() => {
    if (!map.current || mapDirective) return;
    // delete all stations in leaflet that are not in the station store
    map.current.eachLayer((layer: AEGISMarker | AEGISPolyline) => {
      if (layer.mapItemType === "station") {
        map.current.removeLayer(layer);
      }
    });

    // draw or update all stations
    if (stations) {
      stations.forEach((station) => {
        if (station.location) {
          drawOrUpdateMarkerOnMap({
            uuid: station.uuid,
            iconEmoji: station.icon,
            mapItemType: "station",
            location: station.location,
            onClick: () => {
              setShowHighlightOnMap(true);
              dispatch(setSectionSelected("station"));
              dispatch(setSelectedStationUuid(station.uuid));
            },
            onDraggend: (marker: AEGISMarker) => {
              const newLocation = convertLeafletLatLngToAegisPoint(marker.getLatLng());
              saveUpdatedPoiOrStationPosition(station.uuid, "station", newLocation);
              dispatch(updateMapDirective(null));
            },
          });
        }
      });
    }
  }, [
    map,
    stations,
    mapDirective,
    drawOrUpdateMarkerOnMap,
    saveUpdatedPoiOrStationPosition,
    dispatch,
  ]);

  /**
   * Draw walkback on the map when the selected station changes
   */
  useEffect(() => {
    if (!map.current || mapDirective) return;
    // remove all walkback traverses from the map
    // delete all poi in leaflet that are not in the poi store
    map.current.eachLayer((layer: AEGISMarker | AEGISPolyline) => {
      if (layer.mapItemType === "walkback") {
        map.current.removeLayer(layer);
      }
    });

    // draw the walkback traverse
    if (!mapDirective && selectedStation?.walkbackLocation) {
      drawOrUpdatePolylineOnMap({
        uuid: selectedStation.uuid,
        mapItemType: "walkback",
        location: selectedStation.walkbackLocation,
        color: "red",
        dashArray: "5, 5",
        onClick: () => {
          setShowHighlightOnMap(true);
          dispatch(setSectionSelected("station"));
          dispatch(setSelectedStationUuid(selectedStation.uuid));
        },
        drawAntPath: false,
      });
    }
  }, [map, selectedStation, mapDirective, drawOrUpdatePolylineOnMap, dispatch]);

  /**
   * Draw or update traverses on the map when selections or traverses change. Serves as draw when page loads
   */
  useEffect(() => {
    if (!map.current) return;
    // abort if there is an active map action ongoing
    if (mapDirective) return;

    if (traverses) {
      // delete all traverses from the map
      map.current.eachLayer((layer: AEGISMapLayer) => {
        if (layer.mapItemType === "traverse" || layer.mapItemType === "antPath") {
          map.current.removeLayer(layer);
        }
      });

      // if a traverse sequence item is selected, draw only that traverse
      if (selectedEvaSequenceItemUuid) {
        const traverse = traverses.find(
          (traverse) => traverse.uuid === selectedEvaSequenceItemUuid
        );
        if (traverse) {
          drawOrUpdatePolylineOnMap({
            uuid: traverse.uuid,
            location: traverse.location,
            onClick: () => {
              dispatch(setSectionSelected("evas"));
              dispatch(setSelectedEvaSequenceItemUuid(traverse.uuid));
            },
            mapItemType: "traverse",
            color: "blue",
            drawAntPath: false,
          });
        }
      } else if (selectedEva) {
        // draw all traverses in the selectedEva sequence
        selectedEva.sequence.forEach((sequenceItem) => {
          if (sequenceItem.type !== "traverse") return;

          const traverse = traverses.find((traverse) => traverse.uuid === sequenceItem.uuid);
          if (traverse) {
            drawOrUpdatePolylineOnMap({
              uuid: traverse.uuid,
              location: traverse.location,
              onClick: () => {
                dispatch(setSectionSelected("evas"));
                dispatch(setSelectedEvaSequenceItemUuid(traverse.uuid));
                dispatch(setSelectedEvaRightNavItem("info_panel"));
              },
              color: "blue",
              mapItemType: "traverse",
              drawAntPath: true,
            });
          }
        });
      }
    }
  }, [
    map,
    traverses,
    mapDirective,
    selectedEvaSequenceItemUuid,
    selectedEva,
    drawOrUpdatePolylineOnMap,
    dispatch,
  ]);

  /**
   * Monitor map item highlights and draw highlight layer on the map
   */
  useEffect(() => {
    if (!map.current) return;

    // remove any existing highlight layers
    map.current.eachLayer((layer: AEGISCircleMarker) => {
      if (layer?.mapItemType === "selectedMarker") {
        map.current.removeLayer(layer);
      }
    });

    if (!showHightlightOnMap) return;

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
      marker.mapItemType = "selectedMarker";
      marker.bringToBack();

      map.current.addLayer(marker);
    }
  }, [map, selectedPoi, selectedStation, dispatch, showHightlightOnMap, sectionSelected]);

  /**
   * if selected Poi or Station changes, then show the highlight on the map
   */
  useEffect(() => {
    if (selectedPoi || selectedStation) {
      setShowHighlightOnMap(true);
    }
  }, [selectedPoi, selectedStation]);

  return (
    <>
      <div className={styles.map} ref={mapRef}></div>
    </>
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
