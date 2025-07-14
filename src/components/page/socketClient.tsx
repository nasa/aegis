import { FunctionComponent, useCallback, useEffect, useRef } from "react";

import {
  setAEGISVersion,
  setLastEditEvent,
  setSocketConnectionStatus,
  setLastStatusFromServer,
} from "store/interface";
import { deepEqual, useAppSelector } from "utils/useAppSelector";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { useAppDispatch } from "utils/useAppDispatch";
import isEqual from "lodash/isEqual";
import { thunkSocketsHandleDelete, thunkSocketsHandleUpsert } from "store/thunk/thunkSockets";
import { clientFetchWithTimeout } from "utils/fetch-with-timeout";

const SocketClient: FunctionComponent<{ missionId: number }> = ({ missionId }) => {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.user, deepEqual);
  const interfaceStore = useAppSelector((state) => state.interface, deepEqual);

  // all stores are stored in refs so that the socket event handlers can access the latest values
  const userRef = useRef(user);
  const interfaceStoreRef = useRef(interfaceStore);

  //socket connection
  const socket = useRef<Socket<ServerToClientEvents, ClientToServerEvents>>(null);

  const storeUpsertEventHandler = useCallback(
    (storeUpsert: StoreUpsert) => {
      // update the last edit event in the store
      dispatch(setLastEditEvent(storeUpsert?.lastEditEvent));

      const sessionSocketId =
        typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
      if (sessionSocketId === storeUpsert.socketId) return;

      const handleUpsertAsync = async () => {
        const thunkResponse = await dispatch(
          thunkSocketsHandleUpsert({ storeUpsert: storeUpsert })
        );
        if (thunkResponse.payload === false) {
          //gracefully reject?
        } else {
          const alertStrings = thunkResponse.payload as string[];
          if (alertStrings.length > 0) {
            alert(alertStrings.join("\n"));
          }
        }
      };
      handleUpsertAsync();
    },
    [dispatch]
  );

  const storeDeleteEventHandler = useCallback(
    (storeDelete: StoreDelete) => {
      // update the last edit event in the store
      dispatch(setLastEditEvent(storeDelete?.lastEditEvent));

      const sessionSocketId =
        typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
      if (sessionSocketId === storeDelete.socketId) return;

      const handleDeleteAsync = async () => {
        const thunkResponse = await dispatch(thunkSocketsHandleDelete({ storeDelete }));
        if (thunkResponse.payload === false) {
          //gracefully reject?
        } else {
          const alertStrings = thunkResponse.payload as string[];
          if (alertStrings.length > 0) {
            alert(alertStrings.join("\n"));
          }
        }
      };
      handleDeleteAsync();
    },
    [dispatch]
  );

  //Handle socketio events
  useEffect(() => {
    if (!missionId || !user?.missionPerms || !interfaceStore?.appVersion) return;
    // Create a socket connection to the server.
    // On handshake, the server will generate an socket id for the client
    if (!socket.current || (socket.current && !socket.current.connected)) {
      const socketUrl = window.location.origin;
      socket.current = io(socketUrl, {
        transports: ["websocket"],
        upgrade: true,
        path: "/api/v1/socketio",
        reconnectionAttempts: socketUrl === "aegis.fit.nasa.gov" ? Infinity : 10,
      });
    }

    socket.current.on("connect", () => {
      // put socketId and missionId in sessionStorage so it can be access around the app
      // this could possibly be moved into a client side global?
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("socketId", socket.current.id); // used to identify messages originated from this client
        window.sessionStorage.setItem("missionId", missionId.toString());
      }

      // Get current user permissions on this mission
      const permissionType: "viewer" | "editor" = userRef.current.missionPerms.permissions.edit
        ? "editor"
        : "viewer";

      const visitorData: VisitorData = {
        socketId: socket.current.id,
        missionId,
        permission: permissionType,
        appVersion: interfaceStoreRef.current.appVersion,
        launchpadUser: userRef.current.launchpadUser,
        appUser: userRef.current.appUser,
        connectedAt: Date.now(),
      };
      socket.current.emit("visitorJoin", visitorData);

      dispatch(setSocketConnectionStatus("connected"));
    });

    socket.current.on("disconnect", () => {
      dispatch(setSocketConnectionStatus("disconnected"));
    });
    socket.current.io.on("reconnect_attempt", () => {
      dispatch(setSocketConnectionStatus("reconnecting"));
    });
    socket.current.io.on("reconnect", () => {
      // after this "reconnect" event, the "connect" event will fire
      dispatch(setSocketConnectionStatus("connected"));

      // hit the API to get the latest edit event and compare it to the one in the store
      // if they are different, then alert the user and refresh the page
      const fetchLastEventAsync = async () => {
        const wrappedLastEditResponse = await clientFetchWithTimeout(
          `${window.location.origin}/api/v1/socket/lastEditEvent?missionId=${missionId}`,
          null,
          2000
        );

        if (wrappedLastEditResponse.status === 200) {
          const lastEditResponse =
            (await wrappedLastEditResponse.json()) as WrappedResponse<EditEvent>;
          if (
            interfaceStoreRef.current.socketStatus.lastEditEvent &&
            lastEditResponse &&
            lastEditResponse.data &&
            isEqual(lastEditResponse, interfaceStoreRef.current.socketStatus.lastEditEvent) ===
              false
          ) {
            alert(
              `The mission you are editing has been updated by another user while you were disconnected.\n
              Please refresh your browser to get the latest version.`
            );
          }
        } else {
          alert("Unable to fetch last event from server. Please refresh your browser");
        }
      };
      fetchLastEventAsync();
    });

    // For non-production environments. In production we will attempt reconnects infinitely
    socket.current.io.on("reconnect_failed", () => {
      console.error("Socket reconnection failed after maximum attempts.");
      dispatch(setSocketConnectionStatus("failed"));
    });

    // Incoming AEGIS version number
    socket.current.on("version", (appVersion: AppVersion) => {
      if (
        interfaceStoreRef.current.appVersion.version !== appVersion.version ||
        interfaceStoreRef.current.appVersion.gitCommit !== appVersion.gitCommit
      ) {
        if (interfaceStoreRef.current.appVersion?.version) {
          alert(
            `A new version of AEGIS is available. Please refresh your browser to get the latest version. \nCurrent version: ${interfaceStoreRef.current.appVersion.version}/${interfaceStoreRef.current.appVersion.gitCommit}\nNew version: ${appVersion.version}/${appVersion.gitCommit} `
          );
        }
        dispatch(setAEGISVersion(appVersion));
      }
    });

    // Incoming client counts
    socket.current.on("statusFromServer", (statusFromServer: StatusFromServer) => {
      if (!isEqual(statusFromServer, interfaceStoreRef.current.socketStatus.lastStatusFromServer)) {
        dispatch(setLastStatusFromServer(statusFromServer));
      }
      // calculate the time offset between the client's clock and the server's clock
      const clientTimestamp = Date.now();
      const serverTimestamp = statusFromServer.timestamp;
      const timeOffsetMs = clientTimestamp - serverTimestamp;
      // put the calculated time offset in sessionStorage so that it is available across page refreshes
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("timeOffsetMs", timeOffsetMs.toString());
      }
    });

    // Listen for incoming store updates
    socket.current.on("storeUpsert", (storePayload: StoreUpsert) => {
      storeUpsertEventHandler(storePayload);
    });

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
  }, [dispatch, socket, missionId, user, interfaceStore.appVersion]);

  // Keep refs up to date from store
  useEffect(() => {
    userRef.current = user;
    interfaceStoreRef.current = interfaceStore;
  }, [user, interfaceStore]);

  return <></>;
};

export default SocketClient;
