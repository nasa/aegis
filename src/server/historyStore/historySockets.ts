import type { Namespace, Socket } from "socket.io";
import { globalValues } from "server/express/global";
import { serverLogger } from "utils/logging/serverLogger";
import type { ServerHistoryRepo } from "./ServerHistoryRepo";

type HistoryNamespace = Namespace<HistoryClientToServerEvents, HistoryServerToClientEvents>;
type HistorySocket = Socket<HistoryClientToServerEvents, HistoryServerToClientEvents>;

const roomFor = (documentId: HistoryDocumentId) => `history:${documentId}`;

/** Upper bound on actions in one `sendActions` call, so one client cannot stall the queue. */
const MAX_ACTIONS_PER_MESSAGE = 500;

/**
 * The `/history/v1` Socket.IO namespace: browsers join documents, send pending actions, and
 * receive every confirmed action. Replaces the Automerge sync websocket.
 */
export const setupHistoryNamespace = (repo: ServerHistoryRepo): HistoryNamespace => {
  const nsp: HistoryNamespace = globalValues.socketio.of("/history/v1");

  // Every confirmed batch, whoever made it, goes to every browser viewing the document.
  repo.store.subscribe(({ documentId, confirmed }) => {
    nsp.to(roomFor(documentId)).emit("confirmActions", { documentId, actions: confirmed });
  });

  nsp.on("connection", (socket: HistorySocket) => {
    socket.on("join", async ({ documentId, serverEpochUuid }, ack) => {
      try {
        if (serverEpochUuid !== globalValues.appVersion.serverEpochUuid) {
          serverLogger.warning({
            logId: "history-socket:join:rejectedJoinDueToServerEpochMismatch",
            logValue: `Rejected history join for ${documentId}: client epoch ${serverEpochUuid}, server epoch ${globalValues.appVersion.serverEpochUuid}`,
          });
          ack({ status: "error", code: "epochMismatch", message: "Server restarted" });
          return;
        }
        await repo.find(documentId);
        // Join before reading the state: anything confirmed after the read is broadcast to
        // the room, and anything before it is in the state.
        await socket.join(roomFor(documentId));
        const latest = repo.store.getLatestStateAndActionNum(documentId);
        if (latest instanceof Error) throw latest;
        ack({ status: "success", state: latest.state, actionCount: latest.actionCount });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        serverLogger.warning({
          logId: "history-socket:join:failedToLoadRequestedDocument",
          logValue: `History join for ${documentId} failed: ${error.message}`,
        });
        ack({
          status: "error",
          code: /not found/.test(error.message) ? "notFound" : "error",
          message: error.message,
        });
      }
    });

    socket.on("leave", ({ documentId }) => {
      socket.leave(roomFor(documentId));
    });

    socket.on("sendActions", async ({ documentId, actions }, ack) => {
      try {
        if (!socket.rooms.has(roomFor(documentId))) throw new Error("Not joined to document");
        if (!Array.isArray(actions) || actions.length > MAX_ACTIONS_PER_MESSAGE) {
          throw new Error("Invalid actions payload");
        }
        await repo.find(documentId);
        const result = await repo.store.insert(documentId, actions);
        if (result.error && !result.confirmed.length) {
          serverLogger.notice({
            logId: "history-socket:sendActions:actionsRejected",
            logValue: `Rejected ${result.rejected.length} action(s) for ${documentId}: ${result.error.message}`,
          });
        }
        ack({ status: "success", rejected: result.rejected });
      } catch (err) {
        ack({ status: "error", message: err instanceof Error ? err.message : String(err) });
      }
    });

    socket.on("requestActions", async ({ documentId, fromIndex }, ack) => {
      try {
        await repo.find(documentId);
        const actions = await repo.store.getActionsSince(documentId, fromIndex);
        ack({ status: "success", actions });
      } catch (err) {
        ack({ status: "error", message: err instanceof Error ? err.message : String(err) });
      }
    });
  });

  return nsp;
};

/** Tell every browser viewing a document that it was deleted. */
export const broadcastDocumentDeleted = (documentId: HistoryDocumentId): void => {
  (globalValues.socketio?.of("/history/v1") as HistoryNamespace | undefined)
    ?.to(roomFor(documentId))
    .emit("documentDeleted", { documentId });
};
