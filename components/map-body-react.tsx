import { MapContainer, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet-draw";
L.Icon.Default.imagePath = "/leaflet/images/";
import { useState, useCallback, useEffect } from "react";
import { useSelector } from "react-redux";
import { RootState } from "store";
import styles from "./map-body.module.css";

const layerBaseURL = `http://192.168.0.5:8005/NASA_AEGIS/Missions/`;

function DisplayPosition({ map }) {
  const [position, setPosition] = useState(() => map.getCenter());

  const onMove = useCallback(() => {
    setPosition(map.getCenter());
  }, [map]);

  useEffect(() => {
    map.on("move", onMove);
    return () => {
      map.off("move", onMove);
    };
  }, [map, onMove]);

  return (
    <p>
      latitude: {position.lat.toFixed(12)}, longitude: {position.lng.toFixed(12)}
    </p>
  );
}

const TileLayers = ({
  mmgisConfig,
  layerControls,
}: {
  mmgisConfig: MMGISConfig;
  layerControls: LayerControls;
}) => {
  if (!mmgisConfig || !layerControls) return;

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

  const tileLayers = layersToAddInOrder.map((configSublayer, index) => {
    console.log(configSublayer.name);
    return (
      <TileLayer
        key={configSublayer.name}
        url={`${layerBaseURL}${mmgisConfig.mission}/${configSublayer.url}`}
        tileSize={256}
        bounds={[
          [configSublayer.boundingBox[1], configSublayer.boundingBox[0]],
          [configSublayer.boundingBox[3], configSublayer.boundingBox[2]],
        ]}
        tms={configSublayer.tileformat === "tms"}
        minZoom={1}
        minNativeZoom={configSublayer.minZoom}
        maxZoom={configSublayer.maxZoom}
        maxNativeZoom={configSublayer.maxNativeZoom}
        id={`${configSublayer.name}`}
        opacity={layerControls[configSublayer.name].opacity}
        zIndex={index + 10}
      />
    );
  });

  return <>{tileLayers}</>;
};

export default function Map() {
  const [map, setMap] = useState(null);
  const mmgisConfig = useSelector((state: RootState) => state.mmgisConfig.MMGISConfig);
  const layerControls = useSelector((state: RootState) => state.user.layerControls);

  if (!mmgisConfig || !layerControls) return;

  const center = mmgisConfig
    ? ([
        parseFloat(mmgisConfig.config.msv.view[0]),
        parseFloat(mmgisConfig?.config?.msv?.view[1]),
      ] as [number, number])
    : ([0, 0] as [number, number]);
  const zoom = mmgisConfig ? parseInt(mmgisConfig.config.msv.view[2]) : 11;

  return (
    <div className={styles.mapContainer}>
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={true}
        style={{ width: "100%", height: "100%" }}
        ref={setMap}
      >
        <TileLayers mmgisConfig={mmgisConfig} layerControls={layerControls} />
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" zIndex={1} />
      </MapContainer>
    </div>
  );
}
