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

const layerBaseURL = `http://192.168.0.5:8005/NASA_AEGIS/Missions/Iceland_v001/Layers/`;

const Geoman = () => {
  const dispatch = useDispatch();

  const mapRef = useRef(null);

  const [layerList, setLayerList] = useState([]);

  const [configs, setConfigs] = useState<string[]>(null);

  const config = useSelector((state: RootState) => state.mmgisConfig);

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

    mapRef.current.addLayer(
      L.tileLayer(layerBaseURL + "Landsat_TrueColor/{z}/{x}/{y}.png", {
        tileSize: 256,
        bounds: [
          [64.30447800311914, -17.87031300021185],
          [65.31466820647802, -14.9580710002728],
        ],
        tms: true,
        minZoom: 6,
        maxZoom: 11,
        id: "L8_RGB_30m",
        pane: "newPane",
      })
    );

    // Iceland large regional hillslope raster layer
    mapRef.current.addLayer(
      L.tileLayer(layerBaseURL + "LargeRegional_5m_Hillslope/{z}/{x}/{y}.png", {
        tileSize: 256,
        bounds: [
          [64.30454312899785, -17.87031300021185],
          [65.3153669180373, -14.9580710002728],
        ],
        tms: true,
        minZoom: 6,
        maxZoom: 15,
        opacity: 0.5,
        pane: "newPane",
        id: "hillshade_5m",
      })
    );

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

    let layers = [];
    mapRef.current.eachLayer(function (layer) {
      layers.push(layer);
    });
    setLayerList(layers);

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

  const loadPotrillo = () => {
    (async () => {
      const thisConfig = await getConfig("Potrillo_VF_v001");
      // setConfig(myConfig.data);
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
              {"Number of layers in Potrillo_VF_v001:" + config.MMGISConfig?.config?.layers.length}
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
