import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { matchPath } from "react-router";
import type { AppDispatch } from "./useAppDispatch";
import {
  setLastStatusFromServer,
  setServerVersion,
  setSocketConnectionStatus,
} from "store/connection";
import isEqual from "lodash/isEqual";
import { clearAllEditing } from "store/crossActions";
import { clientLogger } from "utils/logging/clientLogger";

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Callers pass an origin (`https://aegis.fit.nasa.gov`), but load testing may
 * pass a bare hostname or an otherwise unparsable value, so fall back to
 * comparing the raw string when `URL` cannot parse it.
 */
export const isProductionServerURL = (serverURL: string): boolean => {
  try {
    return new URL(serverURL).hostname === "aegis.fit.nasa.gov";
  } catch {
    return serverURL === "aegis.fit.nasa.gov";
  }
};

export const createClientSocket = (
  serverURL: string,
  loadTestOptions?: { rejectUnauthorized?: boolean } // used for load testing ONLY
): ClientSocket => {
  return io(serverURL, {
    transports: ["websocket"],
    upgrade: true,
    path: "/api/socket",
    reconnectionAttempts: isProductionServerURL(serverURL) ? Infinity : 500,
    // Allow disabling for self-signed certs when running load testing locally
    rejectUnauthorized: loadTestOptions?.rejectUnauthorized ?? true,
  });
};

let clientSocket: ClientSocket | null = null;

/**
 * The one default-namespace socket shared by every page in this tab. It is created on first use
 * and stays open for the life of the tab, so callers attach and remove their own handlers and
 * never disconnect it.
 */
export const getClientSocket = (): ClientSocket => {
  if (!clientSocket) clientSocket = createClientSocket(window.location.origin);
  return clientSocket;
};

/**
 * Joins the inspector room on the shared socket, and joins again after every reconnect since the
 * server forgets rooms on disconnect. Returns a function that leaves the room and removes these
 * listeners.
 *
 * This is on top of the default-namespace socket managed by `getClientSocket`. Additional listeners
 * are attached specifically for the inspector room.
 */
export const joinInspectorRoom = (
  socket: ClientSocket,
  onConnectionStatusChange: (connectionStatus: ConnectionStatus) => void,
  onInspectorUpdate: (serverSocketStatus: ServerSocketStatus) => void
): (() => void) => {
  const handleConnect = () => {
    socket.emit("inspectorJoin");
    onConnectionStatusChange("connected");
  };
  const handleDisconnect = () => {
    onConnectionStatusChange("disconnected");
  };
  // Matches the app-wide listeners: "failed" only once the manager stops retrying
  const handleReconnectAttempt = () => {
    onConnectionStatusChange("reconnecting");
  };
  const handleReconnectFailed = () => {
    onConnectionStatusChange("failed");
  };

  socket.on("connect", handleConnect);
  socket.on("disconnect", handleDisconnect);
  socket.io.on("reconnect_attempt", handleReconnectAttempt);
  socket.io.on("reconnect_failed", handleReconnectFailed);
  socket.on("inspectorUpdate", onInspectorUpdate);
  if (socket.connected) handleConnect();

  return () => {
    socket.off("connect", handleConnect);
    socket.off("disconnect", handleDisconnect);
    socket.io.off("reconnect_attempt", handleReconnectAttempt);
    socket.io.off("reconnect_failed", handleReconnectFailed);
    socket.off("inspectorUpdate", onInspectorUpdate);
    if (socket.connected) socket.emit("inspectorLeave");
  };
};

const getPathPage = (pathname: string): AppPages => {
  if (pathname === "/") return "home";
  if (matchPath("/mission/:id", pathname)) return "mission";
  if (matchPath("/dashboard/:id", pathname)) return "dashboard";
  if (matchPath("/admin/*", pathname)) return "admin";
  if (matchPath("/versionCheck", pathname)) return "versionCheck";
  return "other";
};

/**
 * The page report for the current route. A mission or dashboard page reports its mission id and
 * permission only after the page has loaded permissions for that same mission, so a visitor is
 * never counted on a mission with another mission's permission.
 */
export const getVisitorPageData = (
  pathname: string,
  missionPerms: Permission | null
): VisitorPageData => {
  const page = getPathPage(pathname);
  const missionMatch = matchPath("/mission/:id", pathname) ?? matchPath("/dashboard/:id", pathname);
  const routeMissionId = Number(missionMatch?.params.id);
  const hasMissionAccess =
    Number.isInteger(routeMissionId) &&
    missionPerms?.missionId === routeMissionId &&
    (missionPerms.permissions.view || missionPerms.permissions.edit);
  if (!hasMissionAccess) return { page, missionId: null, permission: null };
  return {
    page,
    missionId: routeMissionId,
    permission: missionPerms.permissions.edit ? "editor" : "viewer",
  };
};

/**
 * Gets the visitor join data for the current user and connection state.
 * @param user
 * @param connectionStore
 * @returns
 */
export const getVisitorJoinData = (
  user: UserState,
  connectionStore: ConnectionState
): VisitorJoinData => ({
  clientAppVersion: connectionStore.clientAppVersion,
  appUser: user.appUser,
  launchpadUser: user.launchpadUser,
  connectedAt: Date.now(),
});

/**
 * Attaches the app-wide visitor, version and status listeners. On every connect, including
 * reconnects, it sends visitorJoin and then the current page, since the server forgets both on
 * disconnect. Returns a function that removes only these listeners.
 */
export const attachSocketListeners = (
  socket: ClientSocket,
  dispatch: AppDispatch,
  connectionStoreRef: React.MutableRefObject<ConnectionState>,
  userRef: React.MutableRefObject<UserState>,
  visitorPageDataRef: React.MutableRefObject<VisitorPageData>
): (() => void) => {
  const handleConnect = () => {
    // put socketId in sessionStorage so it can be access around the app
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("socketId", socket.id); // used to identify messages originated from this client
    }

    socket.emit("visitorJoin", getVisitorJoinData(userRef.current, connectionStoreRef.current));
    socket.emit("visitorPageChange", visitorPageDataRef.current);

    dispatch(setSocketConnectionStatus("connected"));
  };

  // This event may take ~20 seconds to fire after a server crash due to the ping interval
  const handleDisconnect = () => {
    dispatch(setSocketConnectionStatus("disconnected"));
    dispatch(clearAllEditing());
  };

  const handleReconnectAttempt = () => {
    dispatch(setSocketConnectionStatus("reconnecting"));
  };

  // For non-production environments. In production we will attempt reconnects infinitely
  const handleReconnectFailed = () => {
    clientLogger.error(
      {
        logId: "socket:clientSocketIo:reconnectFailedAfterMaximumAttempts",
        logValue: "Socket.IO reconnect_failed (path: /api/socket)",
      },
      new Error("Socket reconnection failed after maximum attempts")
    );
    dispatch(setSocketConnectionStatus("failed"));
  };

  // Incoming AEGIS version number
  const handleVersion = (serverAppVersion: AppVersion) => {
    // The version check page compares versions itself. Prevents a loop of redirects when already on the version check page.
    const isOnVersionCheckPage =
      typeof window !== "undefined" && window.location.pathname === "/versionCheck";
    if (
      !isOnVersionCheckPage &&
      (connectionStoreRef.current.clientAppVersion.version !== serverAppVersion.version ||
        connectionStoreRef.current.clientAppVersion.gitCommit !== serverAppVersion.gitCommit ||
        connectionStoreRef.current.clientAppVersion.serverEpochUuid !==
          serverAppVersion.serverEpochUuid)
    ) {
      if (connectionStoreRef.current.clientAppVersion?.version) {
        alert(
          `AEGIS has been updated or restarted. You will be redirected to a version check page. \nCurrent version: ${connectionStoreRef.current.clientAppVersion.version}/${connectionStoreRef.current.clientAppVersion.gitCommit}/${connectionStoreRef.current.clientAppVersion.serverEpochUuid}\nNew version: ${serverAppVersion.version}/${serverAppVersion.gitCommit}/${serverAppVersion.serverEpochUuid} `
        );

        // Redirect to version check page with version info and return URL
        const currentUrl = window.location.pathname + window.location.search;
        window.location.href = `/versionCheck?returnUrl=${encodeURIComponent(currentUrl)}`;
        return;
      }
    }
    dispatch(setServerVersion(serverAppVersion));
  };

  // Incoming client counts
  const handleStatusFromServer = (statusFromServer: StatusFromServer) => {
    if (!isEqual(statusFromServer, connectionStoreRef.current.socketStatus.lastStatusFromServer)) {
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
  };

  socket.on("connect", handleConnect);
  socket.on("disconnect", handleDisconnect);
  socket.io.on("reconnect_attempt", handleReconnectAttempt);
  socket.io.on("reconnect_failed", handleReconnectFailed);
  socket.on("version", handleVersion);
  socket.on("statusFromServer", handleStatusFromServer);
  // The shared socket may have connected before these listeners were attached
  if (socket.connected) handleConnect();

  return () => {
    socket.off("connect", handleConnect);
    socket.off("disconnect", handleDisconnect);
    socket.io.off("reconnect_attempt", handleReconnectAttempt);
    socket.io.off("reconnect_failed", handleReconnectFailed);
    socket.off("version", handleVersion);
    socket.off("statusFromServer", handleStatusFromServer);
  };
};
