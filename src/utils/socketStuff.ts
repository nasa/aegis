import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { AppDispatch } from "store";
import {
  setAEGISVersion,
  setLastEditEvent,
  setLastStatusFromServer,
  setSocketConnectionStatus,
} from "store/interface";
import { clientFetchWithTimeout } from "./fetch-with-timeout";
import isEqual from "lodash/isEqual";
import { thunkSocketsHandleDelete, thunkSocketsHandleUpsert } from "store/thunk/thunkSockets";

export const createSocket = (serverURL: string): Socket => {
  return io(serverURL, {
    transports: ["websocket"],
    upgrade: true,
    path: "/api/v1/socketio",
    reconnectionAttempts: serverURL === "aegis.fit.nasa.gov" ? Infinity : 10,
  });
};

export const attachSocketListeners = (
  socket: Socket,
  dispatch: AppDispatch,
  interfaceStoreRef: React.MutableRefObject<InterfaceState>,
  userRef: React.MutableRefObject<UserState>,
  missionId: number
): void => {
  socket.on("connect", () => {
    // put socketId and missionId in sessionStorage so it can be access around the app
    // this could possibly be moved into a client side global?
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("socketId", socket.id); // used to identify messages originated from this client
      window.sessionStorage.setItem("missionId", missionId.toString());
    }

    // Get current user permissions on this mission
    const permissionType: "viewer" | "editor" = userRef.current.missionPerms.permissions.edit
      ? "editor"
      : "viewer";

    const visitorData: VisitorData = {
      socketId: socket.id,
      missionId,
      permission: permissionType,
      appVersion: interfaceStoreRef.current.appVersion,
      launchpadUser: userRef.current.launchpadUser,
      appUser: userRef.current.appUser,
      connectedAt: Date.now(),
    };
    socket.emit("visitorJoin", visitorData);

    dispatch(setSocketConnectionStatus("connected"));
  });
  socket.on("disconnect", () => {
    dispatch(setSocketConnectionStatus("disconnected"));
  });
  socket.io.on("reconnect_attempt", () => {
    dispatch(setSocketConnectionStatus("reconnecting"));
  });
  socket.io.on("reconnect", () => {
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
          isEqual(lastEditResponse, interfaceStoreRef.current.socketStatus.lastEditEvent) === false
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
  socket.io.on("reconnect_failed", () => {
    console.error("Socket reconnection failed after maximum attempts.");
    dispatch(setSocketConnectionStatus("failed"));
  });

  // Incoming AEGIS version number
  socket.on("version", (appVersion: AppVersion) => {
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
  socket.on("statusFromServer", (statusFromServer: StatusFromServer) => {
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
  socket.on("storeUpsert", (storeUpsert: StoreUpsert) => {
    // update the last edit event in the store
    dispatch(setLastEditEvent(storeUpsert?.lastEditEvent));

    const sessionSocketId =
      typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
    if (sessionSocketId === storeUpsert.socketId) return;

    const handleUpsertAsync = async () => {
      const thunkResponse = await dispatch(thunkSocketsHandleUpsert({ storeUpsert: storeUpsert }));
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
  });

  // Incoming store deletes
  socket.on("storeDelete", (storeDelete: StoreDelete) => {
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
  });
};

export const cleanupSocket = (socket: Socket): void => {
  socket.off("connect");
  socket.off("disconnect");
  socket.io.off("reconnect_attempt");
  socket.io.off("reconnect");
  socket.io.off("reconnect_failed");
  socket.off("version");
  socket.off("statusFromServer");
  socket.off("storeUpsert");
  socket.off("storeDelete");
  socket.disconnect();
};
