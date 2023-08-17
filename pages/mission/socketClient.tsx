import { FunctionComponent, useCallback, useEffect, useRef, useState } from "react";

import {
  setAEGISVersion,
  setLastEditEvent,
  setSocketConnectionStatus,
  setVisitorCounts,
} from "store/interface";
import { shallowEqual, useAppSelector } from "utils/useAppSelector";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import fetchWithTimeout from "utils/fetch-with-timeout";
import { useAppDispatch } from "utils/useAppDispatch";
import _ from "lodash";
import { thunkSocketsHandleDelete, thunkSocketsHandleUpsert } from "store/thunk/thunkSockets";

const SocketClient: FunctionComponent<{ missionId: number }> = ({ missionId }) => {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.user, shallowEqual);
  const interfaceStore = useAppSelector((state) => state.interface, shallowEqual);

  // all stores are stored in refs so that the socket event handlers can access the latest values
  const userRef = useRef(user);
  const interfaceStoreRef = useRef(interfaceStore);

  //socket connection
  const socket = useRef<Socket<ServerToClientEvents, ClientToServerEvents>>(null);
  const [wakeFetchSent, setWakeFetchSent] = useState(false);

  const storeUpsertEventHandler = useCallback(
    (storePayload: StoreUpsert<POI | Preset | Station | Eva | Action | Traverse | Mission>) => {
      console.log(
        `${new Date().toISOString()} Received storeUpsert from server. Mission: ${
          storePayload.missionId
        } socketId: ${storePayload.socketId} Type:${storePayload.type}`
      );
      // ignore all events that are not for the currently selected mission
      if (storePayload.missionId !== missionId) {
        console.log(
          `${new Date().toISOString()} Ignoring storeUpsert from server because this client is looking at a different mission. Mission: ${
            storePayload.missionId
          } socketId: ${storePayload.socketId} Type:${storePayload.type}`
        );
        return;
      }
      // update the last edit event in the store
      dispatch(setLastEditEvent(storePayload?.lastEditEvent));

      const sessionSocketId =
        typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
      if (sessionSocketId === storePayload.socketId) {
        console.log(
          `${new Date().toISOString()} Ignoring storeUpsert from server because it was sent by this client. Mission: ${
            storePayload.missionId
          } socketId: ${storePayload.socketId} Type:${storePayload.type}`
        );
        return;
      }

      (async () => {
        const thunkResponse = await dispatch(
          thunkSocketsHandleUpsert({ storeUpsert: storePayload })
        );
        if (thunkResponse.payload === false) {
          //gracefully reject?
        } else {
          const alertStrings = thunkResponse.payload as string[];
          if (alertStrings.length > 0) {
            alert(alertStrings.join("\n"));
          }
        }
      })();
    },
    [dispatch, missionId]
  );

  const storeDeleteEventHandler = useCallback(
    (storeDelete: StoreDelete) => {
      console.log(
        `${new Date().toISOString()} Received delete event from server. Mission: ${
          storeDelete.missionId
        } socketId: ${storeDelete.socketId} Type:${storeDelete.type} uuid:${storeDelete.uuid}`
      );
      // ignore all events that are not for the currently selected mission
      if (storeDelete.missionId !== missionId) {
        console.log(
          `${new Date().toISOString()} Ignoring delete event from server because this client is looking at a different mission. Mission: ${
            storeDelete.missionId
          } socketId: ${storeDelete.socketId} Type:${storeDelete.type} uuid:${storeDelete.uuid}`
        );
        return;
      }
      // update the last edit event in the store
      dispatch(setLastEditEvent(storeDelete?.lastEditEvent));

      const sessionSocketId =
        typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
      if (sessionSocketId === storeDelete.socketId) {
        console.log(
          `${new Date().toISOString()} Ignoring delete event from server because it was sent by this client. Mission: ${
            storeDelete.missionId
          } socketId: ${storeDelete.socketId} Type:${storeDelete.type} uuid:${storeDelete.uuid}`
        );
        return;
      }

      (async () => {
        const thunkResponse = await dispatch(thunkSocketsHandleDelete({ storeDelete }));
        if (thunkResponse.payload === false) {
          //gracefully reject?
        } else {
          const alertStrings = thunkResponse.payload as string[];
          if (alertStrings.length > 0) {
            alert(alertStrings.join("\n"));
          }
        }
      })();
    },
    [dispatch, missionId]
  );

  //Handle socketio events
  useEffect(() => {
    if (!wakeFetchSent) {
      try {
        fetchWithTimeout(`${window.location.origin}/api/socketio`, { timeout: 5 });
      } catch (error) {
        // ignore
      }
      setWakeFetchSent(true);
      return;
    }

    if (!missionId || !user?.missionPerms) return;

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

      // put socketId in sessionStorage so that it persists across page refreshes
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("socketId", socket.current.id);
      }
      // put missionId in sessionStorage so that it persists across page refreshes
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("missionId", missionId.toString());
      }

      const visitorJoin: VisitorJoin = {
        missionId: missionId,
        socketId: socket.current.id,
        type: permissionType,
      };
      socket.current.emit("visitorJoin", visitorJoin);

      console.log(
        `${new Date().toISOString()} Connected to socket.io server. Joining Mission: ${missionId} socketId: ${
          socket.current.id
        }. Type: ${permissionType}.`
      );
      dispatch(setSocketConnectionStatus("connected"));
    });

    socket.current.on("disconnect", () => {
      console.log(`${new Date().toISOString()} Disconnected from socket.io server`);
      dispatch(setSocketConnectionStatus("disconnected"));
    });
    socket.current.io.on("reconnect_attempt", () => {
      console.log(`${new Date().toISOString()} Attempting to reconnect to socket.io server`);
      dispatch(setSocketConnectionStatus("reconnecting"));
    });
    socket.current.io.on("reconnect", () => {
      console.log(`${new Date().toISOString()} Reconnected to socket.io server`);
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

      if (interfaceStoreRef.current.socketStatus.AEGISVersion !== version) {
        if (interfaceStoreRef.current.socketStatus.AEGISVersion !== null) {
          alert(
            `A new version of AEGIS is available. Please refresh your browser to get the latest version.`
          );
        }
        dispatch(setAEGISVersion(version));
      }
    });

    // Incoming client counts
    socket.current.on("statusFromServer", (statusFromServer: StatusFromServer) => {
      // console.log(
      //   `${new Date().toISOString()} In this room: ${
      //     statusFromServer?.visitorCounts.editors
      //   } editors, ${statusFromServer?.visitorCounts.viewers} viewers`
      // );
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
      (storePayload: StoreUpsert<POI | Preset | Station | Eva | Action | Traverse | Mission>) => {
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
    userRef.current = user;
    interfaceStoreRef.current = interfaceStore;
  }, [user, interfaceStore]);

  return <></>;
};

export default SocketClient;
