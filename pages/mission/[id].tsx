import type { NextPage } from "next";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch } from "utils/useAppDispatch";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";

import styles from "./mission.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight, faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { getPresets } from "http-client/preset";
import { getPOIs } from "http-client/poi";
import { getMissions } from "http-client/mission";
import { getLayers } from "http-client/layer";
import { getStations } from "http-client/station";
import { getActions } from "http-client/action";
import { getGoals, getInvestigations, getObjectives } from "http-client/stm";
import { setMapCircleControls, setMapSublayerControls } from "store/map";
import {
  deletePoiByUuid,
  deletePoiFromDbByUuid,
  setPois,
  setPoisFromDb,
  setSelectedPoiUuid,
  upsertPois,
  upsertPoisFromDb,
} from "store/poi";
import {
  deletePresetByUuid,
  deletePresetFromDbByUuid,
  setPresetUIStates,
  setPresets,
  setPresetsFromDb,
  setSelectedPresetUuid,
  upsertPresets,
  upsertPresetsFromDb,
} from "store/preset";
import { setLayers, setMission, setMissionFromDb, setSublayers } from "store/mission";
import {
  deleteStationByUuid,
  deleteStationFromDbByUuid,
  setSelectedStationUuid,
  setStations,
  setStationsFromDb,
  upsertStations,
  upsertStationsFromDb,
} from "store/station";
import {
  deleteActionByUuid,
  deleteActionFromDbByUuid,
  setActions,
  setActionsFromDb,
  upsertActions,
  upsertActionsFromDb,
} from "store/action";
import { setGoals, setInvestigations, setObjectives } from "store/stm";
import { getEvas } from "http-client/eva";
import {
  deleteEvaByUuid,
  deleteEvaFromDbByUuid,
  setEvas,
  setEvasFromDb,
  setSelectedEvaUuid,
  upsertEvas,
  upsertEvasFromDb,
} from "store/eva";
import {
  setTraversesFromDb,
  setTraverses,
  deleteTraverseByUuid,
  deleteTraverseFromDbByUuid,
  upsertTraverses,
  upsertTraversesFromDb,
} from "store/traverse";
import { getTraverses } from "http-client/traverse";
import { setRightPanelOpen } from "store/interface";
import { setMissionPerms, setUserStore } from "store/user";
import { thunkCreateStationCalculatedFields } from "store/thunk/thunkStation";
import { thunkCreateTraverseCalculatedFields } from "store/thunk/thunkTraverse";
import { thunkCreateEvasCalculatedFields } from "store/thunk/thunkEva";
import { thunkCreatePoiCalculatedFields } from "store/thunk/thunkPoi";
import { Tooltip } from "react-tooltip";
import { thunkSavePreset } from "store/thunk/thunkPreset";
import _ from "lodash";
import { isLoggedIn } from "http-client/login";
import { getSublayers } from "http-client/sublayer";
import { v4 as uuidv4 } from "uuid";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import fetchWithTimeout from "utils/fetch-with-timeout";

/** Dynamically import the whole framework because nothing likes NextJS */
const LeftControlPanel = dynamic(
  import("components/interface/side-controls").then((mod) => mod.LeftControlPanel),
  {
    ssr: false,
  }
);
const RightControlPanel = dynamic(
  import("components/interface/side-controls").then((mod) => mod.RightControlPanel),
  {
    ssr: false,
  }
);
const MapBody = dynamic(import("components/interface/map-body-leaflet"), {
  ssr: false,
});
const SunEarthPosition = dynamic(import("components/interface/map-sunearth"), {
  ssr: false,
});
const Header = dynamic(import("components/interface/header"), {
  ssr: false,
});

const BottomControlPanel = dynamic(
  import("components/interface/side-controls").then((mod) => mod.BottomControlPanel),
  {
    ssr: false,
  }
);

// create browser session storage variable with unique clientId in it
let uniqueClientId: string = null;
if (typeof window !== "undefined" && !window.sessionStorage.getItem("uniqueClientId")) {
  const newUniqueClientId = uuidv4();
  window.sessionStorage.setItem("uniqueClientId", newUniqueClientId);
  uniqueClientId = newUniqueClientId;
} else {
  uniqueClientId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("uniqueClientId") : null;
}

const Main: NextPage = () => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const missionStore = useAppSelector((state) => state.mission, shallowEqual);
  const rightPanelOpen = useAppSelector((state) => state.interface.rightPanelOpen, refEqual);
  const poi = useAppSelector((state) => state.poi, shallowEqual);
  const station = useAppSelector((state) => state.station, shallowEqual);
  const actions = useAppSelector((state) => state.action.actions, shallowEqual);
  const traverse = useAppSelector((state) => state.traverse, shallowEqual);
  const eva = useAppSelector((state) => state.eva, shallowEqual);
  const preset = useAppSelector((state) => state.preset, shallowEqual);

  const stationsCalculatedFields = useAppSelector(
    (state) => state.station.calculatedFields,
    shallowEqual
  );
  const traversesCalculatedFields = useAppSelector(
    (state) => state.traverse.calculatedFields,
    shallowEqual
  );

  //local state to ensure permissions have been checked first before running the other useEffects
  const [hasPermissions, setHasPermissions] = useState(false);

  //socket connection
  const socket = useRef<Socket<ServerToClientEvents, ClientToServerEvents>>(null);
  const [wakeFetchSent, setWakeFetchSent] = useState(false);

  const { id } = router.query;
  const intMissionId = parseInt(Array.isArray(id) ? id[0] : id);

  /**
   * Check if user is logged in and if the user has permissions for this mission page
   * If not, redirect them to the home page.
   */

  useEffect(() => {
    if (!intMissionId) return;
    (async () => {
      const response = await isLoggedIn();
      //Check if user is logged in.
      if (response.status === "success") {
        dispatch(setUserStore({ isLoggedIn: true, user: response.data.user, missionPerms: null }));

        //Check for permissions to this mission
        if (response.data.user.isSuperAdmin) {
          //super admin always has permissions
          dispatch(
            setMissionPerms({ missionId: intMissionId, permissions: { view: true, edit: true } })
          );
        } else {
          const perms = response.data.user.permissionList?.find(
            (permission) => permission.missionId === intMissionId
          );
          if (!perms || (!perms.permissions.view && !perms.permissions.edit)) router.push("/"); //Redirect to homepage
          dispatch(setMissionPerms(perms));
        }
        setHasPermissions(true);
      } else {
        router.push("/");
      }
    })();
  }, [router, intMissionId, dispatch]);

  /**
   * Populate the store
   */
  useEffect(() => {
    if (!hasPermissions) return;
    (async () => {
      //populate mission
      const missionData = await getMissions(intMissionId);
      if (missionData.data) {
        if (!missionData.data[0].landerRadii) {
          missionData.data[0].landerRadii = [];
        }
        dispatch(setMission(missionData.data[0]));
        dispatch(setMissionFromDb(missionData.data[0]));
      }

      //populate layers and layerControls
      const layerData = (await getLayers(intMissionId)).data;
      const sublayerData: Sublayer[] = (await getSublayers(intMissionId)).data;

      const missionMapSublayerControls: MapSublayerControls = {}; //map sublayer controls generated from mission sublayers
      if (layerData) {
        //populate layers and sublayers to store
        dispatch(setLayers(layerData));
        dispatch(setSublayers(sublayerData));

        //build map sublayerControls from mission data
        sublayerData.map((sublayer) => {
          missionMapSublayerControls[sublayer.uuid] = {
            name: sublayer.name,
            sublayerUuid: sublayer.uuid,
            visible: false,
            style: {
              opacity: sublayer.opacity || 1,
              contrast: 1,
              brightness: 1,
              saturation: 1,
              blendMode: "normal",
              color: sublayer.color || "#FFFFFF",
              weight: sublayer.weight || 1,
              fillColor: sublayer.fillColor || "#FFFFFF",
              fillOpacity: sublayer.fillOpacity || 0.2,
            },
          };
        });
        //save to store
        dispatch(setMapSublayerControls(missionMapSublayerControls));
      }

      //Populate Presets
      const presetData: Preset[] = (await getPresets(intMissionId)).data;
      if (presetData) {
        //fix and validate against modifications to layers/sublayers made in admin since this preset was last saved
        presetData.forEach((preset) => {
          let modified = false;
          //sync up anything added/deleted missing from preset layer order
          if (preset.layerOrder) {
            //delete any header layers in layerOrder removed from mission
            const filteredNewLayerOrders = preset.layerOrder.filter((layerOrder) =>
              layerData.some((l) => l.uuid === layerOrder.layerUuid)
            );
            if (!_.isEqual(filteredNewLayerOrders, preset.layerOrder)) modified = true;
            preset.layerOrder = filteredNewLayerOrders;

            //add any missing header layers and sublayers to layerOrder from mission
            for (const headerLayer of layerData) {
              const newHeaderLayerOrder = preset.layerOrder.find(
                (layerOrder) => layerOrder.layerUuid === headerLayer.uuid
              );
              const sublayers = sublayerData.filter(
                (sublayer) => sublayer.layerUuid === headerLayer.uuid
              );
              if (newHeaderLayerOrder) {
                //it exists, good. check sublayers
                //add any missing sublayers
                for (const sublayer of sublayers) {
                  const hasSublayer = newHeaderLayerOrder.sublayerUuids.some(
                    (uuid) => uuid === sublayer.uuid
                  );
                  if (!hasSublayer) {
                    newHeaderLayerOrder.sublayerUuids.push(sublayer.uuid);
                    modified = true;
                  }
                }

                //delete any removed sublayers
                const newSublayerUuids = newHeaderLayerOrder.sublayerUuids.filter(
                  (sublayerOrderUuid) => sublayers.some((s) => s.uuid === sublayerOrderUuid)
                );
                if (!_.isEqual(newSublayerUuids, newHeaderLayerOrder.sublayerUuids))
                  modified = true;
                newHeaderLayerOrder.sublayerUuids = newSublayerUuids;
              } else {
                //add missing header layer and all it's sublayers
                const tempLayerOrder = {
                  layerUuid: headerLayer.uuid,
                  sublayerUuids: sublayers.map((s) => s.uuid),
                };
                preset.layerOrder.push(tempLayerOrder);
                modified = true;
              }
            }
          }

          //loop through sublayers, add any sublayers that are missing from preset map controls
          //  this happens when sublayers are added in mission after the preset was created
          for (const sublayer of sublayerData) {
            //add to sublayer control
            if (!Object.keys(preset.mapSublayerControls).includes(sublayer.uuid)) {
              preset.mapSublayerControls[sublayer.uuid] = missionMapSublayerControls[sublayer.uuid];
              modified = true;
            }
          }

          //loop through preset mapSublayerControls and delete any sublayer data that no longer exist in mission
          //  this happens when sublayers are deleted in mission after the preset was created
          for (const sublayerUuid of Object.keys(preset.mapSublayerControls)) {
            //delete from sublayer control
            if (!Object.keys(missionMapSublayerControls).includes(sublayerUuid)) {
              delete preset.mapSublayerControls[sublayerUuid];
              modified = true;
            }
          }

          //set map circle controls
          const mapCircleControls: MapCircleControls = {};
          if (!preset.mapCircleControls) {
            preset.mapCircleControls = {};
            modified = true;
          }

          missionData.data[0].landerRadii.forEach((landerRadius) => {
            if (preset.mapCircleControls[landerRadius.uuid]) {
              mapCircleControls[landerRadius.uuid] = preset.mapCircleControls[landerRadius.uuid];
            } else {
              modified = true;
              mapCircleControls[landerRadius.uuid] = {
                name: landerRadius.name,
                landerRadiusUuid: landerRadius.uuid,
                visible: false,
                style: {
                  opacity: 1,
                  contrast: 1,
                  brightness: 1,
                  saturation: 1,
                  blendMode: "normal",
                  color: "red",
                  weight: 1,
                  fillColor: "none",
                  fillOpacity: 0,
                },
              };
            }
          });

          preset.mapCircleControls = mapCircleControls;

          dispatch(setMapCircleControls(preset.mapCircleControls));

          //update this preset in the DB
          if (modified) dispatch(thunkSavePreset({ preset }));
        });

        //save preset data to the store
        dispatch(setPresets(presetData));
        dispatch(setPresetsFromDb(presetData));

        // Set the default preset
        const defaultPreset = presetData.filter((preset) => preset.missionPresetDefault === true);
        if (defaultPreset.length > 0) {
          dispatch(setSelectedPresetUuid(defaultPreset[0].uuid));
          dispatch(setMapSublayerControls(defaultPreset[0].mapSublayerControls));
        }
      }

      //Populate POIs
      const poiData = await getPOIs(intMissionId);
      if (poiData.data) {
        dispatch(setPois(poiData.data));
        dispatch(setPoisFromDb(poiData.data));
      }

      //Populate stations
      const stationData = await getStations(intMissionId);
      if (stationData.data) {
        dispatch(setStations(stationData.data));
        dispatch(setStationsFromDb(stationData.data));
      }

      //Populate actions
      const actionData = await getActions({ missionId: intMissionId });
      if (actionData.data) {
        dispatch(setActions(actionData.data));
        dispatch(setActionsFromDb(actionData.data));
      }

      //Populate evas
      const evaData = await getEvas(intMissionId);
      if (evaData.data) {
        dispatch(setEvas(evaData.data));
        dispatch(setEvasFromDb(evaData.data));
      }

      //Populate traverses
      const traverseData = await getTraverses(intMissionId);
      if (traverseData.data) {
        dispatch(setTraverses(traverseData.data));
        dispatch(setTraversesFromDb(traverseData.data));
      }

      //Populate stm
      const objectiveData = await getObjectives({ missionId: intMissionId });
      if (objectiveData.data) dispatch(setObjectives(objectiveData.data));
      const goalData = await getGoals({ missionId: intMissionId });
      if (goalData.data) dispatch(setGoals(goalData.data));
      const invstgData = await getInvestigations({ missionId: intMissionId });
      if (invstgData.data) dispatch(setInvestigations(invstgData.data));
    })();
  }, [dispatch, hasPermissions, intMissionId]);

  //Generate presetsUIStates
  useEffect(() => {
    preset.presets.forEach((thisPreset) => {
      const layerData = missionStore.layers;
      const sublayerData = missionStore.sublayers;
      if (preset.presetsUIStates[thisPreset.uuid]) return; //already exists, don't overwrite

      //build preset ui states for the layer and sublayers
      const presetUIStates: PresetUIStates = {};
      for (const layer of layerData) {
        presetUIStates[layer.uuid] = {
          expanded: true,
          tabSelected: null,
          name: layer.name,
          type: "layer",
        };
      }
      for (const sublayer of sublayerData) {
        presetUIStates[sublayer.uuid] = {
          expanded: true,
          tabSelected: null,
          name: sublayer.name,
          type: "sublayer",
        };
      }

      missionStore.mission?.landerRadii.forEach((landerRadius) => {
        const presetUIStates: PresetUIStates = {};
        presetUIStates[landerRadius.uuid] = {
          expanded: true,
          tabSelected: null,
          name: landerRadius.name,
          type: "circle",
        };
      });
      //dispatch ui states to store
      dispatch(
        setPresetUIStates({
          presetUuid: thisPreset.uuid,
          presetUIStates: presetUIStates,
        })
      );
    });
  }, [preset, missionStore.layers, missionStore.sublayers, missionStore.mission, dispatch]);

  //Generate poi calculated values
  useEffect(() => {
    if (_.isEmpty(poi.pois) || _.isEmpty(actions) || !hasPermissions) return;
    dispatch(thunkCreatePoiCalculatedFields());
  }, [poi.pois, actions, dispatch, hasPermissions]);

  //Generate station calculated values
  useEffect(() => {
    if (_.isEmpty(station.stations) || _.isEmpty(actions) || !hasPermissions) return;
    dispatch(thunkCreateStationCalculatedFields());
  }, [station.stations, actions, dispatch, hasPermissions]);

  //Generate traverse calculated values
  useEffect(() => {
    if (_.isEmpty(traverse.traverses) || !hasPermissions) return;
    dispatch(thunkCreateTraverseCalculatedFields());
  }, [traverse.traverses, dispatch, hasPermissions]);

  //Generate eva calculated values. These are dependent on stations and traverses having had their calculated values generated
  useEffect(() => {
    if (
      _.isEmpty(eva.evas) ||
      _.isEmpty(stationsCalculatedFields) ||
      _.isEmpty(traversesCalculatedFields) ||
      !hasPermissions
    )
      return;
    dispatch(thunkCreateEvasCalculatedFields());
  }, [eva.evas, stationsCalculatedFields, traversesCalculatedFields, dispatch, hasPermissions]);

  const alertUpdatedEditing = (type: string, name: string) => {
    alert(
      `The ${type} ${name}, that you are editing has been updated by another user. Please refresh.`
    );
  };

  const alertDeletedEditing = (type: string, name: string) => {
    alert(
      `The ${type} ${name}, that you are editing has been deleted by another user. Please refresh.`
    );
  };

  const storeUpsertEventHandler = useCallback(
    (storePayload: StoreUpsert<POI | Preset | Station | Eva | Action | Traverse>) => {
      console.log(
        `Received storeUpsert from server. Mission: ${storePayload.missionId} uniqueClientId: ${storePayload.uniqueClientId} Type:${storePayload.type}`
      );
      // ignore all events that are not for the currently selected mission
      if (storePayload.missionId !== intMissionId) {
        console.log(
          `Ignoring storeUpsert from server because this client is looking at a different mission. Mission: ${storePayload.missionId} uniqueClientId: ${storePayload.uniqueClientId} Type:${storePayload.type}`
        );
        return;
      }
      if (uniqueClientId === storePayload.uniqueClientId) {
        console.log(
          `Ignoring storeUpsert from server because it was sent by this client. Mission: ${storePayload.missionId} uniqueClientId: ${storePayload.uniqueClientId} Type:${storePayload.type}`
        );
        return;
      }
      if (storePayload.type === "preset") {
        const newPresets = storePayload.data as Preset[];
        preset.presets.forEach((thisPreset) => {
          const newPreset = newPresets.find((newPreset) => newPreset.uuid === thisPreset.uuid);
          if (newPreset) {
            if (preset.presetsEditing.includes(thisPreset.uuid)) {
              alertUpdatedEditing("preset", thisPreset.name);
              return;
            }
          }
          return preset;
        });
        dispatch(upsertPresets(storePayload.data as Preset[]));
        dispatch(upsertPresetsFromDb(storePayload.data as Preset[]));
      } else if (storePayload.type === "poi") {
        const newPois = storePayload.data as POI[];
        poi.pois.forEach((thisPoi) => {
          const newPoi = newPois.find((newPoi) => newPoi.uuid === thisPoi.uuid);
          if (newPoi) {
            if (poi.poisEditing.includes(thisPoi.uuid)) {
              alertUpdatedEditing("POI", thisPoi.name);
              return;
            }
          }
          return poi;
        });
        dispatch(upsertPois(storePayload.data as POI[]));
        dispatch(upsertPoisFromDb(storePayload.data as POI[]));
      } else if (storePayload.type === "station") {
        const newStations = storePayload.data as Station[];
        station.stations.forEach((thisStation) => {
          const newStation = newStations.find((newStation) => newStation.uuid === thisStation.uuid);
          if (newStation) {
            if (station.stationsEditing.includes(thisStation.uuid)) {
              alertUpdatedEditing("station", thisStation.name);
              return;
            }
          }
          return station;
        });
        dispatch(upsertStations(storePayload.data as Station[]));
        dispatch(upsertStationsFromDb(storePayload.data as Station[]));
      } else if (storePayload.type === "eva") {
        const newEvas = storePayload.data as Eva[];
        eva.evas.forEach((thisEva) => {
          const newEva = newEvas.find((newEva) => newEva.uuid === thisEva.uuid);
          if (newEva) {
            if (eva.evasEditing.includes(thisEva.uuid)) {
              alertUpdatedEditing("EVA", thisEva.name);
              return;
            }
          }
          return eva;
        });
        dispatch(upsertEvas(storePayload.data as Eva[]));
        dispatch(upsertEvasFromDb(storePayload.data as Eva[]));
      } else if (storePayload.type === "action") {
        dispatch(upsertActions(storePayload.data as Action[]));
        dispatch(upsertActionsFromDb(storePayload.data as Action[]));
      } else if (storePayload.type === "traverse") {
        const newTraverses = storePayload.data as Traverse[];
        traverse.traverses.forEach((thisTraverse) => {
          const newTraverse = newTraverses.find(
            (newTraverse) => newTraverse.uuid === thisTraverse.uuid
          );
          if (newTraverse) {
            if (traverse.traversesEditing.includes(thisTraverse.uuid)) {
              alertUpdatedEditing("traverse", thisTraverse.name);
              return;
            }
          }
          return traverse;
        });
        dispatch(upsertTraverses(storePayload.data as Traverse[]));
        dispatch(upsertTraversesFromDb(storePayload.data as Traverse[]));
      }
    },
    [dispatch, preset, poi, station, eva, traverse, intMissionId]
  );

  const storeDeleteEventHandler = useCallback(
    (storeDelete: StoreDelete) => {
      console.log(
        `Received delete event from server. Mission: ${storeDelete.missionId} uniqueClientId: ${storeDelete.uniqueClientId} Type:${storeDelete.type} uuid:${storeDelete.uuid}`
      );
      // ignore all events that are not for the currently selected mission
      if (storeDelete.missionId !== intMissionId) {
        console.log(
          `Ignoring delete event from server because this client is looking at a different mission. Mission: ${storeDelete.missionId} uniqueClientId: ${storeDelete.uniqueClientId} Type:${storeDelete.type} uuid:${storeDelete.uuid}`
        );
        return;
      }
      if (storeDelete.uniqueClientId === uniqueClientId) {
        console.log(
          `Ignoring delete event from server because it was sent by this client. Mission: ${storeDelete.missionId} uniqueClientId: ${storeDelete.uniqueClientId} Type:${storeDelete.type} uuid:${storeDelete.uuid}`
        );
        return;
      }

      if (storeDelete.type === "preset") {
        if (preset.presetsEditing.includes(storeDelete.uuid)) {
          const deletedPreset = preset.presets.find((preset) => preset.uuid === storeDelete.uuid);
          alertDeletedEditing("preset", deletedPreset.name);
          return;
        }
        if (preset.selectedPresetUuid === storeDelete.uuid) {
          // set the selected preset to the default preset
          const defaultPreset = preset.presets.find(
            (thisPreset) => thisPreset.missionPresetDefault === true
          ) as Preset;
          dispatch(setSelectedPresetUuid(defaultPreset.uuid));
        }
        dispatch(deletePresetByUuid(storeDelete.uuid));
        dispatch(deletePresetFromDbByUuid(storeDelete.uuid));
      } else if (storeDelete.type === "poi") {
        if (poi.poisEditing.includes(storeDelete.uuid)) {
          const poiDeleted = poi.pois.find((poi) => poi.uuid === storeDelete.uuid);
          alertDeletedEditing("POI", poiDeleted.name);
          return;
        }
        if (poi.selectedPoiUuid === storeDelete.uuid) dispatch(setSelectedPoiUuid(null));
        dispatch(deletePoiByUuid(storeDelete.uuid));
        dispatch(deletePoiFromDbByUuid(storeDelete.uuid));
      } else if (storeDelete.type === "station") {
        if (station.stationsEditing.includes(storeDelete.uuid)) {
          const stationDeleted = station.stations.find(
            (station) => station.uuid === storeDelete.uuid
          );
          alertDeletedEditing("station", stationDeleted.name);
          return;
        }
        if (station.selectedStationUuid === storeDelete.uuid)
          dispatch(setSelectedStationUuid(null));
        dispatch(deleteStationByUuid(storeDelete.uuid));
        dispatch(deleteStationFromDbByUuid(storeDelete.uuid));
      } else if (storeDelete.type === "eva") {
        if (eva.evasEditing.includes(storeDelete.uuid)) {
          const evaDeleted = eva.evas.find((eva) => eva.uuid === storeDelete.uuid);
          alertDeletedEditing("EVA", evaDeleted.name);
          return;
        }
        if (eva.selectedEvaUuid === storeDelete.uuid) {
          dispatch(setSelectedEvaUuid(null));
        }
        dispatch(deleteEvaByUuid(storeDelete.uuid));
        dispatch(deleteEvaFromDbByUuid(storeDelete.uuid));
      } else if (storeDelete.type === "action") {
        dispatch(deleteActionByUuid(storeDelete.uuid));
        dispatch(deleteActionFromDbByUuid(storeDelete.uuid));
      } else if (storeDelete.type === "traverse") {
        if (traverse.traversesEditing.includes(storeDelete.uuid)) {
          const traverseDeleted = traverse.traverses.find(
            (traverse) => traverse.uuid === storeDelete.uuid
          );
          alertDeletedEditing("traverse", traverseDeleted.name);
          return;
        }
        dispatch(deleteTraverseByUuid(storeDelete.uuid));
        dispatch(deleteTraverseFromDbByUuid(storeDelete.uuid));
      }
    },
    [dispatch, preset, poi, station, eva, traverse, intMissionId]
  );

  //Handle socketio events
  useEffect(() => {
    if (!wakeFetchSent) {
      fetchWithTimeout(`${window.location.origin}/api/socketio`, { timeout: 5 });
      setWakeFetchSent(true);
      return;
    }

    if (!uniqueClientId || !intMissionId) return;

    // Create a socket connection
    if (!socket.current || (socket.current && !socket.current.connected)) {
      socket.current = io(window.location.origin, {
        transports: ["websocket"],
        upgrade: true,
        path: "/api/socketio",
      });
    }

    socket.current.on("connect", () => {
      console.log("Connected to socket.io server");
      socket.current.emit("joinRoom", intMissionId.toString());
    });
    socket.current.on("disconnect", () => {
      console.log("Disconnected from socket.io server");
    });
    socket.current.io.on("reconnect_attempt", () => {
      console.log("Attempting to reconnect to socket.io server");
    });
    socket.current.io.on("reconnect", () => {
      console.log("Reconnected to socket.io server");
    });

    // Incoming client counts
    socket.current.on("roomSize", (count: number) => {
      console.log(`Client count in this room: ${count}`);
    });

    // Listen for incoming store updates
    socket.current.on(
      "storeUpsert",
      (storePayload: StoreUpsert<POI | Preset | Station | Eva | Action | Traverse>) => {
        storeUpsertEventHandler(storePayload);
      }
    );

    // Incoming store deletes
    socket.current.on("storeDelete", (storeDelete: StoreDelete) => {
      storeDeleteEventHandler(storeDelete);
    });

    // Clean up the socket connection on unmount
    return () => {
      socket.current.off("connect");
      socket.current.io.off("reconnect_attempt");
      socket.current.io.off("reconnect");
      socket.current.off("storeUpsert");
      socket.current.off("storeDelete");
      socket.current.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, socket, wakeFetchSent, intMissionId]);

  const showSunEarth: boolean =
    missionStore.mission &&
    (missionStore.mission.earthAzimuthVisible || missionStore.mission.sunAzimuthVisible);

  return (
    <>
      {hasPermissions && (
        <div className={styles.page}>
          <Tooltip
            id="aegis-tooltip"
            className={styles.tooltip}
            clickable={true}
            delayShow={1000}
          />
          <div className={styles.header}>
            <Header />
          </div>
          <div className={styles.body}>
            <div className={styles.leftControl}>
              <LeftControlPanel />
            </div>
            <div className={styles.mapBody}>
              {missionStore.mission && missionStore.layers && <MapBody />}
              {showSunEarth && <SunEarthPosition />}
            </div>
            <div
              className={styles.drawerSlider}
              onClick={() => dispatch(setRightPanelOpen(!rightPanelOpen))}
            >
              <div className={styles.circle}>
                {rightPanelOpen ? (
                  <FontAwesomeIcon
                    className={styles.drawerIcon}
                    color="white"
                    icon={faChevronRight}
                  />
                ) : (
                  <FontAwesomeIcon
                    className={styles.drawerIcon}
                    color="white"
                    icon={faChevronLeft}
                  />
                )}
              </div>
            </div>
            {rightPanelOpen && (
              <div className={styles.rightControl}>
                <RightControlPanel />
              </div>
            )}
          </div>
          <div className={styles.bottomControl}>
            <BottomControlPanel />
          </div>
        </div>
      )}
    </>
  );
};

export default Main;
