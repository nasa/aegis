import L from "leaflet";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
L.Icon.Default.imagePath = "/leaflet/images/";

import styles from "./map-body.module.css";
import "rc-slider/assets/index.css";
import { useSelector, useDispatch } from "react-redux";
import { MutableRefObject, useEffect, useRef, useState } from "react";
import { RootState } from "store/index";
import _ from "lodash";
import {
  setEvaItemTriggerEdit,
  updateStationLatLngJSON,
  updateTraverseLatLngsJSON,
} from "store/eva";

// const center = [51.505, -0.09] as L.LatLngExpression; // London
const center = [64.833445, -16.378351] as L.LatLngExpression; // Iceland
const zoom = 13;

const layerBaseURL = `http://192.168.0.5:8005/NASA_AEGIS/Missions/`;

const MapBody = () => {
  const dispatch = useDispatch();
  const mapRef = useRef(null);

  const mmgisConfig = useSelector((state: RootState) => state.mmgisConfig.MMGISConfig);
  const layerControls = useSelector((state: RootState) => state.map.layerControls);
  const eva = useSelector((state: RootState) => state.eva.eva);

  const [layersOnMap, setLayersOnMap] = useState([]);

  const [uuidBeingEdited, setUuidBeingEdited] = useState(null);

  const getStateValTest = () => {
    return uuidBeingEdited;
  };

  const showMapLayers = () => {
    if (!mmgisConfig || !layerControls || !mapRef) return;

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
    mapRef.current.eachLayer((layer) => {
      if (layer.options.id) {
        if (!layerControls[layer.options.id].enabled) {
          mapRef.current.removeLayer(layer);
        }
      }
    });

    // check map layers in order
    layersToAddInOrder.map((configSublayer, index) => {
      // if layer isn't already on the map, add it
      if (!isLayerOnMapByName(mapRef, configSublayer.name)) {
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
            pane: "newPane",
            opacity: 1,
            zIndex: index,
          }
        );
        mapRef.current.addLayer(tileLayer);
        tileLayer.bringToFront();
      } else {
        // if layer is already on the map, bring it to the front. This has the effect of controlling zorder of layers
        const layer = getLayerByName(mapRef, configSublayer.name);
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
  }, [mmgisConfig, layerControls, mapRef, layersOnMap]);

  /**
   * Map events management
   */
  useEffect(() => {
    if (!mapRef.current) {
      return;
    }
    mapRef.current = L.map("map", {
      center: center,
      zoom: zoom,
    });

    const newPane = mapRef.current.createPane("newPane");
    newPane.style.zIndex = "1";

    mapRef.current.pm.addControls({
      drawMarker: true,
    });

    mapRef.current.on("pm:globaldrawmodetoggled", (e) => {
      console.log("pm:globaldrawmodetoggled", e);
    });

    // listen to vertexes being added to currently drawn layer (called workingLayer)
    mapRef.current.on("pm:drawstart", (e) => {
      console.log("pm:drawstart", getStateValTest(), e);
      e.workingLayer.on("pm:vertexadded", (e) => {
        console.log("Vertex added", e);
      });
    });

    mapRef.current.on("pm:create", (e) => {
      console.log(`pm:create: object created: ${e.layer.pm.getShape()}`);

      e.layer.uuid = getStateValTest();

      console.log("uuid: ", getStateValTest());

      if (e.layer.pm.getShape() === "Marker") {
        const latLng = e.layer.getLatLng();
        dispatch(
          updateStationLatLngJSON({ uuid: e.layer.uuid, latLngJSON: JSON.stringify(latLng) })
        );
        mapRef.current.pm.disableDraw("Marker");

        // set handler to trigger when this shape is ever edited
        e.layer.on("pm:update", (e) => {
          console.log("pm:update", e);
          const latLng = e.layer.getLatLng();
          dispatch(
            updateStationLatLngJSON({
              uuid: e.layer.uuid,
              latLngJSON: JSON.stringify(latLng),
            })
          );
          // evaItem as no longer being edited, so set the uuidBeingEdited to null
          setUuidBeingEdited(null);
        });
      } else if (e.layer.pm.getShape() === "Line") {
        // let totalLength = 0;
        // for (let i = 0; i < shape.layer.getLatLngs().length - 1; i++) {
        //   totalLength += getDistanceBetweenTwoCoordinates(
        //     shape.layer.getLatLngs()[i],
        //     shape.layer.getLatLngs()[i + 1],
        //     parseInt(mmgisConfig.config.msv.radius.major)
        //   );
        // }
        // console.log("length of the new line:", totalLength, "m");

        // add event handler for if this layer is edited
        e.layer.on("pm:update", (e) => {
          console.log("Update", e);
          const latLngs = e.layer.getLatLngs();
          dispatch(
            updateTraverseLatLngsJSON({
              uuid: e.layer.uuid,
              latLngsJSON: JSON.stringify(latLngs),
            })
          );
        });

        // put the new layer into state
        const latLngs = e.layer.getLatLngs();
        console.log("LatLngs", latLngs);
        dispatch(
          updateTraverseLatLngsJSON({ uuid: e.layer.uuid, latLngsJSON: JSON.stringify(latLngs) })
        );
      }
    });

    mapRef.current.on("pm:created", () => {
      console.log("pm:created");
      console.log(mapRef.current.pm.getGeomanLayers(true).toGeoJSON());
    });

    mapRef.current.on("pm:remove", () => {
      console.log("pm:remove");
      console.log(mapRef.current.pm.getGeomanLayers(true).toGeoJSON());
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.pm.removeControls();
        mapRef.current.pm.setGlobalOptions({ pmIgnore: true });

        mapRef.current.off();
        mapRef.current.remove();
      }
    };
  }, [mmgisConfig, mapRef]);

  useEffect(() => {
    /**
     * Set the center of the map to the center of the selected mission (config.msv.view)
     */
    if (!mapRef.current || !mmgisConfig) return;
    const config = mmgisConfig?.config;

    const center = [config?.msv?.view[0], config?.msv?.view[1]];
    const zoom = config?.msv?.view[2];

    mapRef.current.setView(center, zoom);
  }, [mmgisConfig, mapRef]);

  /**
   * Listen for editable evaItems and trigger map draw/edit modes appropriately
   */
  useEffect(() => {
    if (!eva) return;

    let evaItemWithEditTriggerSet = null;
    eva.evaItems.map((evaItem) => {
      if (evaItem.triggerEdit) {
        evaItemWithEditTriggerSet = evaItem;
      }
    });

    if (evaItemWithEditTriggerSet) {
      // We have captured the edit trigger, so set the edit as active and disable the trigger so we don't catch it again
      dispatch(setEvaItemTriggerEdit({ uuid: evaItemWithEditTriggerSet.uuid, value: false }));

      // Set that evaItem edit is underway. This allows the correct item to be updated when the L Draw action is completed
      setUuidBeingEdited(evaItemWithEditTriggerSet.uuid);

      console.log("Item being edited: ", evaItemWithEditTriggerSet);
      if (evaItemWithEditTriggerSet.type === "station") {
        // Is the station already on the map?
        if (evaItemWithEditTriggerSet.position) {
          console.log("TODO: station already on the map");
        } else {
          mapRef.current.pm.enableDraw("Marker", {
            snappable: true,
            snapDistance: 20,
          });
        }
      } else {
        // Is the line already on the map?
        if (evaItemWithEditTriggerSet.latLngsJSON) {
          console.log("TODO: line already on the map");
        } else {
          mapRef.current.pm.enableDraw("Line", {
            snappable: true,
            snapDistance: 20,
          });
        }
      }
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
