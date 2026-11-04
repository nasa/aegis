# Notification Banners

Admin-managed messages shown at the top of every AEGIS page except the dashboard
(`/dashboard/:id`), which never shows banners for any scope. Super admins create them at
`/admin/notificationBanners`.

## Data

- Table `notification_banner_db`, model `Notification_Banner_db` (`notification_banner.model.ts`).
- Columns: `message` (≤ 500 chars, plain text), `enabled` (manual on/off), `starts_at` /
  `ends_at` (UTC, nullable = no limit), `scope` (`"application"` | `"missions"`), `mission_ids`
  (`integer[]`, empty for application scope), `background_color` (`#RRGGBB`, stored uppercase),
  `text_color` (`"white"` | `"black"`), audit columns, optimistic-lock `version`.
- Allowed values are enforced by `validateBannerInput` in the route, not by DB check constraints.
- `mission_ids` has no foreign key. A deleted mission's id stays in the array, never matches a
  page, and is dropped by the admin editor on the next save.
- Types (ambient): `NotificationBanner`, `NotificationBannerInput`, `ActiveNotificationBanner`,
  `NotificationBannerFormValues` in `typings/network/clientTypes.d.ts`;
  `ValidatedNotificationBannerInput` / `NotificationBannerValidationResult` in
  `typings/network/internalApi.d.ts`.

## Active rule

`isBannerActive`: `enabled && (startsAt == null || startsAt <= now) && (endsAt == null || now < endsAt)`.
The end time is exclusive. The server evaluates this with server time; clients never filter.

A page gets every active application banner, plus active mission banners whose `missionIds`
contains the page's mission id. Mission pages are `/mission/:id` only (`getMissionIdFromPath`).
The dashboard is hidden on the client (`isBannerHiddenOnPath`): the bar still fetches there (with
no mission id) and listens for `bannersChanged`, but renders nothing. Results are newest first (id descending).

## REST — `/api/v1/notificationBanner`

| Method | Path                  | Auth                         | Purpose                                   |
| ------ | --------------------- | ---------------------------- | ----------------------------------------- |
| GET    | `/active?missionId=N` | none beyond nginx            | `ActiveNotificationBanner[]` for one page |
| GET    | `/`                   | super admin or `EMSS_TOKEN`  | all banners for the admin page            |
| POST   | `/`                   | super admin or `EMSS_TOKEN`  | create                                    |
| POST   | `/:id`                | super admin or `EMSS_TOKEN`  | replace editable fields                   |
| DELETE | `/:id`                | super admin or `EMSS_TOKEN`  | delete                                    |

Updates use `POST /:id` (not PUT) because `serverLogger.apiRoute` only accepts GET/POST/DELETE.
Selected missions must exist in `doc_listing_db`.

## Live updates

- The socket carries only a signal: `bannersChanged` (no payload) on the **default** Socket.IO
  namespace, sent with `globalValues.socketio.emit(...)` to every connected socket. Clients then
  refetch `/active` over REST, which keeps banner text off the unauthenticated socket path.
- Sent after every create, update, and delete (`notifyBannerClients`).
- Time windows: `rescheduleBannerTimer` keeps one timer (`globalValues.notificationBannerTimer`)
  for the next start/end boundary among enabled banners and sends `bannersChanged` when it fires.
  Waits are capped at 24 hours (setTimeout limit) and re-armed. The timer is armed at boot after
  `setupSocketIO()`, re-armed on every change, `unref()`'d, and cleared on shutdown.

## Client

- `NotificationBannerBar` is mounted once in `App.tsx`, above `<Routes>`, inside an app shell
  (`appShell` / `appContent` classes in `notificationBannerBar.module.css`). The routed page fills
  the remaining height, so full-height pages use `height: 100%`, not `100vh`.
- It opens its own default-namespace socket with `createClientSocket` and never sends
  `visitorJoin`, so it is not counted as a visitor. Mission and dashboard pages therefore hold two
  `/api/socket` connections per tab (this one and `SocketClient`'s).
- Refetches on mission id change, `bannersChanged`, and manager `reconnect`. Responses for older
  requests are dropped.
- Dismissal: component state holds `id:updatedAt` keys. It lasts across in-app navigation and is
  cleared by a page refresh. Editing a banner changes `updatedAt`, so it shows again.
- `endsAt`, when set, is shown as "Until <time>" in the viewer's local time zone
  (`formatBannerTime`).

## Admin page

`pages/admin/notificationBanners.tsx`: banner cards (preview, status Active / Scheduled /
Expired / Disabled, scope, times in local and UTC, Edit / Enable-Disable / Delete) and an editor.
Times are entered with `datetime-local` in the admin's local time and sent as UTC ISO strings.
Preset colors (`PRESET_BANNER_COLORS`): green `#15803D`, blue `#1D4ED8`, red `#B91C1C`, orange
`#C2410C`, yellow `#FACC15` (black text); any other `#RRGGBB` is allowed.

## Tests

- `tests/vitest/express/notificationBanner.test.ts` — pure helpers, validation, routes.
- `tests/vitest-browser/NotificationBannerBar.browser.test.tsx` — rendering, socket refetch,
  mission id from URL, dismissal.
