import { MapContainer, TileLayer, FeatureGroup, Polyline } from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import L from "leaflet";
import "leaflet-draw";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "store";
import styles from "./map-body.module.css";
import { addDrawLayer, updateDrawLayer } from "store/map";

L.Icon.Default.imagePath = "/leaflet/images/";

const layerBaseURL = `http://192.168.0.5:8005/NASA_AEGIS/Missions/`;

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

const EditFeature = () => {
  const dispatch = useDispatch();

  const _onCreate = (e: any) => {
    console.log(e);
    if (e.layerType === "polyline") {
      const { _leaflet_id }: { _leaflet_id: number } = e.layer;
      const latLngs = e.layer.getLatLngs();
      dispatch(addDrawLayer({ id: _leaflet_id, latLngsJSON: JSON.stringify(latLngs) }));
    }
  };

  const _onEdit = (e: any) => {
    console.log(e);
    e.layers.eachLayer(function (layer) {
      const { _leaflet_id }: { _leaflet_id: number } = layer;
      const latLngs = layer.getLatLngs();
      dispatch(updateDrawLayer({ id: _leaflet_id, latLngsJSON: JSON.stringify(latLngs) }));
    });
  };

  const _onDelete = (e: any) => {
    console.log(e);
  };

  return (
    <FeatureGroup>
      <EditControl
        position="topright"
        onEdited={_onEdit}
        onCreated={_onCreate}
        onDeleted={_onDelete}
        draw={{
          polyline: true,

          rectangle: false,
          circle: false,
          circlemarker: false,
          marker: false,
          polygon: false,
        }}
      />
    </FeatureGroup>
  );
};

const PolylinesFromState = () => {
  const drawLayers = useSelector((state: RootState) => state.map.drawLayers);
  const purpleOptions = { color: "purple" };

  const polylines = drawLayers.map((drawLayer) => {
    const latLngs = JSON.parse(drawLayer.latLngsJSON);
    return <Polyline key={drawLayer.id} pathOptions={purpleOptions} positions={latLngs} />;
  });
  return polylines;
};

export default function Map() {
  const mmgisConfig = useSelector((state: RootState) => state.mmgisConfig.MMGISConfig);
  const layerControls = useSelector((state: RootState) => state.map.layerControls);

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
      >
        <TileLayers mmgisConfig={mmgisConfig} layerControls={layerControls} />
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" zIndex={1} />

        <EditFeature />

        <PolylinesFromState />
      </MapContainer>
    </div>
  );
}
