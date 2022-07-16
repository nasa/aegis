import _ from "lodash";
import { useSelector, useDispatch } from "react-redux";
import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction, MutableRefObject } from "react";
import { RootState } from "store/index";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

import { updateStationLatLngJSON, updateTraverseLatLngsJSON } from "store/eva";
import styles from "./map-body.module.css";

// const center = [51.505, -0.09] as L.LatLngExpression; // London
const center = new mapboxgl.LngLat(-16.378351, 64.833445); // Iceland
const zoom = 11;

const layerBaseURL = `http://192.168.0.5:8005/NASA_AEGIS/Missions/`;

const MapBody = () => {
  const mmgisConfig = useSelector((state: RootState) => state.mmgisConfig.MMGISConfig);
  const layerControls = useSelector((state: RootState) => state.map.layerControls);
  const eva = useSelector((state: RootState) => state.eva.eva);

  const [map, setMap] = useState<mapboxgl.Map>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  const [layersOnMap, setLayersOnMap] = useState([]);

  //init map app
  useEffect(() => {
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_KEY;

    if (!map) initializeMap(setMap, mapRef);
  }, [map]);

  /**
   * Set the center of the map to the center of the selected mission (config.msv.view)
   */
  useEffect(() => {
    if (!map || !mmgisConfig) return;
    const config = mmgisConfig?.config;

    const center = [config?.msv?.view[1], config?.msv?.view[0]];
    const zoom = config?.msv?.view[2];

    map.jumpTo({ center, zoom });
  }, [mmgisConfig, map]);

  /**
   * Add layers to map
   */
  useEffect(() => {
    showMapLayers();
  }, [mmgisConfig, layerControls, mapRef, layersOnMap]);

  function initializeMap(
    setMap: Dispatch<SetStateAction<mapboxgl.Map>>,
    mapRef: MutableRefObject<HTMLDivElement>
  ) {
    const thisMap = new mapboxgl.Map({
      container: mapRef.current,
      // style: "mapbox://styles/bfeist/ckm6yjob22j6b17o79mq0tvr7", // satellite
      style: {
        version: 8,
        sources: {},
        layers: [],
      },
      center,
      zoom,
      attributionControl: false,
      antialias: true,
    });

    thisMap.on("load", () => {
      thisMap.addControl(new mapboxgl.NavigationControl(), "top-right");

      thisMap.addControl(
        new MapboxDraw({
          displayControlsDefault: false,
          defaultMode: "draw_line_string",
          controls: {
            point: true,
            line_string: true,
          },
        }),
        "top-left"
      );

      setMap(thisMap);
      thisMap.resize();
    });
  }

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

    // remove map layers and sources that are not enabled in layerControls
    map.getStyle().layers.map((layer) => {
      if (layerControls[layer.id] !== undefined) {
        if (!layerControls[layer.id].enabled) {
          map.removeLayer(layer.id);
          map.removeSource(layer.id + "_source");
        }
      }
    });

    // check map layers in order
    layersToAddInOrder.map((configSublayer, index) => {
      // if layer isn't already on the map, add it
      if (!isLayerOnMapByName(map, configSublayer.name)) {
        // add source
        map.addSource(configSublayer.name + "_source", {
          type: "raster",
          tiles: [`${layerBaseURL}${mmgisConfig.mission}/${configSublayer.url}`],
          tileSize: 256,
          bounds: [
            configSublayer.boundingBox[0],
            configSublayer.boundingBox[1],
            configSublayer.boundingBox[2],
            configSublayer.boundingBox[3],
          ],
          scheme: configSublayer.tileformat,
          minzoom: configSublayer.minZoom,
          maxzoom: configSublayer.maxNativeZoom,
        });

        // add layer
        map.addLayer({
          id: configSublayer.name,
          type: "raster",
          source: configSublayer.name + "_source",
          minzoom: 0,
          maxzoom: 24,
        });

        map.moveLayer(configSublayer.name); // same as bring to front
      } else {
        // if layer is already on the map, bring it to the front. This has the effect of controlling zorder of layers
        map.moveLayer(configSublayer.name);
      }
    });
  };

  return <div ref={mapRef} className={styles.map}></div>;
};

export default MapBody;

const isLayerOnMapByName = (map: mapboxgl.Map, name: string) => {
  let layerFound = false;
  map.getStyle().layers.map((layer) => {
    if (layer.id === name) {
      layerFound = true;
    }
  });
  return layerFound;
};

// const getLayerByName = (map: mapboxgl.Map, name: string) => {
//   let returnVal = null;

//   map.getStyle().layers.map((layer) => {
//     if (layer.id === name) returnVal = layer;
//   });
//   return returnVal;
// };
