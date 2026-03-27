import type { FunctionComponent } from "react";
import { useEffect, useRef } from "react";

import { deepEqual, useAppSelector } from "utils/useAppSelector";
import type { Socket } from "socket.io-client";
import { useAppDispatch } from "utils/useAppDispatch";
import { cleanupSocketListeners, createSocket, attachSocketListeners } from "utils/socketStuff";

const SocketClient: FunctionComponent<{ missionId: number }> = ({ missionId }) => {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.user, deepEqual);
  const connectionStore = useAppSelector((state) => state.connection, deepEqual);

  // all stores are stored in refs so that the socket event handlers can access the latest values
  const userRef = useRef(user);
  const connectionStoreRef = useRef(connectionStore);

  //socket connection
  const socket = useRef<Socket<ServerToClientEvents, ClientToServerEvents>>(null);

  //Handle socketio events
  useEffect(() => {
    if (!missionId || !user?.missionPerms || !connectionStore?.clientAppVersion) return;
    // Create a socket connection to the server.
    // On handshake, the server will generate an socket id for the client
    if (!socket.current || (socket.current && !socket.current.connected)) {
      socket.current = createSocket(window.location.origin);
    }

    attachSocketListeners(socket.current, dispatch, connectionStoreRef, userRef, missionId);

    // Clean up the socket connection on unmount
    return () => {
      cleanupSocketListeners(socket.current);
    };
  }, [dispatch, socket, missionId, user, connectionStore.clientAppVersion]);

  // Keep refs up to date from store
  useEffect(() => {
    userRef.current = user;
    connectionStoreRef.current = connectionStore;
  }, [user, connectionStore]);

  return <></>;
};

export default SocketClient;
