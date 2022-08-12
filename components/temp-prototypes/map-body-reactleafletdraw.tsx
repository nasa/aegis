// import { MapContainer, TileLayer, FeatureGroup, Polyline, useMap } from "react-leaflet";
// import { EditControl } from "react-leaflet-draw";
// import L from "leaflet";
// import "leaflet-draw";
// import { useDispatch, useSelector } from "react-redux";
// import { RootState } from "store";
// import styles from "./map-body.module.css";
// import { useEffect, useMemo, useRef, useState } from "react";
// import { v4 as uuidv4 } from "uuid";
// // import { setEvaItemTriggerEdit } from "store/eva";

// L.Icon.Default.imagePath = "/leaflet/images/";

// const layerBaseURL = process.env.NEXT_PUBLIC_LAYER_BASE_URL;

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

// const EditFeature = () => {
//   const dispatch = useDispatch();
//   const eva = useSelector((state: RootState) => state.eva.eva);
//   const editableFeatures = useRef(null);
//   const editRef = useRef(null);
//   const [uuidBeingEdited, setUuidBeingEdited] = useState(null);

//   /**
//    * Listen for editable evaItems and trigger map draw/edit modes appropriately
//    */
//   useEffect(() => {
//     if (!eva) return;

//     let evaItemWithEditTriggerSet = null;
//     eva.evaItems.map((evaItem) => {
//       // if (evaItem.triggerEdit) {
//       //   evaItemWithEditTriggerSet = evaItem;
//       // }
//     });

//     if (evaItemWithEditTriggerSet) {
//       // We have captured the edit trigger, so set the edit as active and disable the trigger so we don't catch it again
//       // dispatch(setEvaItemTriggerEdit({ uuid: evaItemWithEditTriggerSet.uuid, value: false }));

//       // Set that evaItem edit is underway. This allows the correct item to be updated when the L Draw action is completed
//       setUuidBeingEdited(evaItemWithEditTriggerSet.uuid);

//       console.log("Item being edited: ", evaItemWithEditTriggerSet);
//       if (evaItemWithEditTriggerSet.type === "station") {
//         // Is the station already on the map?
//         if (evaItemWithEditTriggerSet.position) {
//           console.log("TODO: station already on the map");
//         } else {
//           editRef.current._toolbars.draw._modes.marker.handler.enable();
//           // debugger;
//         }
//       } else {
//         // Is the line already on the map?
//         if (evaItemWithEditTriggerSet.latLngsJSON) {
//           console.log("TODO: line already on the map");
//         } else {
//           // mapRef.current.pm.enableDraw("Line", {
//           //   snappable: true,
//           //   snapDistance: 20,
//           // });
//         }
//       }
//     }
//   }, [eva, editRef]);

//   const _onCreate = (e: any) => {
//     // generate a uuid and add it to the layer object in the map so it can be correlated with state
//     const newUUID = uuidv4();
//     e.layer.uuid = newUUID;

//     console.log("_onCreate", e);

//     // put the new layer into state
//     if (e.layerType === "polyline") {
//       // const latLngs = e.layer.getLatLngs();
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
//           editRef.current = e;
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
//           polygon: false,
//         }}
//         edit={{
//           FeatureGroup: editableFeatures.current,
//         }}
//       />
//       {/* <PolylinesFromState /> */}
//     </FeatureGroup>
//   );
// };

// const PolylinesFromState = () => {
//   const dispatch = useDispatch();
//   const evaItems = useSelector((state: RootState) => state.eva.eva.evaItems);
//   const purpleOptions = { color: "purple" };

//   // TODO

//   const polylines = evaItems.map((evaItem) => {
//     // draw any layers in state that don't have a uuid. This means they aren't on the map yet
//     if (!evaItem.uuid) {
//       const newUuid = uuidv4();

//       const latLngs = JSON.parse(evaItem.latLngsJSON);
//       // dispatch(addDrawLayer({ uuid: newUuid, latLngsJSON: JSON.stringify(latLngs) }));

//       return (
//         <Polyline
//           // uuid={newUuid}
//           key={evaItem.uuid}
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
//   const [map, setMap] = useState(null);
//   const mmgisConfig = useSelector((state: RootState) => state.mmgisConfig.MMGISConfig);
//   const layerControls = useSelector((state: RootState) => state.map.layerControls);

//   if (!mmgisConfig || !layerControls) return;

//   const center = mmgisConfig
//     ? ([
//         parseFloat(mmgisConfig.config.msv.view[0]),
//         parseFloat(mmgisConfig?.config?.msv?.view[1]),
//       ] as [number, number])
//     : ([0, 0] as [number, number]);
//   const zoom = mmgisConfig ? parseInt(mmgisConfig.config.msv.view[2]) : 11;

//   const displayMap = (
//     <MapContainer
//       center={center}
//       zoom={zoom}
//       scrollWheelZoom={true}
//       style={{ width: "100%", height: "100%" }}
//       ref={setMap}
//     >
//       <TileLayers mmgisConfig={mmgisConfig} layerControls={layerControls} />
//       <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" zIndex={1} />

//       <EditFeature />
//     </MapContainer>
//   );

//   return <div className={styles.mapContainer}>{displayMap}</div>;
// }
