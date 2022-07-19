import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FeatureGroup, MapContainer, TileLayer } from "react-leaflet";
import L from "leaflet";
// Marker icon location
L.Icon.Default.imagePath = "/leaflet/images/";

import styles from "./map-body.module.css";

import { v4 as uuidv4 } from "uuid";

import { useDispatch, useSelector } from "react-redux";
import { RootState } from "store";
import { EditControl } from "react-leaflet-draw";
import {
  setEvaItemTriggerAction,
  updateStationLatLngJSON,
  updateTraverseLatLngsJSON,
} from "store/eva";
import _ from "lodash";
import { layer } from "@fortawesome/fontawesome-svg-core";

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

export default function MapBody() {
  const dispatch = useDispatch();
  const mmgisConfig = useSelector((state: RootState) => state.mmgisConfig.MMGISConfig);
  const layerControls = useSelector((state: RootState) => state.map.layerControls);
  const eva = useSelector((state: RootState) => state.eva.eva);

  const editableFeatures = useRef(null);
  const editRef = useRef(null);

  const [map, setMap] = useState(null);

  const uuidBeingEdited = useRef(null);

  /**
   * Set initial map center and zoom
   */
  useEffect(() => {
    if (!map || !mmgisConfig || !layerControls) return;
    const center = mmgisConfig
      ? ([
          parseFloat(mmgisConfig.config.msv.view[0]),
          parseFloat(mmgisConfig?.config?.msv?.view[1]),
        ] as [number, number])
      : ([0, 0] as [number, number]);
    const zoom = mmgisConfig ? parseInt(mmgisConfig.config.msv.view[2]) : 11;

    map.setView(center, zoom);
  }, [map, mmgisConfig, layerControls]);

  const _onCreate = (e: any) => {
    console.log("_onCreate", e);

    // set the eva item UUID in the map layer
    const uuid = uuidBeingEdited.current;
    e.layer.uuid = uuid;
    console.log("uuid being edited: ", uuid);

    if (e.layerType === "marker") {
      const latLng = e.layer.getLatLng();
      console.log("LatLng", latLng);
      dispatch(updateStationLatLngJSON({ uuid, latLngJSON: JSON.stringify(latLng) }));
    } else {
      const latLngs = e.layer.getLatLngs();
      console.log("LatLngs", latLngs);
      dispatch(updateTraverseLatLngsJSON({ uuid, latLngsJSON: JSON.stringify(latLngs) }));
    }
    uuidBeingEdited.current = null;
    dispatch(setEvaItemTriggerAction({ uuid, value: null }));
  };

  const _onEdit = (e: any) => {
    console.log("_onEdit", e);
    // update the layer in state using uuid as key
    e.layers.eachLayer(function (layer) {
      if (layer["uuid"]) {
        if (layer instanceof L.Marker) {
          const latLng = layer.getLatLng();
          dispatch(
            updateStationLatLngJSON({ uuid: layer["uuid"], latLngJSON: JSON.stringify(latLng) })
          );
        } else {
          const latLngs = layer.getLatLngs();
          console.log("LatLngs", latLngs);
          dispatch(
            updateTraverseLatLngsJSON({ uuid: layer["uuid"], latLngsJSON: JSON.stringify(latLngs) })
          );
        }
        dispatch(setEvaItemTriggerAction({ uuid: layer["uuid"], value: null }));
      }
    });
  };

  const _onDelete = (e: any) => {
    console.log(e);
  };

  /**
   * Listen for editable evaItems and trigger map draw/edit modes appropriately
   */
  useEffect(() => {
    if (!eva) return;

    let evaItemWithEditTriggerSet = null;
    eva.evaItems.map((evaItem) => {
      if (evaItem.triggerAction) {
        evaItemWithEditTriggerSet = evaItem;
      }
    });

    if (!_.isNull(evaItemWithEditTriggerSet)) {
      // We have captured the edit trigger, so set the edit as active and disable the trigger so we don't catch it again
      // dispatch(setEvaItemTriggerAction({ uuid: evaItemWithEditTriggerSet.uuid, value: null }));

      // Set that evaItem edit is underway. This allows the correct item to be updated when the L Draw action is completed
      console.log("setUuidBeingEdited", evaItemWithEditTriggerSet.uuid);
      uuidBeingEdited.current = evaItemWithEditTriggerSet.uuid;

      if (evaItemWithEditTriggerSet.triggerAction === "create") {
        if (evaItemWithEditTriggerSet.type === "station") {
          editRef.current._toolbars.draw._modes.marker.handler.enable();
        } else {
          editRef.current._toolbars.draw._modes.polyline.handler.enable();
        }
      } else if (evaItemWithEditTriggerSet.triggerAction === "cancelCreate") {
        editRef.current._toolbars.draw._modes.polyline.handler.disable();
        editRef.current._toolbars.draw._modes.marker.handler.disable();
        cancel();
      } else if (evaItemWithEditTriggerSet.triggerAction === "edit") {
        editRef.current._toolbars.edit._modes.edit.handler.enable();
      } else if (evaItemWithEditTriggerSet.triggerAction === "cancelEdit") {
        // editRef.current._toolbars.edit._modes.edit.handler.disable();
        map.fire("draw:editcancel");
        cancel();
      } else if (evaItemWithEditTriggerSet.triggerAction === "saveEdit") {
        editRef.current._toolbars.edit._modes.edit.handler.save();
        editRef.current._toolbars.edit._modes.edit.handler.disable();
      }
    }

    function cancel() {
      dispatch(setEvaItemTriggerAction({ uuid: evaItemWithEditTriggerSet.uuid, value: null }));
      uuidBeingEdited.current = null;
    }
  }, [eva, editRef]);

  const displayMap = useMemo(
    () => (
      <MapContainer
        center={[0, 0]}
        zoom={11}
        scrollWheelZoom={true}
        ref={setMap}
        style={{ width: "100%", height: "100%" }}
      >
        {/* only show the basemap if on Earth */}
        {mmgisConfig?.config?.msv?.radius?.minor === "6378137" && (
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        )}
        <TileLayers mmgisConfig={mmgisConfig} layerControls={layerControls} />

        <FeatureGroup ref={editableFeatures}>
          <EditControl
            position="topright"
            onMounted={(e) => {
              editRef.current = e;
            }}
            onEdited={_onEdit}
            onCreated={_onCreate}
            onDeleted={_onDelete}
            draw={{
              polyline: true,
              marker: true,

              rectangle: false,
              circle: false,
              circlemarker: false,
              polygon: false,
            }}
            edit={{
              FeatureGroup: editableFeatures.current,
            }}
          />
          {/* <PolylinesFromState /> */}
        </FeatureGroup>
      </MapContainer>
    ),
    [mmgisConfig, layerControls]
  );

  return (
    <div className={styles.mapContainer}>
      <div></div>
      {displayMap}
    </div>
  );
}
