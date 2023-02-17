import L from "leaflet";
L.Icon.Default.imagePath = "/leaflet/images/";
// Import the plugin libraries so they will modify L
import "leaflet-draw";
import "leaflet.tilelayer.colorfilter";

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
import { upsertUserMapObject } from "store/map";
import { setSelectedPoiUuid, updatePoiLocation } from "store/poi";
import { setSectionSelected } from "store/interface";
import { setSelectedStationUuid, updateStationLocation } from "store/station";
import { upsertTraverse } from "store/traverse";

// const center = [51.505, -0.09] as L.LatLngExpression; // London
const center = [64.833445, -16.378351] as L.LatLngExpression; // Iceland
const zoom = 13;

const layerBaseURL = process.env.NEXT_PUBLIC_LAYER_BASE_URL;

const MapBody: FunctionComponent = () => {
  const dispatch = useDispatch();
  const mapRef = useRef(null);
  const map = useRef(null);

  /**
   * Contains a list of all the leaflet draw controls and handlers for each item on the map
   * The companion to this list is kept in the map store as userMapItems which is used to manage
   * interactions triggered from outside this component
   */

  const drawControlItemsRef = useRef<DrawControlItem[]>([]);

  const mission = useAppSelector((state) => state.mission.mission, shallowEqual);
  const missionLayers = useAppSelector((state) => state.mission.layers, shallowEqual);
  const layerControls = useAppSelector((state) => state.map.layerControls, shallowEqual);
  // const eva = useAppSelector((state) => state.eva.evas[0], shallowEqual); //TODO: support multiple evas
  const userMapObjects = useAppSelector((state) => state.map.userMapObjects, shallowEqual);
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
  const traversesEditing = useAppSelector((state) => state.traverse.traversesEditing, shallowEqual);

  const sectionSelected = useAppSelector((state) => state.interface.sectionSelectedLabel, refEqual);

  const [layersOnMap, setLayersOnMap] = useState([]);
  const [showHightlightOnMap, setShowHighlightOnMap] = useState(false);

  const uuidOfCurrentlyActiveMapEdit = useRef(null);

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

  /**
   * Map events management
   */

  // save a leaflet map marker that has been edited via leaflet-draw. Called from the dragend handler set upon marker creation
  const saveMarkerEdit = useCallback(
    (layer, drawControlItem, uuidOfCurrentlyActiveMapEdit) => {
      let location: AEGISPoint | AEGISPoint[] = null;

      if (layer instanceof L.Marker) {
        location = convertLeafletLatLngToAegisPoint(layer.getLatLng());
      } else if (layer instanceof L.Polyline) {
        location = convertLeafletLatLngsToAegisPoints(layer.getLatLngs() as L.LatLng[]);
      }
      if (drawControlItem.mapItemType === "station") {
        dispatch(updateStationLocation({ uuid: layer["uuid"], location: location as AEGISPoint }));
      } else if (drawControlItem.mapItemType === "poi") {
        // a POI
        const location = convertLeafletLatLngToAegisPoint(layer.getLatLng());
        dispatch(
          updatePoiLocation({
            uuid: layer["uuid"],
            location,
          })
        );
      }
      // reset userMapObject map action to null without referencing what's already in the store (because we can't, see above)
      dispatch(
        upsertUserMapObject({
          mapItemType: drawControlItem.mapItemType,
          uuid: uuidOfCurrentlyActiveMapEdit,
          createdAt: null,
          mapAction: null,
        })
      );
      // cancel the edit action on the map
      drawControlItem.drawControl._toolbars.edit._modes.edit.handler.disable();

      setShowHighlightOnMap(true);
    },
    [dispatch]
  );

  const drawItemOnMap = useCallback(
    (
      uuid: string,
      mapItemType: MapItemType,
      emoji16BitVal: string,
      location: AEGISPoint | AEGISPoint[],
      drawing: boolean
    ) => {
      const html = `<div class="leaflet-aegis-icon">${
        emoji16BitVal ? String.fromCodePoint(parseInt(emoji16BitVal, 16)) : "🚀"
      }</div>`;
      const icon = L.divIcon({ html });

      // add new leaflet draw control to map
      const drawnItemsFeatureGroup = new L.FeatureGroup() as FeatureGroupWithUuid;
      drawnItemsFeatureGroup.uuid = uuid;
      map.current.addLayer(drawnItemsFeatureGroup);

      const drawControl = new L.Control.Draw({
        draw: {
          polygon: false,
          rectangle: false,
          circle: false,
          circlemarker: false,
        },
        edit: {
          featureGroup: drawnItemsFeatureGroup,
          edit: {
            selectedPathOptions: {
              opacity: 0.3,
            },
          },
        },
      }) as any;
      map.current.addControl(drawControl);

      let drawHandler;
      if (mapItemType === "traverse") {
        if (drawing) {
          drawHandler = new L.Draw.Polyline(map.current, drawControl.options.polyline);
          drawHandler.enable();
        } else {
          // if the location isn't the null default, draw it on the map
          if (
            !Array.isArray(location) ||
            !location[0]?.lat ||
            !location[0]?.lng ||
            !location[location.length - 1]?.lat ||
            !location[location.length - 1]?.lng
          )
            return;

          const polyline = L.polyline(location as AEGISPoint[], {
            color: "blue",
            weight: 3,
            opacity: 0.5,
            smoothFactor: 1,
          }) as PolylineWithUuid;
          polyline.uuid = uuid;
          drawnItemsFeatureGroup.addLayer(polyline);

          // polyline handlers
          polyline.on("click", () => {
            console.log("Traverse Polyline click handler fired: ", uuid);
          });
        }
      } else {
        if (drawing) {
          // drawing interactively via interface - just initiate the draw function, the rest is handled on `draw:created` event
          drawHandler = new L.Draw.Marker(map.current, { icon });
          drawHandler.enable();
        } else {
          // drawing automatically for example on map load
          const marker = L.marker(location as AEGISPoint, {
            icon,
          }) as MarkerWithUuid;
          marker.uuid = uuid;
          drawnItemsFeatureGroup.addLayer(marker);

          // marker handlers
          marker.on("click", () => {
            console.log("Marker click handler fired: ", uuid);
            setShowHighlightOnMap(true);
            dispatch(setSectionSelected(mapItemType === "poi" ? "poi" : "station"));
            dispatch(
              mapItemType === "poi"
                ? setSelectedPoiUuid(drawnItemsFeatureGroup.uuid)
                : setSelectedStationUuid(drawnItemsFeatureGroup.uuid)
            );
          });

          // dragend handler that causes edit to be saved on mouseup
          marker.on("dragend", () => {
            console.log("Marker dragend handler fired: ", uuid);
            saveMarkerEdit(marker, newDrawControlItem, uuid);
          });
        }
      }

      const newDrawControlItem: DrawControlItem = {
        uuid: uuid,
        drawControl,
        drawHandler,
        drawnItemsFeatureGroup,
        mapItemType,
      };
      drawControlItemsRef.current = [...drawControlItemsRef.current, newDrawControlItem];
    },
    [dispatch, saveMarkerEdit]
  );

  // Map instantiation and event listeners.
  // useLayoutEffect runs immediately immediately after the DOM is updated, but before the browser has a chance to paint
  useLayoutEffect(() => {
    if (!mapRef.current) return;

    // Instantiate the map
    if (!map.current) {
      map.current = L.map("map", {
        center: center,
        zoom: zoom,
      });
    }

    /**
     * NOTE: none of the listeners below can read from Redux since this useLayoutEffect is only run at initialization
     * thus all of the store values are fixed at what they were at the time the map was initialized
     */

    map.current.on("click", (e) => {
      console.log("click", e);
    });

    map.current.on("draw:drawstart", (e) => {
      console.log("draw:drawstart", e);
    });

    // when a layer is added to the map, add it to the list of layers on the map in the store
    map.current.on("draw:created", (e) => {
      console.log(`draw:created:`, e);

      const drawControlItem = drawControlItemsRef.current.find(
        (item) => item.uuid === uuidOfCurrentlyActiveMapEdit.current
      );
      drawControlItem.drawnItemsFeatureGroup.addLayer(e.layer);

      let location: AEGISPoint | AEGISPoint[] = null;
      if (drawControlItem.mapItemType === "station") {
        location = convertLeafletLatLngToAegisPoint(e.layer.getLatLng());

        dispatch(
          updateStationLocation({
            uuid: uuidOfCurrentlyActiveMapEdit.current,
            location,
          })
        );

        // Station click handler
        e.layer.on("click", () => {
          console.log("Newly drawn Station marker clicked: ", e.layer.uuid);
          dispatch(setSectionSelected("station"));
          dispatch(setSelectedStationUuid(e.layer.uuid));
        });

        // Station dragend handler that causes edit to be saved on mouseup
        e.layer.on("dragend", () => {
          console.log("Newly drawn Station marker has been dragend-ed: ", e.layer.uuid);
          saveMarkerEdit(e.layer, drawControlItem, e.layer.uuid);
        });
      } else if (drawControlItem.mapItemType === "traverse") {
        location = convertLeafletLatLngsToAegisPoints(e.layer.getLatLngs());

        // dispatch(
        //   updateEvaItemLocation({
        //     uuid: uuidOfCurrentlyActiveMapEdit.current,
        //     location,
        //   })
        // );
      } else {
        // a POI
        location = convertLeafletLatLngToAegisPoint(e.layer.getLatLng());
        dispatch(
          updatePoiLocation({
            uuid: uuidOfCurrentlyActiveMapEdit.current,
            location,
          })
        );

        // POI click handler
        e.layer.on("click", () => {
          console.log("Newly drawn POI marker clicked: ", e.layer.uuid);
          dispatch(setSectionSelected("poi"));
          dispatch(setSelectedPoiUuid(e.layer.uuid));
        });

        // POI dragend handler that causes edit to be saved on mouseup
        e.layer.on("dragend", () => {
          console.log("Newly drawn POI marker has been dragend-ed: ", e.layer.uuid);
          saveMarkerEdit(e.layer, drawControlItem, e.layer.uuid);
        });
      }

      // reset userMapObject map action to null without referencing what's already in the store (because we can't, see above)
      dispatch(
        upsertUserMapObject({
          mapItemType: drawControlItem.mapItemType,
          uuid: e.layer.uuid,
          createdAt: null,
          mapAction: null,
        })
      );
    });

    map.current.on("draw:edited", (e) => {
      console.log(`draw:edited:`, e);

      const drawControlItem = drawControlItemsRef.current.find(
        (item) => item.uuid === uuidOfCurrentlyActiveMapEdit.current
      );

      if (drawControlItem.mapItemType !== "traverse") {
        // update the layer in state using uuid as key
        e.layers.eachLayer(function (layer) {
          if (layer["uuid"]) {
            saveMarkerEdit(layer, drawControlItem, uuidOfCurrentlyActiveMapEdit.current);
          }
        });
      }
    });

    map.current.on("draw:editstop", (e) => {
      console.log(`draw:editstop:`, e);
    });

    map.current.on("draw:editvertex", function (event) {
      console.log("draw:editvertex", event);
    });

    return () => {
      if (map.current) {
        map.current.off();
      }
    };
  }, [mission, mapRef, map, dispatch, saveMarkerEdit]);

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
   * if a traverse is removed from the traversesEditing list, and it is currently being edited, stop editing it
   */
  useEffect(() => {
    if (!map.current || !userMapObjects || !traversesEditing) return;

    const userMapObject = userMapObjects.find(
      (userMapObject) => userMapObject.uuid === uuidOfCurrentlyActiveMapEdit.current
    );
    if (
      userMapObject &&
      userMapObject.mapItemType === "traverse" &&
      userMapObject.mapAction === "edit"
    ) {
      // if the userMapObject uuid is not in the traversesEditing list, stop the leaflet edit function
      // this covers the case where a user starts a traverse map path edit, then cancels the overall traverse edit
      if (!traversesEditing.find((uuid) => uuid === userMapObject.uuid)) {
        // update userMapObject map action to null
        dispatch(
          upsertUserMapObject({
            mapItemType: userMapObject.mapItemType,
            uuid: userMapObject.uuid,
            createdAt: new Date().toISOString(),
            mapAction: "cancelEdit",
          })
        );
      }
    }
  }, [userMapObjects, traversesEditing, dispatch]);

  /**
   * Draw or POIs on the map when pois change. Serves as draw when page loads
   */
  useEffect(() => {
    if (!map.current || !drawControlItemsRef.current) return;

    if (pois) {
      pois.forEach((poi) => {
        if (poi.location) {
          // if the poi is already in drawControlItems, update its location
          if (
            drawControlItemsRef.current.find((drawControlItem) => drawControlItem.uuid === poi.uuid)
          ) {
            const drawControlItem = drawControlItemsRef.current.find(
              (drawControlItem) => drawControlItem.uuid === poi.uuid
            );
            drawControlItem.drawnItemsFeatureGroup.eachLayer((layer) => {
              if (layer instanceof L.Marker) {
                layer.setLatLng(poi.location);
              }
            });
          } else {
            const userMapObject: UserMapObject = {
              uuid: poi.uuid,
              mapItemType: "poi",
              createdAt: new Date().toISOString(),
              mapAction: null,
            };

            drawItemOnMap(
              poi.uuid,
              userMapObject.mapItemType,
              poi.color?.value,
              poi.location,
              false
            );

            dispatch(upsertUserMapObject(userMapObject));
          }
        }
      });
    }
  }, [map, pois, drawControlItemsRef, dispatch, drawItemOnMap]);

  /**
   * Draw or update stations on the map when station change. Serves as draw when page loads
   */
  useEffect(() => {
    if (!map.current || !drawControlItemsRef.current) return;

    if (stations) {
      stations.forEach((station) => {
        if (station.location) {
          // if the station is already in drawControlItems, update its location
          if (
            drawControlItemsRef.current.find(
              (drawControlItem) => drawControlItem.uuid === station.uuid
            )
          ) {
            const drawControlItem = drawControlItemsRef.current.find(
              (drawControlItem) => drawControlItem.uuid === station.uuid
            );
            drawControlItem.drawnItemsFeatureGroup.eachLayer((layer) => {
              if (layer instanceof L.Marker) {
                layer.setLatLng(station.location);
              }
            });
          } else {
            const userMapObject: UserMapObject = {
              uuid: station.uuid,
              mapItemType: "station",
              createdAt: new Date().toISOString(),
              mapAction: null,
            };

            drawItemOnMap(station.uuid, userMapObject.mapItemType, null, station.location, false);

            dispatch(upsertUserMapObject(userMapObject));
          }
        }
      });
    }
  }, [map, stations, drawControlItemsRef, dispatch, drawItemOnMap]);

  /**
   * Remove all traverse drawControlItems from the map
   */
  const removeTraverseDrawControlItems = useCallback(() => {
    if (!map.current || !drawControlItemsRef.current) return;

    drawControlItemsRef.current.forEach((drawControlItem) => {
      if (drawControlItem.mapItemType === "traverse") {
        map.current.removeControl(drawControlItem.drawControl);
        map.current.removeLayer(drawControlItem.drawnItemsFeatureGroup);
      }
    });
    drawControlItemsRef.current = drawControlItemsRef.current.filter(
      (drawControlItem) => drawControlItem.mapItemType !== "traverse"
    );
  }, [map, drawControlItemsRef]);

  /**
   * Draw or update traverses on the map when traverses or stations change depending on what is selected too. Serves as draw when EVA selected
   */
  const drawTraverse = useCallback(
    (traverse: Traverse) => {
      if (traverse.location) {
        const drawControlItem = drawControlItemsRef.current.find(
          (drawControlItem) => drawControlItem.uuid === traverse.uuid
        );
        // if the traverse is already in drawControlItems, update its location
        if (drawControlItem) {
          // remove the leaflet draw control from the map
          map.current.removeControl(drawControlItem.drawControl);
          map.current.removeLayer(drawControlItem.drawnItemsFeatureGroup);
          // remove the draw control from the list of draw controls
          drawControlItemsRef.current = drawControlItemsRef.current.filter(
            (drawControl) => drawControl.uuid !== traverse.uuid
          );
        }
        // draw a new editable traverse on the map
        const userMapObject: UserMapObject = {
          uuid: traverse.uuid,
          mapItemType: "traverse",
          createdAt: new Date().toISOString(),
          mapAction: null,
        };

        drawItemOnMap(traverse.uuid, userMapObject.mapItemType, null, traverse.location, false);

        dispatch(upsertUserMapObject(userMapObject));
      }
    },
    [drawControlItemsRef, dispatch, drawItemOnMap]
  );
  useEffect(() => {
    if (!map.current || !drawControlItemsRef.current) return;

    if (traverses) {
      removeTraverseDrawControlItems();

      // draw traverses in the selected EVA on the map

      // if a traverse sequence item is selected, draw only that traverse
      if (selectedEvaSequenceItemUuid) {
        const traverse = traverses.find(
          (traverse) => traverse.uuid === selectedEvaSequenceItemUuid
        );
        if (traverse) {
          drawTraverse(traverse);
        } else {
          // the selected sequence item is a station. draw the traverse of the selected eva
          if (selectedEva) {
            selectedEva?.sequence.forEach((sequenceItem) => {
              if (sequenceItem.type === "traverse") {
                const traverse = traverses.find((traverse) => traverse.uuid === sequenceItem.uuid);
                if (traverse) {
                  drawTraverse(traverse);
                }
              }
            });
          }
        }
      } else {
        // no sequence item is selected. draw all traverses of the selected eva
        if (selectedEva) {
          selectedEva?.sequence.forEach((sequenceItem) => {
            if (sequenceItem.type === "traverse") {
              const traverse = traverses.find((traverse) => traverse.uuid === sequenceItem.uuid);
              if (traverse) {
                drawTraverse(traverse);
              }
            }
          });
        }
      }
    }
  }, [
    map,
    traverses,
    drawControlItemsRef,
    selectedEva,
    selectedEvaSequenceItemUuid,
    stations,
    drawTraverse,
    removeTraverseDrawControlItems,
  ]);

  /**
   * Listen for mapActions for stations and pois and trigger map draw/edit modes appropriately
   */
  useEffect(() => {
    // if (!eva) return;
    if (userMapObjects === null) return;

    const activeUserMapObject = userMapObjects.find(
      (userMapObject) => userMapObject.mapAction !== null
    );

    if (activeUserMapObject) {
      // Set that item edit is underway. This allows the correct item to be updated when the L Draw action is completed
      uuidOfCurrentlyActiveMapEdit.current = activeUserMapObject.uuid;

      // trigger the map create / edit / cancel event
      if (activeUserMapObject.mapAction === "create") {
        console.log("create");

        // if a poi is being created, get its emoji and set it as the icon for the marker
        let emoji16BitVal = null;
        if (activeUserMapObject.mapItemType === "poi") {
          const poi = pois.find((poi) => poi.uuid === activeUserMapObject.uuid);
          emoji16BitVal = poi.color ? poi.color?.value : "⚫".codePointAt(0).toString(16);
        } else {
          // if a station is being created, use a default icon
          emoji16BitVal = "🚀".codePointAt(0).toString(16);
        }

        drawItemOnMap(
          activeUserMapObject.uuid,
          activeUserMapObject.mapItemType,
          emoji16BitVal,
          null,
          true
        );
      } else if (activeUserMapObject.mapAction === "cancelCreate") {
        console.log("cancelCreate");
        const drawControlItem = drawControlItemsRef.current.find(
          (drawControl) => drawControl.uuid === activeUserMapObject.uuid
        );
        drawControlItem.drawHandler.disable();

        // remove the leaflet draw control from the map
        map.current.removeControl(drawControlItem.drawControl);
        map.current.removeLayer(drawControlItem.drawnItemsFeatureGroup);
        // remove the draw control from the list of draw controls
        drawControlItemsRef.current = drawControlItemsRef.current.filter(
          (drawControl) => drawControl.uuid !== activeUserMapObject.uuid
        );
        clearAction();
      } else if (activeUserMapObject.mapAction === "edit") {
        console.log("edit");
        const drawControlItem = drawControlItemsRef.current.find(
          (drawControl) => drawControl.uuid === activeUserMapObject.uuid
        );
        drawControlItem.drawControl._toolbars.edit._modes.edit.handler.enable();

        setShowHighlightOnMap(false);
      } else if (activeUserMapObject.mapAction === "cancelEdit") {
        console.log("cancelEdit");
        const drawControlItem = drawControlItemsRef.current.find(
          (drawControl) => drawControl.uuid === activeUserMapObject.uuid
        );
        drawControlItem.drawControl._toolbars.edit._modes.edit.handler.disable();

        if (activeUserMapObject.mapItemType !== "traverse") {
          // trigger a location refresh since edit was cancelled
          dispatch(
            upsertUserMapObject({
              ...userMapObjects.find((item) => item.uuid === activeUserMapObject?.uuid),
              mapAction: "refreshLocation",
            })
          );
          setShowHighlightOnMap(true);
        } else {
          // if the cancelled edit is on a traverse, delete the traverse from the map entirely and call a refresh
          // remove the leaflet draw control from the map
          map.current.removeControl(drawControlItem.drawControl);
          map.current.removeLayer(drawControlItem.drawnItemsFeatureGroup);
          // remove the draw control from the list of draw controls
          drawControlItemsRef.current = drawControlItemsRef.current.filter(
            (drawControl) => drawControl.uuid !== activeUserMapObject.uuid
          );
          // redraw the traverse using coordinates from the store
          const traverse = traverses.find((traverse) => traverse.uuid === activeUserMapObject.uuid);
          drawTraverse(traverse);
        }
        clearAction();
      } else if (activeUserMapObject.mapAction === "saveEdit") {
        console.log("saveEdit");
        const drawControlItem = drawControlItemsRef.current.find(
          (drawControl) => drawControl.uuid === activeUserMapObject.uuid
        );
        drawControlItem.drawControl._toolbars.edit._modes.edit.handler.save();
        drawControlItem.drawControl._toolbars.edit._modes.edit.handler.disable();

        if (activeUserMapObject.mapItemType !== "traverse") {
          setShowHighlightOnMap(true);
        }
        // if saved item is a traverse dispatch the new location array to the store
        if (activeUserMapObject.mapItemType === "traverse") {
          // harvest the location array from the drawnItemsFeatureGroup
          const aegisPoints: AEGISPoint[] = [];
          drawControlItem.drawnItemsFeatureGroup.eachLayer((layer) => {
            const layerLatLngs = layer.getLatLngs();
            if (layerLatLngs) {
              layerLatLngs.forEach((layerLatLng) => {
                aegisPoints.push({
                  lat: layerLatLng.lat,
                  lng: layerLatLng.lng,
                });
              });
            }
          });

          // delete the entire leaflet draw layer for this traverse because leaflet.
          // It will get redrawn below in the useEffect that draws or updates traverses on the map when traverses change in the store
          map.current.removeControl(drawControlItem.drawControl);
          map.current.removeLayer(drawControlItem.drawnItemsFeatureGroup);
          drawControlItemsRef.current = drawControlItemsRef.current.filter(
            (drawControl) => drawControl.uuid !== activeUserMapObject.uuid
          );

          // dispatch the new location array to the store
          const traverse = traverses.find((traverse) => traverse.uuid === activeUserMapObject.uuid);
          dispatch(
            upsertTraverse({
              ...traverse,
              location: aegisPoints,
            })
          );
        }
        clearAction();
      } else if (activeUserMapObject.mapAction === "refreshLocation") {
        console.log("refreshLocation");
        const drawControlItem = drawControlItemsRef.current.find(
          (drawControl) => drawControl.uuid === activeUserMapObject.uuid
        );
        if (drawControlItem.mapItemType === "station") {
          const station = stations.find((station) => station.uuid === activeUserMapObject.uuid);
          if (station?.location) {
            const location = station.location;
            const latLng = new L.LatLng(location.lat, location.lng);
            drawControlItem.drawnItemsFeatureGroup.eachLayer((layer) => {
              if (layer instanceof L.Marker) {
                layer.setLatLng(latLng);
              }
            });
          } else {
            // station location is null so delete it from the map
            drawControlItem.drawnItemsFeatureGroup.eachLayer((layer) => {
              if (layer instanceof L.Marker) {
                drawControlItem.drawnItemsFeatureGroup.removeLayer(layer);
              }
            });
            drawControlItemsRef.current = drawControlItemsRef.current.filter(
              (drawControl) => drawControl.uuid !== activeUserMapObject.uuid
            );
          }
        } else if (drawControlItem.mapItemType === "traverse") {
          const traverse = traverses.find((traverse) => traverse.uuid === activeUserMapObject.uuid);
          if (traverse?.location) {
            const location = traverse.location;
            const latLngs = location.map((point) => new L.LatLng(point.lat, point.lng));
            drawControlItem.drawnItemsFeatureGroup.eachLayer((layer) => {
              if (layer instanceof L.Polyline) {
                layer.setLatLngs(latLngs);
              }
            });
          } else {
            // traverse location is null so delete it from the map
            drawControlItem.drawnItemsFeatureGroup.eachLayer((layer) => {
              if (layer instanceof L.Polyline) {
                drawControlItem.drawnItemsFeatureGroup.removeLayer(layer);
              }
            });
            drawControlItemsRef.current = drawControlItemsRef.current.filter(
              (drawControl) => drawControl.uuid !== activeUserMapObject.uuid
            );
          }
        } else if (drawControlItem.mapItemType === "poi") {
          // POI
          const poi = pois.find((poi) => poi.uuid === activeUserMapObject.uuid);
          if (poi?.location) {
            const location = poi.location;
            const latLng = new L.LatLng(location.lat, location.lng);
            drawControlItem.drawnItemsFeatureGroup.eachLayer((layer) => {
              if (layer instanceof L.Marker) {
                layer.setLatLng(latLng);
              }
            });
          } else {
            // poi location is null so delete it from the map
            drawControlItem.drawnItemsFeatureGroup.eachLayer((layer) => {
              if (layer instanceof L.Marker) {
                drawControlItem.drawnItemsFeatureGroup.removeLayer(layer);
              }
            });
            drawControlItemsRef.current = drawControlItemsRef.current.filter(
              (drawControl) => drawControl.uuid !== activeUserMapObject.uuid
            );
          }
        }
        clearAction();
      } else if (activeUserMapObject.mapAction === "delete") {
        console.log("delete");
        const drawControlItem = drawControlItemsRef.current.find(
          (drawControl) => drawControl.uuid === activeUserMapObject.uuid
        );
        // remove the leaflet draw control from the map
        map.current.removeControl(drawControlItem.drawControl);
        map.current.removeLayer(drawControlItem.drawnItemsFeatureGroup);

        drawControlItemsRef.current = drawControlItemsRef.current.filter(
          (drawControl) => drawControl.uuid !== activeUserMapObject.uuid
        );
        clearAction();
      }
    }

    function clearAction() {
      dispatch(
        upsertUserMapObject({
          ...userMapObjects.find((item) => item.uuid === activeUserMapObject?.uuid),
          mapAction: null,
        })
      );
      uuidOfCurrentlyActiveMapEdit.current = null;
    }
  }, [pois, stations, traverses, userMapObjects, dispatch, drawItemOnMap, drawTraverse]);

  /**
   * Monitor map item highlights and draw highlight layers on the map
   */
  useEffect(() => {
    if (!map.current) return;

    // remove any existing highlight layers
    map.current.eachLayer((layer: CircleMarkerWithUuid) => {
      if (layer instanceof L.CircleMarker) {
        // if layer has the property uuid, it's a highlight layer
        if (layer.uuid) {
          map.current.removeLayer(layer);
        }
      }
    });

    if (sectionSelected === "poi" && selectedPoi) {
      // highlight POIs if the poi section is selected

      // check if poi marker has been added to the map
      const selectedDrawControlItem = drawControlItemsRef.current.find(
        (drawControlItem) => drawControlItem.uuid === selectedPoi.uuid
      );

      if (selectedDrawControlItem) {
        // if the poi has a location, then highlight it on the map
        if (selectedPoi.location && showHightlightOnMap) {
          const latLng = new L.LatLng(selectedPoi.location.lat, selectedPoi.location.lng);

          const marker = L.circleMarker(latLng, {
            radius: 12,
            color: "#28ecf9", //POI
            stroke: false,
          }) as CircleMarkerWithUuid;
          marker.uuid = selectedPoi?.uuid;
          map.current.addLayer(marker);
        }
      }
    } else if ((sectionSelected === "station" || sectionSelected === "evas") && selectedStation) {
      // highlight stations if the station section is selected
      const selectedDrawControlItem = drawControlItemsRef.current.find(
        (drawControlItem) => drawControlItem.uuid === selectedStation.uuid
      );

      if (selectedDrawControlItem) {
        // if the station has a location, then highlight it on the map
        if (selectedStation.location && showHightlightOnMap) {
          const latLng = new L.LatLng(selectedStation.location.lat, selectedStation.location.lng);

          const marker = L.circleMarker(latLng, {
            radius: 14,
            color: "#00ffd1", // Station
            stroke: false,
          }) as CircleMarkerWithUuid;
          marker.uuid = selectedStation?.uuid;
          map.current.addLayer(marker);
        }
      }
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

  /**
   * Handle the user pressing escape key to get out of draw mode on the map
   */
  const handleUserKeyPress = useCallback(
    (evt) => {
      evt = evt || window.event;
      var isEscape = false;
      if ("key" in evt) {
        isEscape = evt.key === "Escape" || evt.key === "Esc";
      } else {
        isEscape = evt.keyCode === 27;
      }
      if (isEscape) {
        const userMapObject = userMapObjects.find(
          (userMapObject) => userMapObject.uuid === uuidOfCurrentlyActiveMapEdit.current
        );
        if (!userMapObject) return;

        const mapCancelAction =
          userMapObject?.mapAction === "create" ? "cancelCreate" : "cancelEdit";
        dispatch(
          upsertUserMapObject({
            ...userMapObjects.find((item) => item.uuid === uuidOfCurrentlyActiveMapEdit.current),
            createdAt: new Date().toISOString(),
            mapAction: mapCancelAction,
          })
        );
      }
    },
    [userMapObjects, dispatch]
  );
  useEffect(() => {
    window.addEventListener("keydown", handleUserKeyPress);

    return () => {
      window.removeEventListener("keydown", handleUserKeyPress);
    };
  }, [handleUserKeyPress]);

  /**
   * When POI color changes, change the icon on the map
   */
  useEffect(() => {
    if (!map.current) return;
    if (selectedPoi) {
      const selectedDrawControlItem = drawControlItemsRef.current.find(
        (drawControlItem) => drawControlItem.uuid === selectedPoi?.uuid
      );
      if (selectedDrawControlItem) {
        const html = `<div class="leaflet-aegis-icon">${
          selectedPoi.color ? String.fromCodePoint(parseInt(selectedPoi.color?.value, 16)) : "⚫"
        }</div>`;
        const icon = L.divIcon({ html });
        selectedDrawControlItem.drawnItemsFeatureGroup.eachLayer((layer) => {
          if (layer instanceof L.Marker) {
            layer.setIcon(icon);
          }
        });
      }
    }
  }, [selectedPoi, map]);

  return (
    <>
      <div id="map" className={styles.map} ref={mapRef}></div>
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

const convertLeafletLatLngToAegisPoint = (latLng: L.LatLng): AEGISPoint => {
  return {
    lat: latLng.lat,
    lng: latLng.lng,
  };
};

const convertLeafletLatLngsToAegisPoints = (latLngs: L.LatLng[]): AEGISPoint[] => {
  return latLngs.map((latLng) => convertLeafletLatLngToAegisPoint(latLng));
};
