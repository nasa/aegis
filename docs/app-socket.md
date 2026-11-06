# Shared app socket (default Socket.IO namespace)

Each AEGIS browser tab opens exactly one Socket.IO connection to the default namespace (`/`) on
path `/api/socket`. It is shared by every page and stays open across in-app navigation.

## Client

- `getClientSocket()` (`utils/clientSocketHelpers.ts`) lazily creates the socket with
  `createClientSocket(window.location.origin)` and returns the same instance afterward. Nothing
  disconnects it; the tab closing does.
- Every consumer attaches named handlers and removes only those handlers on unmount. Never call
  `socket.off(event)` without a handler, `removeAllListeners()`, or `disconnect()` on this socket.
- Consumers:
  - `SocketClient` (`components/page/socketClient.tsx`), mounted once in `App.tsx`. Calls
    `attachSocketListeners`, which handles connection status, `version` (redirects to
    `/versionCheck` on mismatch, except when already on that page), `statusFromServer`, and the
    visitor messages below.
  - `NotificationBannerBar`: `bannersChanged` and manager `reconnect`.
  - Admin pages `serverSocketStatus`, `maestroV2`, `dustV1`: call `joinInspectorRoom`, which sends
    `inspectorJoin` now (if connected) and on every reconnect, and sends `inspectorLeave` on
    cleanup. It reports `reconnecting` on manager `reconnect_attempt` and `failed` only on
    `reconnect_failed`, matching the app-wide connection status.
- `attachSocketListeners` and `joinInspectorRoom` run their connect handler immediately when the
  socket is already connected, since a shared socket may connect before a page mounts.

## Visitor messages

| Event               | Payload           | Server effect                                                 |
| ------------------- | ----------------- | ------------------------------------------------------------- |
| `visitorJoin`       | `VisitorJoinData` | Adds or updates the visitor's identity. Does not join a room. |
| `visitorPageChange` | `VisitorPageData` | Records the page; moves the socket between mission rooms.     |
| `inspectorJoin`     | —                 | Joins the `inspector` room.                                   |
| `inspectorLeave`    | —                 | Leaves the `inspector` room.                                  |

- On every `connect` (including reconnects) the client sends `visitorJoin` and then
  `visitorPageChange`, because the server drops the visitor and its rooms on disconnect.
- While connected, `SocketClient` sends `visitorJoin` again when `user.appUser` or
  `user.launchpadUser` changes, and `visitorPageChange` when the page data changes. Nothing is
  emitted while disconnected, so no stale messages are queued for replay.
- `getVisitorPageData(pathname, missionPerms)` builds the page data. `page` is one of `home`,
  `mission`, `dashboard`, `admin`, `versionCheck`, `other`. `missionId` and `permission` are set
  only on `/mission/:id` and `/dashboard/:id`, and only once `missionPerms.missionId` matches the
  route's mission, so a visitor is never counted with another mission's permission.
- The server re-sends a `visitorJoin` without resetting page, mission, or `connectedAt`.

## Server (`server/express/sockets.ts`)

- `visitorsData` holds one `VisitorData` per connected tab, including tabs not on a mission
  (`missionId: null`). Mission editor/viewer counts and the 10 s `statusFromServer` heartbeat
  consider only entries with a `missionId`. The mission catalog keeps a mission document loaded
  while any entry has that `missionId`.
- `visitorJoin` and `visitorPageChange` payloads are not validated. Each handler, `disconnect`, and
  the heartbeat interval catch errors and log them through `serverLogger`, so a malformed payload
  cannot crash the server; a missing `missionId` is treated as no mission. Page changes that
  arrive before `visitorJoin` are logged and ignored. A socket is in at most one mission room: on
  a mission change it leaves the old room and both rooms get a fresh `statusFromServer`.
- `disconnect` removes the visitor and, if it was on a mission, updates that room's counts.
- Every visitor change emits `inspectorUpdate` to the `inspector` room. The admin socket status
  page groups visitors by mission (editors / viewers) plus a "Not on a mission" group, and shows
  each visitor's page.

## Tests

- `tests/vitest/utils/clientSocketHelpers.test.ts` — `getVisitorPageData`, connect/reconnect
  messages, handler cleanup, `joinInspectorRoom`.
- `tests/vitest/express/sockets.test.ts` — server visitor handlers, room moves, malformed payloads.
