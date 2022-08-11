import L from "leaflet";
L.Icon.Default.imagePath = "/leaflet/images/";
import "leaflet-draw";

import styles from "components/interface/map-body.module.css";

import { useSelector, useDispatch } from "react-redux";
import { MutableRefObject, useEffect, useRef, useState } from "react";
import { RootState } from "store/index";
import _ from "lodash";
import { setEvaItemMapAction, updateStationLatLngJSON, updateTraverseLatLngsJSON } from "store/eva";

// const center = [51.505, -0.09] as L.LatLngExpression; // London
const center = [64.833445, -16.378351] as L.LatLngExpression; // Iceland
const zoom = 13;

const layerBaseURL = `http://192.168.0.5:8005/NASA_AEGIS/Missions/`;

const MapBody = () => {
  const dispatch = useDispatch();
  const mapRef = useRef(null);
  const map = useRef(null);
  const drawControlRef = useRef(null);
  const drawHandlerRef = useRef(null);
  const drawnItemsRef = useRef(null);
  const displayedItemsRef = useRef(null);

  const mmgisConfig = useSelector((state: RootState) => state.mmgisConfig.MMGISConfig);
  const layerControls = useSelector((state: RootState) => state.map.layerControls);
  const eva = useSelector((state: RootState) => state.eva.eva);

  const [layersOnMap, setLayersOnMap] = useState([]);

  // const [uuidBeingEdited, setUuidBeingEdited] = useState(null);
  const uuidBeingEdited = useRef(null);

  const showMapLayers = () => {
    if (!mmgisConfig || !layerControls || !map) return;

    // go through all layers in mission config and add make a list of the ones that are enabled
    const layersToAdd = [];
    for (const configLayer of mmgisConfig.config.layers) {
      for (const configSublayer of configLayer.sublayers) {
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
        const tileLayer = L.tileLayer(
          `${layerBaseURL}${mmgisConfig.mission}/${configSublayer.url}`,
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
            opacity: 1,
            zIndex: index,
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
  };

  /**
   * Map tile layers display management
   */
  useEffect(() => {
    showMapLayers();
  }, []);

  useEffect(() => {
    showMapLayers();
  }, [mmgisConfig, layerControls, map, layersOnMap]);

  /**
   * Map events management
   */
  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    // Instantiate the map
    if (!map.current) {
      map.current = L.map("map", {
        center: center,
        zoom: zoom,
      });

      drawnItemsRef.current = new L.FeatureGroup();
      map.current.addLayer(drawnItemsRef.current);
      drawControlRef.current = new L.Control.Draw({
        draw: {
          polygon: false,
          rectangle: false,
          circle: false,
          circlemarker: false,
        },
        edit: {
          featureGroup: drawnItemsRef.current,
          edit: {
            selectedPathOptions: {
              opacity: 0.3,
            },
          },
        },
      });
      map.current.addControl(drawControlRef.current);

      console.log("map", map.current);
    }

    // listen to vertexes being added to currently drawn layer (called workingLayer)
    // map.current.on(L.Draw.Event.DRAWSTART, (e) => {
    //   console.log("draw:drawstart", getStateValTest(), e);
    //   e.workingLayer.on(L.Draw.Event.DRAWVERTEX, (e) => {
    //     console.log("draw:drawvertex: Vertex added", e);
    //   });
    // });

    map.current.on("click", (e) => {
      console.log("click", e);
    });

    map.current.on("draw:drawstart", (e) => {
      console.log("draw:drawstart", e);
    });

    map.current.on("draw:created", (e) => {
      console.log(`draw:created:`, e);

      drawnItemsRef.current.addLayer(e.layer);

      const uuid = uuidBeingEdited.current;
      e.layer.uuid = uuidBeingEdited.current;

      console.log("uuid: ", uuidBeingEdited.current);

      if (e.layerType === "marker") {
        const latLng = e.layer.getLatLng();
        console.log("LatLng", latLng);
        dispatch(updateStationLatLngJSON({ uuid, latLngJSON: JSON.stringify(latLng) }));
      } else {
        const latLngs = e.layer.getLatLngs();
        console.log("LatLngs", latLngs);
        dispatch(updateTraverseLatLngsJSON({ uuid, latLngsJSON: JSON.stringify(latLngs) }));
      }
      uuidBeingEdited.current = null;
      dispatch(setEvaItemMapAction({ uuid, value: null }));
    });

    map.current.on("draw:edited", (e) => {
      console.log(`draw:edited:`, e);
      // update the layer in state using uuid as key
      e.layers.eachLayer(function (layer) {
        if (layer["uuid"]) {
          if (layer instanceof L.Marker) {
            const latLng = layer.getLatLng();
            dispatch(
              updateStationLatLngJSON({ uuid: layer["uuid"], latLngJSON: JSON.stringify(latLng) })
            );
          } else {
            const latLngs = layer.getLatLngs();
            console.log("LatLngs", latLngs);
            dispatch(
              updateTraverseLatLngsJSON({
                uuid: layer["uuid"],
                latLngsJSON: JSON.stringify(latLngs),
              })
            );
          }
          dispatch(setEvaItemMapAction({ uuid: layer["uuid"], value: null }));
        }
      });
    });

    return () => {
      if (map.current) {
        map.current.off();
        map.current.remove();
      }
    };
  }, [mmgisConfig, mapRef, drawControlRef]);

  useEffect(() => {
    /**
     * Set the center of the map to the center of the selected mission (config.msv.view)
     */
    if (!map.current || !mmgisConfig) return;
    const config = mmgisConfig?.config;

    const center = [config?.msv?.view[0], config?.msv?.view[1]];
    const zoom = config?.msv?.view[2];

    map.current.setView(center, zoom);
  }, [mmgisConfig, map]);

  /**
   * Listen for editable evaItems and trigger map draw/edit modes appropriately
   */
  useEffect(() => {
    if (!eva) return;

    let evaItemWithMapActionSet = null;
    eva.evaItems.map((evaItem) => {
      if (evaItem.mapAction) {
        evaItemWithMapActionSet = evaItem;
      }
    });

    if (evaItemWithMapActionSet) {
      // Set that evaItem edit is underway. This allows the correct item to be updated when the L Draw action is completed
      uuidBeingEdited.current = evaItemWithMapActionSet.uuid;

      // trigger the map create / edit / cancel event
      if (evaItemWithMapActionSet.triggerAction === "create") {
        if (evaItemWithMapActionSet.type === "traverse") {
          drawHandlerRef.current = new L.Draw.Polyline(
            map.current,
            drawControlRef.current.options.polyline
          ).enable();
        } else {
          drawHandlerRef.current = new L.Draw.Marker(
            map.current,
            drawControlRef.current.options.marker
          );
          drawHandlerRef.current.enable();
        }
      } else if (evaItemWithMapActionSet.triggerAction === "cancelCreate") {
        console.log("cancelCreate");
        drawHandlerRef.current.disable();
        clearAction();
      } else if (evaItemWithMapActionSet.triggerAction === "edit") {
        drawControlRef.current._toolbars.edit._modes.edit.handler.enable();
      } else if (evaItemWithMapActionSet.triggerAction === "cancelEdit") {
        drawControlRef.current._toolbars.edit._modes.edit.handler.disable();
        clearAction();
      } else if (evaItemWithMapActionSet.triggerAction === "saveEdit") {
        drawControlRef.current._toolbars.edit._modes.edit.handler.save();
        drawControlRef.current._toolbars.edit._modes.edit.handler.disable();
        clearAction();
      }
    }

    function clearAction() {
      dispatch(setEvaItemMapAction({ uuid: evaItemWithMapActionSet.uuid, value: null }));
      uuidBeingEdited.current = null;
    }
  }, [eva]);

  return (
    <>
      <div id="map" className={styles.map} ref={mapRef}></div>
    </>
  );
};

export default MapBody;

const isLayerOnMapByName = (mapRef: MutableRefObject<any>, name: string) => {
  let layerFound = false;
  mapRef.current.eachLayer((layer) => {
    if (layer.options.id === name) layerFound = true;
  });
  return layerFound;
};

const getLayerByName = (mapRef: MutableRefObject<any>, name: string) => {
  let returnVal = null;

  mapRef.current.eachLayer((layer) => {
    if (layer.options.id === name) returnVal = layer;
  });
  return returnVal;
};
