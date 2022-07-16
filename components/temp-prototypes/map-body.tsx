// import { MapContainer, TileLayer, FeatureGroup, Polyline, useMap } from "react-leaflet";
// import { EditControl } from "react-leaflet-draw";
// import L from "leaflet";
// import "leaflet-draw";
// import { useDispatch, useSelector } from "react-redux";
// import { RootState } from "store";
// import styles from "./map-body.module.css";
// import { useRef, useState } from "react";
// import { v4 as uuidv4 } from "uuid";

// L.Icon.Default.imagePath = "/leaflet/images/";

// const layerBaseURL = `http://192.168.0.5:8005/NASA_AEGIS/Missions/`;

// const TileLayers = ({
//   mmgisConfig,
//   layerControls,
// }: {
//   mmgisConfig: MMGISConfig;
//   layerControls: LayerControls;
// }) => {
//   if (!mmgisConfig || !layerControls) return;

//   const layersToAdd = [];
//   for (const configLayer of mmgisConfig.config.layers) {
//     for (const configSublayer of configLayer.sublayers) {
//       if (configSublayer.type === "tile") {
//         if (layerControls[configSublayer.name].enabled) {
//           layersToAdd.push(configSublayer);
//         }
//       }
//     }
//   }
//   // reverse the array to add the ones at the bottom of the tree first
//   const layersToAddInOrder = layersToAdd.reverse();

//   const tileLayers = layersToAddInOrder.map((configSublayer, index) => {
//     console.log(configSublayer.name);
//     return (
//       <TileLayer
//         key={configSublayer.name}
//         url={`${layerBaseURL}${mmgisConfig.mission}/${configSublayer.url}`}
//         tileSize={256}
//         bounds={[
//           [configSublayer.boundingBox[1], configSublayer.boundingBox[0]],
//           [configSublayer.boundingBox[3], configSublayer.boundingBox[2]],
//         ]}
//         tms={configSublayer.tileformat === "tms"}
//         minZoom={1}
//         minNativeZoom={configSublayer.minZoom}
//         maxZoom={configSublayer.maxZoom}
//         maxNativeZoom={configSublayer.maxNativeZoom}
//         id={`${configSublayer.name}`}
//         opacity={layerControls[configSublayer.name].opacity}
//         zIndex={index + 10}
//       />
//     );
//   });

//   return <>{tileLayers}</>;
// };

// const EditFeature = ({ editControl, setEditControl }) => {
//   const dispatch = useDispatch();
//   const editableFeatures = useRef(null);

//   const _onCreate = (e: any) => {
//     // generate a uuid and add it to the layer object in the map so it can be correlated with state
//     const newUUID = uuidv4();
//     e.layer.uuid = newUUID;

//     console.log("onCreate", e);

//     // put the new layer into state
//     if (e.layerType === "polyline") {
//       const latLngs = e.layer.getLatLngs();
//       // dispatch(addDrawLayer({ uuid: newUUID, latLngsJSON: JSON.stringify(latLngs) }));
//     }
//   };

//   const _onEdit = (e: any) => {
//     console.log("_onEdit", e);
//     console.log("Map object:", e.target);

//     // update the layer in state using uuid as key
//     e.layers.eachLayer(function (layer) {
//       const latLngs = layer.getLatLngs();
//       // dispatch(updateDrawLayer({ uuid: layer.uuid, latLngsJSON: JSON.stringify(latLngs) }));
//     });
//   };

//   const _onDelete = (e: any) => {
//     console.log(e);
//   };

//   return (
//     <FeatureGroup ref={editableFeatures}>
//       <EditControl
//         position="topright"
//         onMounted={(e) => {
//           if (editControl) return;
//           setEditControl(e);
//         }}
//         onEdited={_onEdit}
//         onCreated={_onCreate}
//         onDeleted={_onDelete}
//         draw={{
//           polyline: true,
//           marker: true,

//           rectangle: false,
//           circle: false,
//           circlemarker: false,
//           polygon: true,
//         }}
//         edit={{
//           FeatureGroup: editableFeatures.current,
//         }}
//       />
//       <PolylinesFromState />
//     </FeatureGroup>
//   );
// };

// const PolylinesFromState = () => {
//   const dispatch = useDispatch();
//   // const drawLayers = useSelector((state: RootState) => state.map.drawLayers);
//   const purpleOptions = { color: "purple" };

//   const polylines = drawLayers.map((drawLayer) => {
//     // draw any layers in state that don't have a uuid. This means they aren't on the map yet
//     if (!drawLayer.uuid) {
//       const newUuid = uuidv4();

//       const latLngs = JSON.parse(drawLayer.latLngsJSON);
//       // dispatch(addDrawLayer({ uuid: newUuid, latLngsJSON: JSON.stringify(latLngs) }));

//       return (
//         <Polyline
//           // uuid={newUuid}
//           key={drawLayer.uuid}
//           pathOptions={purpleOptions}
//           positions={latLngs}
//         />
//       );
//     }
//   });
//   return polylines;
// };

// export default function Map() {
//   const dispatch = useDispatch();
//   const mapRef = useRef(null);
//   const [editControl, setEditControl] = useState(null);
//   const mmgisConfig = useSelector((state: RootState) => state.mmgisConfig.MMGISConfig);
//   const layerControls = useSelector((state: RootState) => state.map.layerControls);
//   const drawLayers = useSelector((state: RootState) => state.map.drawLayers);

//   if (!mmgisConfig || !layerControls) return;

//   const center = mmgisConfig
//     ? ([
//         parseFloat(mmgisConfig.config.msv.view[0]),
//         parseFloat(mmgisConfig?.config?.msv?.view[1]),
//       ] as [number, number])
//     : ([0, 0] as [number, number]);
//   const zoom = mmgisConfig ? parseInt(mmgisConfig.config.msv.view[2]) : 11;

//   return (
//     <div className={styles.mapContainer}>
//       <button
//         onClick={() => {
//           // editControl._toolbars.draw._modes.polyline.handler.enable();
//           // editControl._toolbars.draw._modes.polygon.handler.enable();
//           mapRef.current.leafletElement.pm.enableDraw("Polyline");
//         }}
//       >
//         Add Station
//       </button>
//       <button
//         onClick={() => {
//           const map = mapRef.current;

//           const searchUuid = drawLayers[0].uuid;

//           let searchLayer = null;
//           map.eachLayer(function (layer) {
//             if (layer.uuid === searchUuid) {
//               searchLayer = layer;
//             }
//           });

//           console.log(searchLayer);

//           searchLayer.editing.enable();
//         }}
//       >
//         Edit
//       </button>
//       <button
//         onClick={() => {
//           const map = mapRef.current;

//           const searchUuid = drawLayers[0].uuid;

//           let searchLayer = null;
//           map.eachLayer(function (layer) {
//             if (layer.uuid === searchUuid) {
//               searchLayer = layer;
//             }
//           });

//           console.log(searchLayer);

//           searchLayer.editing.disable();
//           const latLngs = searchLayer.getLatLngs();
//           dispatch(
//             updateDrawLayer({ uuid: searchLayer.uuid, latLngsJSON: JSON.stringify(latLngs) })
//           );
//         }}
//       >
//         Stop Edit
//       </button>
//       <MapContainer
//         ref={mapRef}
//         center={center}
//         zoom={zoom}
//         scrollWheelZoom={true}
//         style={{ width: "100%", height: "100%" }}
//       >
//         <TileLayers mmgisConfig={mmgisConfig} layerControls={layerControls} />
//         <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" zIndex={1} />

//         <EditFeature editControl={editControl} setEditControl={setEditControl} />
//       </MapContainer>
//     </div>
//   );
// }
