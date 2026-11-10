# Notification Banners

Admin-managed messages shown at the top of every AEGIS page except the dashboard
(`/dashboard/:id`), which never shows banners for any scope. Super admins create them at
`/admin/notificationBanners`.

## Data

- Table `notification_banner_db`, model `Notification_Banner_db` (`notification_banner.model.ts`).
- Columns: `message` (≤ 500 chars, plain text), `enabled` (manual on/off), `starts_at` /
  `ends_at` (UTC, nullable = no limit), `scope` (`"application"` | `"missions"`), `mission_ids`
  (`integer[]`, empty for application scope), `background_color` (`#RRGGBB`, stored uppercase),
  `text_color` (`#RRGGBB`, stored uppercase; the admin page only offers white `#FFFFFF` and black `#000000`), audit columns, optimistic-lock `version`.
- Allowed values are enforced by `validateBannerInput` in the route, not by DB check constraints.
- `mission_ids` has no foreign key, and the server does not check that the missions exist; the
  admin editor only offers existing missions. A deleted mission's id stays in the array and never
  matches a page (mission ids are autoincrement and not reused). The banner still shows on its
  other missions. The admin card lists it as "(deleted mission N)", and the editor drops it on the
  next save.
- Types (ambient): `NotificationBanner`,
  `NotificationBannerFormValues` in `typings/network/clientTypes.d.ts`. Create and update requests
  send a `NotificationBanner` with the server-set fields (`id`, `createdBy`, `updatedBy`,
  `createdAt`, `updatedAt`) set to null; the server ignores them. `scope` is plain `text` in the
  model and is cast to `"application" | "missions"` when serialized;
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

| Method | Path                  | Auth                        | Purpose                             |
| ------ | --------------------- | --------------------------- | ----------------------------------- |
| GET    | `/active?missionId=N` | none beyond nginx           | `NotificationBanner[]` for one page |
| GET    | `/`                   | super admin or `EMSS_TOKEN` | all banners for the admin page      |
| POST   | `/`                   | super admin or `EMSS_TOKEN` | create                              |
| POST   | `/:id`                | super admin or `EMSS_TOKEN` | replace editable fields             |
| DELETE | `/:id`                | super admin or `EMSS_TOKEN` | delete                              |

Updates use `POST /:id` (not PUT) because `serverLogger.apiRoute` only accepts GET/POST/DELETE.

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
- It listens on the tab's shared default-namespace socket (`getClientSocket`, see
  `docs/app-socket.md`). It adds and removes only its own handlers and never disconnects the socket.
- Refetches on mission id change, `bannersChanged`, and manager `reconnect`. Responses for older
  requests are dropped. It does not fetch on the dashboard, and fetches again when the route leaves
  the dashboard.
- Dismissal: component state holds `id:updatedAt` keys. It lasts across in-app navigation and is
  cleared by a page refresh. Editing a banner changes `updatedAt`, so it shows again.
- Each banner shows only its message and a dismiss button. `startsAt` / `endsAt` control when a
  banner is active but are not displayed to viewers; the admin page shows them.

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
