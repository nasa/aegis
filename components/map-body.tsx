import L from "leaflet";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import styles from "./map-body.module.css";
import "rc-slider/assets/index.css";
import { useSelector } from "react-redux";

L.Icon.Default.imagePath = "/leaflet/images/";
import { useEffect, useRef } from "react";
import { RootState } from "store/index";
import _ from "lodash";

// const center = [51.505, -0.09] as L.LatLngExpression; // London
const center = [64.833445, -16.378351] as L.LatLngExpression; // Iceland
const zoom = 13;

const layerBaseURL = `http://192.168.0.5:8005/NASA_AEGIS/Missions/`;

const MapBody = () => {
  const mapRef = useRef(null);

  const mmgisConfig = useSelector((state: RootState) => state.mmgisConfig.MMGISConfig);
  const layerControls = useSelector((state: RootState) => state.user.layerControls);

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
      console.log("Global Draw Toggled", e);
    });

    // listen to vertexes being added to currently drawn layer (called workingLayer)
    mapRef.current.on("pm:drawstart", ({ workingLayer }) => {
      console.log("Draw start");
      workingLayer.on("pm:vertexadded", (e) => {
        console.log("Vertex added", e);
      });
    });

    mapRef.current.on("pm:create", (e) => {
      if (e.layer && e.layer.pm) {
        const shape = e;
        console.log("Create", e);

        // enable editing of circle
        shape.layer.pm.enable();

        console.log(`object created: ${shape.layer.pm.getShape()}`);
        // console.log(mapRef.current.pm.getGeomanLayers(true).toGeoJSON());
        mapRef.current.pm.getGeomanLayers(true).bindPopup("i am whole").openPopup();
        mapRef.current.pm
          .getGeomanLayers()
          .map((layer, index) => layer.bindPopup(`I am figure N° ${index}`));
        shape.layer.on("pm:edit", () => {
          console.log(mapRef.current.pm.getGeomanLayers(true).toGeoJSON());
        });
      }
    });

    mapRef.current.on("pm:remove", () => {
      console.log("object removed");
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
  }, []);

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

  useEffect(() => {
    /**
     * Add layers to map
     */
    if (!mmgisConfig || !layerControls || !mapRef) return;

    // clear all layers
    mapRef.current.eachLayer((layer) => {
      mapRef.current.removeLayer(layer);
    });

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
    const layerToAddInOrder = layersToAdd.reverse();

    //add layers to map
    layerToAddInOrder.map((configSublayer) => {
      const tileLayer = L.tileLayer(`${layerBaseURL}${mmgisConfig.mission}/${configSublayer.url}`, {
        tileSize: 256,
        bounds: [
          [configSublayer.boundingBox[1], configSublayer.boundingBox[0]],
          [configSublayer.boundingBox[3], configSublayer.boundingBox[2]],
        ],
        tms: configSublayer.tileformat === "tms",
        minZoom: configSublayer.minZoom,
        maxZoom: configSublayer.maxZoom,
        maxNativeZoom: configSublayer.maxNativeZoom,
        id: `${configSublayer.name}`,
        pane: "newPane",
        opacity: 1,
      });

      mapRef.current.addLayer(tileLayer);
    });
  }, [mmgisConfig, layerControls, mapRef]);

  return (
    <>
      <div id="map" className={styles.map} ref={mapRef}></div>
    </>
  );
};

export default MapBody;
