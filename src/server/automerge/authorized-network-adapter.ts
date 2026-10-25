import { cbor } from "@automerge/automerge-repo/slim";
import type { Message } from "@automerge/automerge-repo/slim";
import { decodeSyncMessage } from "@automerge/automerge/slim";
import { NodeWSServerAdapter } from "@automerge/automerge-repo-network-websocket";
import type WebSocket from "isomorphic-ws";
import { Doc_Listing_db } from "server/database/models/doc_listing.model";
import { globalValues } from "server/express/global";
import { hasPerms } from "utils/permissions";

export class AuthorizedNetworkAdapter extends NodeWSServerAdapter {
  private users = new WeakMap<WebSocket, AppUser>();
  private queues = new WeakMap<WebSocket, Promise<void>>();

  authorize(socket: WebSocket, user: AppUser): void {
    this.users.set(socket, user);
  }

  override receiveMessage(bytes: Uint8Array, socket: WebSocket): void {
    const pending = this.queues.get(socket) ?? Promise.resolve();
    const next = pending.then(async () => {
      if (socket.readyState !== socket.OPEN) return;
      try {
        const message = cbor.decode(bytes) as Message;
        const user = this.users.get(socket);
        if (!user) throw new Error("Unauthenticated peer");
        if (message.type === "join") {
          // A peer cannot take over another authenticated connection's sync state.
          if (this.sockets[message.senderId] && this.sockets[message.senderId] !== socket) {
            throw new Error("Peer identity already connected");
          }
        } else {
          if (!["sync", "request", "doc-unavailable", "ephemeral"].includes(message.type)) {
            throw new Error("Unsupported peer message");
          }
          const listing = await globalValues.orm.em.fork().findOne(Doc_Listing_db, {
            automergeUrl: `automerge:${message.documentId}`,
          });
          if (
            !listing ||
            !hasPerms({ missionId: listing.missionId, permission: "view", appUser: user })
          ) {
            throw new Error("Document access denied");
          }
          const canEdit = hasPerms({
            missionId: listing.missionId,
            permission: "edit",
            appUser: user,
          });
          if (!canEdit && (message.type === "sync" || message.type === "request")) {
            if (decodeSyncMessage(message.data).changes.length > 0) {
              throw new Error("Document is read only");
            }
          }
          if (!canEdit && message.type === "ephemeral") throw new Error("Document is read only");
        }
        super.receiveMessage(bytes, socket);
      } catch {
        socket.close(1008, "Unauthorized document operation");
      }
    });
    this.queues.set(socket, next);
  }
}
