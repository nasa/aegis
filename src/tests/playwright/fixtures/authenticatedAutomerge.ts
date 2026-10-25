import type { APIRequestContext } from "@playwright/test";
import type { PeerId, PeerMetadata } from "@automerge/automerge-repo";
import { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import WebSocket from "ws";

export class AuthenticatedAutomergeAdapter extends WebSocketClientAdapter {
  constructor(
    url: string,
    private cookie: string
  ) {
    super(url, 0);
  }

  override connect(peerId: PeerId, peerMetadata?: PeerMetadata): void {
    this.peerId = peerId;
    this.peerMetadata = peerMetadata ?? {};
    this.socket = new WebSocket(this.url, { headers: { cookie: this.cookie } });
    this.socket.binaryType = "arraybuffer";
    this.socket.addEventListener("open", this.onOpen);
    this.socket.addEventListener("close", this.onClose);
    this.socket.addEventListener("message", this.onMessage);
    this.socket.addEventListener("error", this.onError);
  }
}

export async function authenticatedAutomergeAdapter(
  request: APIRequestContext,
  url: string
): Promise<AuthenticatedAutomergeAdapter> {
  const { cookies } = await request.storageState();
  return new AuthenticatedAutomergeAdapter(
    url,
    cookies.map(({ name, value }) => `${name}=${value}`).join("; ")
  );
}
