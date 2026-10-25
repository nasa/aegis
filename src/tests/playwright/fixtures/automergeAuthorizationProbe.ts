import { randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { cbor } from "@automerge/automerge-repo";
import { encodeSyncMessage, from, getAllChanges, getHeads } from "@automerge/automerge";
import WebSocket from "ws";
import { expect } from "@playwright/test";

export async function expectDocumentOperationDenied(
  request: APIRequestContext,
  baseURL: string,
  docUrl: string,
  write: boolean
): Promise<void> {
  const version: AppVersion = await (await request.get("/api/v1/version")).json();
  const socketUrl = new URL("/api/automergeSocket/", baseURL);
  socketUrl.protocol = "ws:";
  socketUrl.searchParams.set("serverEpochUuid", version.serverEpochUuid);
  const { cookies } = await request.storageState();
  const socket = new WebSocket(socketUrl, {
    headers: { cookie: cookies.map(({ name, value }) => `${name}=${value}`).join("; ") },
  });
  const senderId = `boundary-${randomUUID()}`;
  const malicious = from({ description: "unauthorized raw transport edit" });
  const receivedTypes: string[] = [];
  try {
    const closed = await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Unauthorized operation was not rejected")),
        10000
      );
      socket.on("open", () =>
        socket.send(
          cbor.encode({
            type: "join",
            senderId,
            peerMetadata: {},
            supportedProtocolVersions: ["1"],
          })
        )
      );
      socket.on("error", reject);
      socket.on("message", (bytes) => {
        const message = cbor.decode(new Uint8Array(bytes as Buffer)) as {
          type: string;
          senderId: string;
        };
        receivedTypes.push(message.type);
        if (message.type === "peer") {
          socket.send(
            cbor.encode({
              type: write ? "sync" : "request",
              senderId,
              targetId: message.senderId,
              documentId: docUrl.slice("automerge:".length),
              data: encodeSyncMessage({
                heads: write ? getHeads(malicious) : [],
                need: [],
                have: [],
                changes: write ? getAllChanges(malicious) : [],
              }),
            })
          );
        }
      });
      socket.on("close", (code) => {
        clearTimeout(timeout);
        resolve(code);
      });
    });
    expect(closed).toBe(1008);
    expect(receivedTypes).toEqual(["peer"]);
  } finally {
    socket.terminate();
  }
}

export async function expectAutomergeUpgradeDenied(
  request: APIRequestContext,
  baseURL: string
): Promise<void> {
  // Capture the original signed session before the version request refreshes persisted identity.
  const { cookies } = await request.storageState();
  const version: AppVersion = await (await request.get("/api/v1/version")).json();
  const url = new URL("/api/automergeSocket/", baseURL);
  url.protocol = "ws:";
  url.searchParams.set("serverEpochUuid", version.serverEpochUuid);
  const socket = new WebSocket(url, {
    headers: { cookie: cookies.map(({ name, value }) => `${name}=${value}`).join("; ") },
  });
  try {
    const status = await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Unauthenticated upgrade was not rejected")),
        10000
      );
      socket.once("unexpected-response", (_request, response) => {
        clearTimeout(timeout);
        response.resume();
        resolve(response.statusCode);
      });
      socket.once("open", () => {
        clearTimeout(timeout);
        reject(new Error("Unauthenticated upgrade succeeded"));
      });
      socket.once("error", reject);
    });
    expect(status).toBe(401);
  } finally {
    socket.terminate();
  }
}
