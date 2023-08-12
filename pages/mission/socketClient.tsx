import { FunctionComponent, useCallback, useEffect, useRef, useState } from "react";
import {
  deletePoiByUuid,
  deletePoiFromDbByUuid,
  setSelectedPoiUuid,
  upsertPois,
  upsertPoisFromDb,
} from "store/poi";
import {
  deletePresetByUuid,
  deletePresetFromDbByUuid,
  setSelectedPresetUuid,
  upsertPresets,
  upsertPresetsFromDb,
} from "store/preset";
import {
  deleteStationByUuid,
  deleteStationFromDbByUuid,
  setSelectedStationUuid,
  upsertStations,
  upsertStationsFromDb,
} from "store/station";
import {
  deleteActionByUuid,
  deleteActionFromDbByUuid,
  upsertActions,
  upsertActionsFromDb,
} from "store/action";
import {
  deleteEvaByUuid,
  deleteEvaFromDbByUuid,
  setSelectedEvaUuid,
  upsertEvas,
  upsertEvasFromDb,
} from "store/eva";
import {
  deleteTraverseByUuid,
  deleteTraverseFromDbByUuid,
  upsertTraverses,
  upsertTraversesFromDb,
} from "store/traverse";
import { setLastEditEvent, setSocketConnectionStatus, setVisitorCounts } from "store/interface";
import { shallowEqual, useAppSelector } from "utils/useAppSelector";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import fetchWithTimeout from "utils/fetch-with-timeout";
import { useAppDispatch } from "utils/useAppDispatch";
import { v4 as uuidv4 } from "uuid";
import _ from "lodash";

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

const SocketClient: FunctionComponent<{ missionId: number }> = ({ missionId }) => {
  const dispatch = useAppDispatch();
  const poi = useAppSelector((state) => state.poi, shallowEqual);
  const station = useAppSelector((state) => state.station, shallowEqual);
  const traverse = useAppSelector((state) => state.traverse, shallowEqual);
  const eva = useAppSelector((state) => state.eva, shallowEqual);
  const preset = useAppSelector((state) => state.preset, shallowEqual);
  const user = useAppSelector((state) => state.user, shallowEqual);
  const interfaceStore = useAppSelector((state) => state.interface, shallowEqual);

  // all stores are stored in refs so that the socket event handlers can access the latest values
  const poiRef = useRef(poi);
  const stationRef = useRef(station);
  const evaRef = useRef(eva);
  const traverseRef = useRef(traverse);
  const presetRef = useRef(preset);
  const userRef = useRef(user);
  const interfaceStoreRef = useRef(interfaceStore);

  //socket connection
  const socket = useRef<Socket<ServerToClientEvents, ClientToServerEvents>>(null);
  const [wakeFetchSent, setWakeFetchSent] = useState(false);

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
      if (storePayload.missionId !== missionId) {
        console.log(
          `Ignoring storeUpsert from server because this client is looking at a different mission. Mission: ${storePayload.missionId} uniqueClientId: ${storePayload.uniqueClientId} Type:${storePayload.type}`
        );
        return;
      }
      // update the last edit event in the store
      dispatch(setLastEditEvent(storePayload?.lastEditEvent));

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
            if (presetRef.current.presetsEditing.includes(thisPreset.uuid)) {
              alertUpdatedEditing("preset", thisPreset.name);
              return;
            }
          }
          return preset;
        });
        dispatch(upsertPresets(storePayload.data as Preset[], true));
        dispatch(upsertPresetsFromDb(storePayload.data as Preset[]));
      } else if (storePayload.type === "poi") {
        const changedPois = storePayload.data as POI[];
        for (const changedPoi of changedPois) {
          if (poiRef.current.poisEditing.includes(changedPoi.uuid)) {
            alertUpdatedEditing("POI", changedPoi.name);
          }
        }
        dispatch(upsertPois(storePayload.data as POI[], true));
        dispatch(upsertPoisFromDb(storePayload.data as POI[]));
      } else if (storePayload.type === "station") {
        const changedStations = storePayload.data as Station[];
        for (const changedStation of changedStations) {
          if (stationRef.current.stationsEditing.includes(changedStation.uuid)) {
            alertUpdatedEditing("Station", changedStation.name);
          }
        }
        dispatch(upsertStations(storePayload.data as Station[], true));
        dispatch(upsertStationsFromDb(storePayload.data as Station[]));
      } else if (storePayload.type === "eva") {
        const changedEvas = storePayload.data as Eva[];
        for (const changedEva of changedEvas) {
          if (evaRef.current.evasEditing.includes(changedEva.uuid)) {
            alertUpdatedEditing("EVA", changedEva.name);
          }
        }
        dispatch(upsertEvas(storePayload.data as Eva[], true));
        dispatch(upsertEvasFromDb(storePayload.data as Eva[]));
      } else if (storePayload.type === "action") {
        dispatch(upsertActions(storePayload.data as Action[], true));
        dispatch(upsertActionsFromDb(storePayload.data as Action[]));
      } else if (storePayload.type === "traverse") {
        const changedTraverses = storePayload.data as Traverse[];
        for (const changedTraverse of changedTraverses) {
          if (traverseRef.current.traversesEditing.includes(changedTraverse.uuid)) {
            alertUpdatedEditing("traverse", changedTraverse.name);
          }
        }
        dispatch(upsertTraverses(storePayload.data as Traverse[], true));
        dispatch(upsertTraversesFromDb(storePayload.data as Traverse[]));
      }
    },
    [dispatch, preset, missionId, presetRef, poiRef, stationRef, evaRef, traverseRef]
  );

  const storeDeleteEventHandler = useCallback(
    (storeDelete: StoreDelete) => {
      console.log(
        `Received delete event from server. Mission: ${storeDelete.missionId} uniqueClientId: ${storeDelete.uniqueClientId} Type:${storeDelete.type} uuid:${storeDelete.uuid}`
      );
      // ignore all events that are not for the currently selected mission
      if (storeDelete.missionId !== missionId) {
        console.log(
          `Ignoring delete event from server because this client is looking at a different mission. Mission: ${storeDelete.missionId} uniqueClientId: ${storeDelete.uniqueClientId} Type:${storeDelete.type} uuid:${storeDelete.uuid}`
        );
        return;
      }
      // update the last edit event in the store
      dispatch(setLastEditEvent(storeDelete?.lastEditEvent));

      if (storeDelete.uniqueClientId === uniqueClientId) {
        console.log(
          `Ignoring delete event from server because it was sent by this client. Mission: ${storeDelete.missionId} uniqueClientId: ${storeDelete.uniqueClientId} Type:${storeDelete.type} uuid:${storeDelete.uuid}`
        );
        return;
      }

      if (storeDelete.type === "preset") {
        if (presetRef.current.presetsEditing.includes(storeDelete.uuid)) {
          const deletedPreset = presetRef.current.presets.find(
            (preset) => preset.uuid === storeDelete.uuid
          );
          alertDeletedEditing("preset", deletedPreset.name);
          return;
        }
        if (presetRef.current.selectedPresetUuid === storeDelete.uuid) {
          // set the selected preset to the default preset
          const defaultPreset = presetRef.current.presets.find(
            (thisPreset) => thisPreset.missionPresetDefault === true
          ) as Preset;
          dispatch(setSelectedPresetUuid(defaultPreset.uuid));
        }
        dispatch(deletePresetByUuid(storeDelete.uuid));
        dispatch(deletePresetFromDbByUuid(storeDelete.uuid));
      } else if (storeDelete.type === "poi") {
        if (poiRef.current.poisEditing.includes(storeDelete.uuid)) {
          const poiDeleted = poiRef.current.pois.find((poi) => poi.uuid === storeDelete.uuid);
          alertDeletedEditing("POI", poiDeleted.name);
          return;
        }
        if (poiRef.current.selectedPoiUuid === storeDelete.uuid) dispatch(setSelectedPoiUuid(null));
        dispatch(deletePoiByUuid(storeDelete.uuid));
        dispatch(deletePoiFromDbByUuid(storeDelete.uuid));
      } else if (storeDelete.type === "station") {
        if (stationRef.current.stationsEditing.includes(storeDelete.uuid)) {
          const stationDeleted = stationRef.current.stations.find(
            (station) => station.uuid === storeDelete.uuid
          );
          alertDeletedEditing("station", stationDeleted.name);
          return;
        }
        if (stationRef.current.selectedStationUuid === storeDelete.uuid)
          dispatch(setSelectedStationUuid(null));
        dispatch(deleteStationByUuid(storeDelete.uuid));
        dispatch(deleteStationFromDbByUuid(storeDelete.uuid));
      } else if (storeDelete.type === "eva") {
        if (evaRef.current.evasEditing.includes(storeDelete.uuid)) {
          const evaDeleted = evaRef.current.evas.find((eva) => eva.uuid === storeDelete.uuid);
          alertDeletedEditing("EVA", evaDeleted.name);
          return;
        }
        if (evaRef.current.selectedEvaUuid === storeDelete.uuid) {
          dispatch(setSelectedEvaUuid(null));
        }
        dispatch(deleteEvaByUuid(storeDelete.uuid));
        dispatch(deleteEvaFromDbByUuid(storeDelete.uuid));
      } else if (storeDelete.type === "action") {
        dispatch(deleteActionByUuid(storeDelete.uuid));
        dispatch(deleteActionFromDbByUuid(storeDelete.uuid));
      } else if (storeDelete.type === "traverse") {
        if (traverseRef.current.traversesEditing.includes(storeDelete.uuid)) {
          const traverseDeleted = traverseRef.current.traverses.find(
            (traverse) => traverse.uuid === storeDelete.uuid
          );
          alertDeletedEditing("traverse", traverseDeleted.name);
          return;
        }
        dispatch(deleteTraverseByUuid(storeDelete.uuid));
        dispatch(deleteTraverseFromDbByUuid(storeDelete.uuid));
      }
    },
    [dispatch, missionId, presetRef, poiRef, stationRef, evaRef, traverseRef]
  );

  //Handle socketio events
  useEffect(() => {
    if (!wakeFetchSent) {
      fetchWithTimeout(`${window.location.origin}/api/socketio`, { timeout: 5 });
      setWakeFetchSent(true);
      return;
    }

    if (!uniqueClientId || !missionId || !user?.missionPerms) return;

    // Create a socket connection
    if (!socket.current || (socket.current && !socket.current.connected)) {
      socket.current = io(window.location.origin, {
        transports: ["websocket"],
        upgrade: true,
        path: "/api/socketio",
      });
    }

    socket.current.on("connect", () => {
      // Get current user permissions on this mission
      const permissionType: "viewer" | "editor" = userRef.current.missionPerms.permissions.edit
        ? "editor"
        : "viewer";

      const visitorJoin: VisitorJoin = {
        missionId: missionId,
        uniqueClientId: uniqueClientId,
        type: permissionType,
      };

      socket.current.emit("visitorJoin", visitorJoin);

      console.log(
        `Connected to socket.io server. Joining Mission: ${missionId} uniqueClientId: ${uniqueClientId}. Type: ${permissionType}.`
      );
      dispatch(setSocketConnectionStatus("connected"));
    });

    socket.current.on("disconnect", () => {
      console.log("Disconnected from socket.io server");
      dispatch(setSocketConnectionStatus("disconnected"));
    });
    socket.current.io.on("reconnect_attempt", () => {
      console.log("Attempting to reconnect to socket.io server");
      dispatch(setSocketConnectionStatus("reconnecting"));
    });
    socket.current.io.on("reconnect", () => {
      console.log("Reconnected to socket.io server");
      dispatch(setSocketConnectionStatus("connected"));

      // hit the API to get the lastest edit event and compare it to the one in the store
      // if they are different, then alert the user and refresh the page
      (async () => {
        const wrappedLastEditResponse = await fetchWithTimeout(
          `${window.location.origin}/api/socketLastEditEvent?missionId=${missionId}`,
          { timeout: 2000 }
        );

        if (wrappedLastEditResponse.status === 200) {
          const lastEditResponse = await wrappedLastEditResponse.json();
          if (
            interfaceStoreRef.current.socketStatus.lastEditEvent &&
            lastEditResponse &&
            _.isEqual(lastEditResponse, interfaceStoreRef.current.socketStatus.lastEditEvent) ===
              false
          ) {
            alert(
              `The mission you are editing has been updated by another user while you were disconnected.\n
              Please refresh your browser to get the latest version.`
            );
          }
        }
      })();
    });

    // Incoming AEGIS version number
    socket.current.on("version", (version: string) => {
      console.log(`Server version: ${version}`);
      const currentVersion = window.sessionStorage.getItem("AEGISversion") || null;
      if (currentVersion !== version) {
        if (currentVersion !== null) {
          alert(
            `A new version of AEGIS is available. Please refresh your browser to get the latest version.`
          );
        }
        window.sessionStorage.setItem("AEGISversion", version);
      }
    });

    // Incoming client counts
    socket.current.on("statusFromServer", (statusFromServer: StatusFromServer) => {
      console.log(
        `In this room: ${statusFromServer?.visitorCounts.editors} editors, ${statusFromServer?.visitorCounts.viewers} viewers`
      );
      if (
        !_.isEqual(
          statusFromServer.visitorCounts,
          interfaceStoreRef.current.socketStatus.visitorCounts
        )
      ) {
        dispatch(setVisitorCounts(statusFromServer.visitorCounts));
      }
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
      socket.current.off("disconnect");
      socket.current.io.off("reconnect_attempt");
      socket.current.io.off("reconnect");
      socket.current.off("version");
      socket.current.off("statusFromServer");
      socket.current.off("storeUpsert");
      socket.current.off("storeDelete");
      socket.current.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, socket, wakeFetchSent, missionId, user]);

  // Keep refs up to date from store
  useEffect(() => {
    poiRef.current = poi;
    stationRef.current = station;
    evaRef.current = eva;
    traverseRef.current = traverse;
    presetRef.current = preset;
    userRef.current = user;
    interfaceStoreRef.current = interfaceStore;
  }, [poi, station, eva, traverse, preset, user, interfaceStore]);

  return <></>;
};

export default SocketClient;
