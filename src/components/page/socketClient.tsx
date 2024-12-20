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
    (storePayload: StoreUpsert) => {
      // ignore all events that are not for the currently selected mission
      if (storePayload.missionId !== missionId) return;

      // update the last edit event in the store
      dispatch(setLastEditEvent(storePayload?.lastEditEvent));

      const sessionSocketId =
        typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
      if (sessionSocketId === storePayload.socketId) return;

      const handleUpsertAsync = async () => {
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
      };
      handleUpsertAsync();
    },
    [dispatch, missionId]
  );

  const storeDeleteEventHandler = useCallback(
    (storeDelete: StoreDelete) => {
      // ignore all events that are not for the currently selected mission
      if (storeDelete.missionId !== missionId) return;

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
    [dispatch, missionId]
  );

  //Handle socketio events
  useEffect(() => {
    if (!missionId || !user?.missionPerms) return;

    // Create a socket connection
    if (!socket.current || (socket.current && !socket.current.connected)) {
      const socketUrl = window.location.origin;

      socket.current = io(socketUrl, {
        transports: ["websocket"],
        upgrade: true,
        path: "/api/v1/socketio",
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

      dispatch(setSocketConnectionStatus("connected"));
    });

    socket.current.on("disconnect", () => {
      dispatch(setSocketConnectionStatus("disconnected"));
    });
    socket.current.io.on("reconnect_attempt", () => {
      dispatch(setSocketConnectionStatus("reconnecting"));
    });
    socket.current.io.on("reconnect", () => {
      dispatch(setSocketConnectionStatus("connected"));

      // hit the API to get the lastest edit event and compare it to the one in the store
      // if they are different, then alert the user and refresh the page
      const fetchLastEventAsync = async () => {
        const wrappedLastEditResponse = await clientFetchWithTimeout(
          `${window.location.origin}/api/socketLastEditEvent?missionId=${missionId}`,
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
        }
      };
      fetchLastEventAsync();
    });

    // Incoming AEGIS version number
    socket.current.on("version", (version: string) => {
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
  }, [dispatch, socket, missionId, user]);

  // Keep refs up to date from store
  useEffect(() => {
    userRef.current = user;
    interfaceStoreRef.current = interfaceStore;
  }, [user, interfaceStore]);

  return <></>;
};

export default SocketClient;
