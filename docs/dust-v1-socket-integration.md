# HOW TO CONNECT TO THE AEGIS DUST SOCKET

================================================

This document explains how the DUST server connects to AEGIS over Socket.IO to
receive real-time crew position (POS) updates during a running EVA. It assumes
no prior knowledge of AEGIS internals.

Unlike the old REST login flow (username/password → session cookie), the DUST
socket connection authenticates with a single static token on every connection
attempt. There is no login step and no cookie.

## STEP 1 - Connect to the socket with your DUST token

---

AEGIS runs a single Socket.IO server for all its real-time traffic, mounted at
the HTTP path `/api/socket`. Different integrations (the AEGIS web client,
Maestro, DUST) each get their own "namespace" on that same server so their
events don't collide. DUST's namespace is `/dust/v1`.

Connect using the `socket.io-client` library (or an equivalent Socket.IO
client in another language), pointing at the AEGIS host, namespace `/dust/v1`,
path `/api/socket`, and pass your DUST token in the `auth` payload:

```js
import { io } from "socket.io-client";

const socket = io("https://aegis-int.fit.nasa.gov/dust/v1", {
  transports: ["websocket"],
  path: "/api/socket",
  auth: { token: "<your DUST token>" },
});
```

Key points:

- **Transport must be `websocket`** — AEGIS does not support the HTTP
  long-polling transport.
- **`path` must be `/api/socket`** — this is the Socket.IO path, not the
  namespace. The namespace (`/dust/v1`) is part of the URL/first argument to
  `io(...)`.
- **The token goes in `auth.token`**, not in a header or query string. AEGIS
  validates it server-side in a Socket.IO namespace middleware before the
  `connection` event fires. If the token is missing or wrong, the socket is
  rejected with error `"Unauthorized"` and never connects — listen for the
  client's `connect_error` event to catch this.
- Get your DUST token from your AEGIS point of contact. It's a shared secret
  configured once per AEGIS environment (dev/int/prod each have their own
  value) and does not expire or rotate per-session.

There is no separate "login" call and no session cookie to capture. The token
is presented fresh on every socket connection.

## STEP 2 - Join a mission

---

Once connected, tell AEGIS which mission you want updates for by emitting
`missionJoin`. This also registers your DUST server as a "visitor" for that
mission (shown on AEGIS's internal admin monitor) and causes AEGIS to start
listening for changes on that mission's data.

```js
socket.emit(
  "missionJoin",
  missionId, // number — the AEGIS mission ID
  {
    socketId: socket.id, // your own socket's id
    name: "My DUST Server", // any display name for this connection
    connectedAt: Date.now(), // ms since epoch
  },
  (response) => {
    // response is { status: "success", message: "..." }
    // or          { status: "error",   message: "..." }
    console.log(response.status, response.message);
  }
);
```

Notes:

- `missionId` must be a valid number. An invalid/missing id returns
  `{ status: "error", message: "Invalid missionId <value>" }` via the
  callback and nothing else happens.
- `missionJoin` can be called multiple times on the same socket for different
  missions — each call joins an additional mission room. There is currently no
  `missionLeave` event; disconnecting the socket removes it from every
  mission it joined.
- After a successful join, AEGIS attaches (or reuses) a listener on that
  mission's underlying document so it can detect position changes. You do not
  need to do anything else to activate updates — see Step 3.

## STEP 3 - Receive posEntriesUpdate events

---

AEGIS pushes crew position updates to you — you do not poll for them. Listen
for the `posEntriesUpdate` event:

```js
socket.on("posEntriesUpdate", (payload) => {
  console.log(payload);
});
```

When it fires:

- Whenever a **running** EVA execution ("REX") in a mission you've joined has
  a crew position added, edited, or deleted.
- Only for missions your socket has joined via `missionJoin`.
- Crew positions only exist while an EVA execution is actively running — no
  events fire for as-planned (not-yet-executed) EVAs.

Payload shape:

```ts
{
  missionId: number;
  missionName: string;
  rexUuid: string;      // id of the running EVA execution
  rexName: string;
  evaUuid: string;
  evaName: string;
  posEntries: [
    {
      uuid: string;
      latlng: { lat: number | null; lng: number | null; alt?: number };
      petSeconds: number;      // elapsed mission/EVA time, in seconds
      posTypes: string[];      // e.g. ["EV1"] — plain-text, already resolved
      posSource: string;       // plain-text, already resolved
      createdAt: number;       // ms since epoch
      updatedAt: number;       // ms since epoch
    },
    // ...
  ];
}
```

Important behavior:

- `posEntries` is always the **full current list** of crew positions for that
  REX at the time of the event — not just the one entry that changed. Replace
  your local copy for that `rexUuid` wholesale rather than trying to apply a
  delta.
- Updates are throttled server-side to at most one emission per mission every
  500 ms (leading + trailing), so rapid successive edits are coalesced.
- `posTypes` and `posSource` arrive as human-readable names (e.g. `"EV1"`),
  already resolved from internal AEGIS ids — you don't need a separate lookup
  call.

## ADDITIONAL NOTES

---

- **No REST calls are involved in this flow** — everything above happens over
  the single Socket.IO connection.
- **Disconnecting**: call `socket.disconnect()` client-side when done. The
  server automatically removes you from all mission rooms and, once the last
  DUST visitor for a mission disconnects, tears down that mission's internal
  listener.
- **Debug info**: emit `getDebugInfo` with a callback to get a snapshot of all
  current DUST visitors per mission and which missions currently have active
  listeners — useful for confirming your connection/join succeeded:
  ```js
  socket.emit("getDebugInfo", (data) => console.log(data));
  ```
