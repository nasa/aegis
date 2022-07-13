import L from "leaflet";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import styles from "./geoman.module.css";
import Slider from "rc-slider";
import "rc-slider/assets/index.css";
import { useSelector } from "react-redux";

L.Icon.Default.imagePath = "/leaflet/images/";
import { useEffect, useRef, useState } from "react";
import { RootState } from "store/index";
import _ from "lodash";

// const center = [51.505, -0.09] as L.LatLngExpression; // London
const center = [64.833445, -16.378351] as L.LatLngExpression; // Iceland
const zoom = 13;

const layerBaseURL = `http://192.168.0.5:8005/NASA_AEGIS/Missions/`;

const Geoman = () => {
  const mapRef = useRef(null);

  const [layerList, setLayerList] = useState([]);

  const mmgisConfig = useSelector((state: RootState) => state.mmgisConfig.MMGISConfig);

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

    // let layers = [];
    // mapRef.current.eachLayer(function (layer) {
    //   layers.push(layer);
    // });
    // setLayerList(layers);

    return () => {
      mapRef.current.pm.removeControls();
      // mapRef.current.pm.setGlobalOptions({ pmIgnore: true });
      mapRef.current.off();
      mapRef.current.remove();
    };
  }, []);

  useEffect(() => {
    if (!mmgisConfig) return;

    for (const layer of mmgisConfig.config.layers) {
      for (const sublayer of layer.sublayers) {
        if (sublayer.type === "tile") {
          const tileLayer = L.tileLayer(`${layerBaseURL}${mmgisConfig.mission}/${sublayer.url}`, {
            tileSize: 256,
            bounds: [
              [sublayer.boundingBox[1], sublayer.boundingBox[0]],
              [sublayer.boundingBox[3], sublayer.boundingBox[2]],
            ],
            tms: sublayer.tileformat === "tms",
            minZoom: sublayer.minZoom,
            maxZoom: sublayer.maxZoom,
            maxNativeZoom: sublayer.maxNativeZoom,
            id: `${layer.name}_${sublayer.name}`,
            pane: "newPane",
            opacity: 0.5,
          });
          mapRef.current.addLayer(tileLayer);
        }
      }
    }

    let layers = [];
    mapRef.current.eachLayer(function (layer) {
      layers.push(layer);
    });
    setLayerList(layers);
  }, [mmgisConfig]);

  return (
    <>
      <div id="map" className={styles.map} ref={mapRef}></div>
      <div className={styles.topright}>
        <div className={styles.menu}>
          <div className={styles.title}>Map Layers (Iceland)</div>
          <div>{makeLayerControls()}</div>

          <div className={styles.options}>
            <div className={styles.title} style={{ padding: "0" }}>
              Options
            </div>
            <button
              onClick={() => {
                mapRef.current.setView(new L.LatLng(29.564491, -95.081471));
              }}
            >
              Houston
            </button>
            <button
              onClick={() => {
                mapRef.current.setView(new L.LatLng(31.971944, -106.964722));
              }}
            >
              Kilbourne Hole
            </button>
            <button
              onClick={() => {
                mapRef.current.setView(new L.LatLng(64.833445, -16.378351));
              }}
            >
              Iceland
            </button>
          </div>
          <div className={styles.options} style={{ marginTop: "10px" }}>
            <div>MMGISConfig:</div>
            <div>{"Number of layer categories:" + mmgisConfig?.config?.layers.length}</div>
          </div>
        </div>
      </div>
    </>
  );

  function makeLayerControls() {
    if (!mapRef.current || layerList.length === 0) {
      return;
    }
    const layers = layerList.map((layer) => {
      return (
        <div className={styles.layer_container} key={layer.options.id}>
          <div>{layer.options.id}</div>
          <Slider
            className={styles.slider}
            min={0}
            max={100}
            defaultValue={100}
            onChange={(value) => {
              layer.setOpacity((value as number) / 100);
            }}
          />
        </div>
      );
    });
    return layers;
  }
};

export default Geoman;
