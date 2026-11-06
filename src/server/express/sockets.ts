import { serverLogger } from "utils/logging/serverLogger";
import uniq from "lodash/uniq";
import remove from "lodash/remove";
import find from "lodash/find";
import isEqual from "lodash/isEqual";
import { globalValues } from "./global";
import type { DefaultEventsMap, Socket } from "socket.io";

export const setupSocketIO = (): void => {
  const visitorsData: VisitorData[] = globalValues.serverSocketStatus.visitorsData;
  const io = globalValues.socketio;

  // Listen for connection events
  io.on(
    "connection",
    (socket: Socket<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, {}>) => {
      // emit AEGIS app version to client that just connected
      socket.emit("version", globalValues.appVersion);

      // Records the visitor. Mission rooms are joined by visitorPageChange, not here.
      socket.on("visitorJoin", (visitorJoinData: VisitorJoinData) => {
        try {
          // check app version and git commit
          if (!isEqual(visitorJoinData.clientAppVersion, globalValues.appVersion)) {
            serverLogger.warning({
              logId: "socket:visitorJoin:clientAppVersionDoesNotMatchServerAppVersion",
              logValue: `SocketIO - visitorJoin: appVersion mismatch between client and server
          client: ${JSON.stringify(visitorJoinData.clientAppVersion)}
          server: ${JSON.stringify(globalValues.appVersion)}`,
              launchpadUser: visitorJoinData.launchpadUser?.auid,
              appUser: visitorJoinData.appUser?.username,
            });
          }

          // The client sends visitorJoin again when its app user changes, so keep the page and
          // mission this socket already reported. Use the server's authoritative socket.id.
          const existingVisitor = find(visitorsData, { socketId: socket.id });
          const visitorData: VisitorData = {
            socketId: socket.id,
            clientAppVersion: visitorJoinData.clientAppVersion,
            appUser: visitorJoinData.appUser ?? null,
            launchpadUser: visitorJoinData.launchpadUser,
            connectedAt: existingVisitor?.connectedAt ?? visitorJoinData.connectedAt,
            page: existingVisitor?.page ?? null,
            missionId: existingVisitor?.missionId ?? null,
            permission: existingVisitor?.permission ?? null,
          };
          remove(visitorsData, (item) => {
            return item.socketId === socket.id;
          });
          visitorsData.push(visitorData);

          // update the inspector room
          io.to("inspector").emit("inspectorUpdate", globalValues.serverSocketStatus);
        } catch (error) {
          serverLogger.error(
            {
              logId: "socket:visitorJoin:unhandledErrorWhileProcessingVisitorJoin",
              logValue: `SocketIO - visitorJoin: payload ${JSON.stringify(visitorJoinData)}`,
              launchpadUser: visitorJoinData?.launchpadUser?.auid,
              appUser: visitorJoinData?.appUser?.username,
            },
            error instanceof Error ? error : new Error(String(error))
          );
        }
      });

      // Records which page the visitor is on and moves the socket into that page's mission room
      socket.on("visitorPageChange", (visitorPageData: VisitorPageData) => {
        try {
          const visitorData = find(visitorsData, { socketId: socket.id });
          if (!visitorData) {
            serverLogger.warning({
              logId: "socket:visitorPageChange:rejectedPageChangeBeforeVisitorJoin",
              logValue: "SocketIO - visitorPageChange received before visitorJoin",
            });
            return;
          }

          const previousMissionId = visitorData.missionId;
          visitorData.page = visitorPageData.page;
          visitorData.missionId = visitorPageData.missionId;
          visitorData.permission = visitorPageData.permission;

          // a socket is in at most one mission room
          // Loose null checks so a missing missionId in a malformed payload counts as no mission
          if (previousMissionId != null && previousMissionId !== visitorData.missionId) {
            socket.leave(previousMissionId.toString());
            io.to(previousMissionId.toString()).emit(
              "statusFromServer",
              getStatusFromServer(previousMissionId)
            );
          }
          if (visitorData.missionId != null) {
            socket.join(visitorData.missionId.toString());
            // emit new status to all clients in this room including this client
            io.to(visitorData.missionId.toString()).emit(
              "statusFromServer",
              getStatusFromServer(visitorData.missionId)
            );
          }

          // update the inspector room
          io.to("inspector").emit("inspectorUpdate", globalValues.serverSocketStatus);
        } catch (error) {
          serverLogger.error(
            {
              logId: "socket:visitorPageChange:unhandledErrorWhileProcessingPageChange",
              logValue: `SocketIO - visitorPageChange: payload ${JSON.stringify(visitorPageData)}`,
            },
            error instanceof Error ? error : new Error(String(error))
          );
        }
      });

      socket.on("inspectorJoin", () => {
        socket.join("inspector"); // join an inspector room

        // using io.to will emit to all clients in the inspector room, including this client
        io.to("inspector").emit("inspectorUpdate", globalValues.serverSocketStatus);
      });

      socket.on("inspectorLeave", () => {
        socket.leave("inspector");
      });

      socket.on("disconnect", () => {
        try {
          // remove this socket if it's a regular visitor
          const visitorBeingRemoved = find(visitorsData, {
            socketId: socket.id,
          });
          if (visitorBeingRemoved) {
            remove(visitorsData, (item) => {
              return item.socketId === visitorBeingRemoved.socketId;
            });

            // emit updated visitor count to all clients in this room
            if (visitorBeingRemoved.missionId != null) {
              const statusFromServer = getStatusFromServer(visitorBeingRemoved.missionId);
              socket
                .to(visitorBeingRemoved.missionId.toString())
                .emit("statusFromServer", statusFromServer);
            }
          }

          // update the inspector room
          io.to("inspector").emit("inspectorUpdate", globalValues.serverSocketStatus);
        } catch (error) {
          serverLogger.error(
            {
              logId: "socket:disconnect:unhandledErrorWhileRemovingDisconnectedVisitor",
              logValue: "SocketIO - disconnect",
            },
            error instanceof Error ? error : new Error(String(error))
          );
        }
      });

      // send server status to all clients in every room every 10 seconds
      if (!globalValues.socketInterval) {
        globalValues.socketInterval = setInterval(() => {
          // Visitor data comes from clients unvalidated, so an error here is logged rather than
          // thrown, since an exception in a timer callback would crash the server
          try {
            // get unique missionIds to find all the rooms
            const missionIds = uniq(
              visitorsData.map((item) => item.missionId).filter((missionId) => missionId != null)
            );
            for (const missionId of missionIds) {
              const statusFromServer = getStatusFromServer(missionId);
              io.to(missionId.toString()).emit("statusFromServer", statusFromServer);
            }
          } catch (error) {
            serverLogger.error(
              {
                logId: "socket:statusFromServerInterval:unhandledErrorWhileSendingVisitorCounts",
                logValue: "SocketIO - statusFromServer interval",
              },
              error instanceof Error ? error : new Error(String(error))
            );
          }
        }, 10000);
      }
    }
  );
};

// build the heartbeat message sent every 10 seconds to clients
const getStatusFromServer = (missionId: number): StatusFromServer => {
  let editorCounts = 0;
  let viewerCounts = 0;
  const visitorsData = globalValues.serverSocketStatus.visitorsData;
  for (const visitorData of visitorsData) {
    if (visitorData.permission === "editor" && visitorData.missionId === missionId) {
      editorCounts++;
    }
    if (visitorData.permission === "viewer" && visitorData.missionId === missionId) {
      viewerCounts++;
    }
  }
  const serverStatus: StatusFromServer = {
    visitorCounts: {
      editors: editorCounts,
      viewers: viewerCounts,
    },
    timestamp: Date.now(),
    serverVersion: globalValues.appVersion,
  };
  return serverStatus;
};
