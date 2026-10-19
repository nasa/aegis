import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import type { AppDispatch } from "./useAppDispatch";
import {
  setLastStatusFromServer,
  setServerVersion,
  setSocketConnectionStatus,
} from "store/connection";
import isEqual from "lodash/isEqual";
import { clearAllEditing } from "store/crossActions";
import { clientLogger } from "utils/logging/clientLogger";
import { displayToast } from "components/toastNotifications";

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
): Socket => {
  return io(serverURL, {
    transports: ["websocket"],
    upgrade: true,
    path: "/api/socket",
    reconnectionAttempts: isProductionServerURL(serverURL) ? Infinity : 500,
    // Allow disabling for self-signed certs when running load testing locally
    rejectUnauthorized: loadTestOptions?.rejectUnauthorized ?? true,
  });
};

export const attachSocketListeners = (
  socket: Socket,
  dispatch: AppDispatch,
  connectionStoreRef: React.MutableRefObject<ConnectionState>,
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
      clientAppVersion: connectionStoreRef.current.clientAppVersion,
      launchpadUser: userRef.current.launchpadUser,
      appUser: userRef.current.appUser,
      connectedAt: Date.now(),
    };
    socket.emit("visitorJoin", visitorData);

    dispatch(setSocketConnectionStatus("connected"));
  });
  // This event may take ~20 seconds to fire after a server crash due to the ping interval
  socket.on("disconnect", () => {
    dispatch(setSocketConnectionStatus("disconnected"));
    dispatch(clearAllEditing());
  });
  socket.io.on("reconnect_attempt", () => {
    dispatch(setSocketConnectionStatus("reconnecting"));
  });

  // For non-production environments. In production we will attempt reconnects infinitely
  socket.io.on("reconnect_failed", () => {
    clientLogger.error(
      { logId: "socket", logValue: "Socket.IO reconnect_failed (path: /api/socket)" },
      new Error("Socket reconnection failed after maximum attempts")
    );
    dispatch(setSocketConnectionStatus("failed"));
  });

  // Incoming AEGIS version number
  socket.on("version", (serverAppVersion: AppVersion) => {
    if (
      connectionStoreRef.current.clientAppVersion.version !== serverAppVersion.version ||
      connectionStoreRef.current.clientAppVersion.gitCommit !== serverAppVersion.gitCommit ||
      connectionStoreRef.current.clientAppVersion.serverEpochUuid !==
        serverAppVersion.serverEpochUuid
    ) {
      if (connectionStoreRef.current.clientAppVersion?.version) {
        displayToast({
          message: `AEGIS has been updated or restarted. You will be redirected to a version check page. \nCurrent version: ${connectionStoreRef.current.clientAppVersion.version}/${connectionStoreRef.current.clientAppVersion.gitCommit}/${connectionStoreRef.current.clientAppVersion.serverEpochUuid}\nNew version: ${serverAppVersion.version}/${serverAppVersion.gitCommit}/${serverAppVersion.serverEpochUuid} `,
        });

        // Redirect to version check page with version info and return URL
        const currentUrl = window.location.pathname + window.location.search;
        window.location.href = `/versionCheck?returnUrl=${encodeURIComponent(currentUrl)}`;
        return;
      }
    }
    dispatch(setServerVersion(serverAppVersion));
  });

  // Incoming client counts
  socket.on("statusFromServer", (statusFromServer: StatusFromServer) => {
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
  });
};

export const cleanupSocketListeners = (socket: Socket): void => {
  socket.off("connect");
  socket.off("disconnect");
  socket.io.off("reconnect_attempt");
  socket.io.off("reconnect_failed");
  socket.off("version");
  socket.off("statusFromServer");
  socket.disconnect();
};
