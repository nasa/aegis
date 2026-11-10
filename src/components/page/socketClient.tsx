import type { FunctionComponent } from "react";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

import { deepEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import {
  attachSocketListeners,
  getClientSocket,
  getVisitorJoinData,
  getVisitorPageData,
} from "utils/clientSocketHelpers";

/**
 * Mounted once in the app shell. Owns the visitor, version and status handling of the shared
 * default-namespace socket, and tells the server which page this tab is on so mission and
 * dashboard pages join their mission room.
 */
const SocketClient: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const { pathname } = useLocation();
  const user = useAppSelector((state) => state.user, deepEqual);
  const connectionStore = useAppSelector((state) => state.connection, deepEqual);
  const { page, missionId, permission } = getVisitorPageData(pathname, user.missionPerms);

  // all stores are stored in refs so that the socket event handlers can access the latest values
  const userRef = useRef(user);
  const connectionStoreRef = useRef(connectionStore);
  const visitorPageDataRef = useRef<VisitorPageData>({ page, missionId, permission });

  // Keep refs up to date from store
  useEffect(() => {
    userRef.current = user;
    connectionStoreRef.current = connectionStore;
  }, [user, connectionStore]);

  //Handle socketio events
  useEffect(() => {
    return attachSocketListeners(
      getClientSocket(),
      dispatch,
      connectionStoreRef,
      userRef,
      visitorPageDataRef
    );
  }, [dispatch]);

  // Pages load the app user after the socket connects, so send who the visitor is again.
  // While disconnected, the connect handler sends it instead.
  useEffect(() => {
    const socket = getClientSocket();
    if (socket.connected) {
      socket.emit("visitorJoin", getVisitorJoinData(userRef.current, connectionStoreRef.current));
    }
  }, [user.appUser, user.launchpadUser]);

  useEffect(() => {
    visitorPageDataRef.current = { page, missionId, permission };
    const socket = getClientSocket();
    if (socket.connected) socket.emit("visitorPageChange", visitorPageDataRef.current);
  }, [page, missionId, permission]);

  return <></>;
};

export default SocketClient;
