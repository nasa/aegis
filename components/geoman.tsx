import L, { Map } from "leaflet";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import styles from "./geoman.module.css";
import Slider from "rc-slider";
import "rc-slider/assets/index.css";
import { useDispatch, useSelector } from "react-redux";

L.Icon.Default.imagePath = "/leaflet/images/";
import { useEffect, useRef, useState } from "react";
import { getConfig, getConfigs } from "http-client/internal-api";
import { setMMGISConfig } from "store/mmgis";
import { RootState } from "store/index";
import _ from "lodash";

// const center = [51.505, -0.09] as L.LatLngExpression; // London
const center = [64.833445, -16.378351] as L.LatLngExpression; // Iceland
const zoom = 13;

const layerBaseURL = `http://192.168.0.5:8005/NASA_AEGIS/Missions/`;

const Geoman = () => {
  const dispatch = useDispatch();

  const mapRef = useRef(null);

  const [layerList, setLayerList] = useState([]);

  const [configs, setConfigs] = useState<string[]>(null);

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

    // mapRef.current.addLayer(
    //   L.tileLayer(layerBaseURL + "Iceland_v001/Layers/Landsat_TrueColor/{z}/{x}/{y}.png", {
    //     tileSize: 256,
    //     bounds: [
    //       [64.30447800311914, -17.87031300021185],
    //       [65.31466820647802, -14.9580710002728],
    //     ],
    //     tms: true,
    //     minZoom: 6,
    //     maxZoom: 11,
    //     id: "L8_RGB_30m",
    //     pane: "newPane",
    //   })
    // );

    // // Iceland large regional hillslope raster layer
    // mapRef.current.addLayer(
    //   L.tileLayer(layerBaseURL + "Iceland_v001/Layers/LargeRegional_5m_Hillslope/{z}/{x}/{y}.png", {
    //     tileSize: 256,
    //     bounds: [
    //       [64.30454312899785, -17.87031300021185],
    //       [65.3153669180373, -14.9580710002728],
    //     ],
    //     tms: true,
    //     minZoom: 6,
    //     maxZoom: 15,
    //     opacity: 0.5,
    //     pane: "newPane",
    //     id: "hillshade_5m",
    //   })
    // );

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
    (async () => {
      const thisConfigs = await getConfigs();
      setConfigs(thisConfigs.data);
    })();
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

    // mapRef.current.addLayer(
    //   L.tileLayer(`${layerBaseURL}${mmgisConfig.mission}/${testLayer.url}`, {
    //     tileSize: 256,
    //     bounds: [
    //       [testLayer.boundingBox[1], testLayer.boundingBox[0]],
    //       [testLayer.boundingBox[3], testLayer.boundingBox[2]],
    //     ],
    //     tms: testLayer.tileformat === "tms",
    //     minZoom: testLayer.minZoom,
    //     maxZoom: testLayer.maxZoom,
    //     maxNativeZoom: testLayer.maxNativeZoom,
    //     id: `${mmgisConfig.config.layers[5].name}_${testLayer.name}`,
    //     pane: "newPane",
    //   })
    // );

    let layers = [];
    mapRef.current.eachLayer(function (layer) {
      layers.push(layer);
    });
    setLayerList(layers);
  }, [mmgisConfig]);

  const loadPotrillo = () => {
    (async () => {
      const thisConfig = await getConfig("Potrillo_VF_v001");
      dispatch(setMMGISConfig(thisConfig.data));
    })();
  };

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
            <button onClick={loadPotrillo}>Load Potrillo from API</button>
            <div>API response:</div>
            <div>
              {"Number of layers in Potrillo_VF_v001:" + mmgisConfig?.config?.layers.length}
            </div>
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
