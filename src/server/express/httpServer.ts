import type { RequestListener, Server as HttpServer } from "http";
import { createServer } from "http";
import type { DefaultEventsMap } from "socket.io";
import { Server as SocketServer } from "socket.io";

// Express must be passed to createServer before Socket.IO attaches: Socket.IO only forwards
// non-/api/socket requests to listeners that exist at attach time. See docs/app-socket.md.
export const createHttpServerWithSocketIo = (
  requestHandler: RequestListener
): { server: HttpServer; socketio: GlobalValues["socketio"] } => {
  const server = createServer(requestHandler);
  const socketio = new SocketServer<
    ClientToServerEvents,
    ServerToClientEvents,
    DefaultEventsMap,
    {}
  >(server, {
    transports: ["websocket"],
    path: "/api/socket",
    addTrailingSlash: false,
    // Reduce ping interval and timeout from Socket.IO defaults
    // to detect dead connections within ~10s
    pingInterval: 5000,
    pingTimeout: 5000,
  });
  return { server, socketio };
};
