# Mission browser workflows

These tests mount the real mission and dashboard pages. React, routing, Redux,
Automerge documents, hydration/audits, thunks, selectors, forms, Dockview and
OpenLayers run together. Only REST responses and the SocketClient transport are
replaced. No API server, database, user creation or WebSocket synchronization is
needed.

```sh
npm run test:vitest:browser:behavior
npm run test:vitest:browser -- planning.browser.test.tsx
```

The workflows also run in `npm run test:vitest:browser`, `npm run test:all` and
browser coverage collection. Install browsers with `npx playwright install`.
Chromium runs every workflow. Firefox and WebKit also run the action, accessibility,
map-editing and celestial-control parity workflows. Responsive accessibility
checks run at device pixel ratio 2 in each browser.
`npm run test:vitest:browser:parity` runs the Firefox/WebKit projects separately.
V8 coverage requires Chromium's CDP, so `test:coverage:browser` selects the two
Chromium projects; CI runs parity first and then collects Chromium coverage.

## Fixture

Import `test` and `expect` from `missionHarness`. The `page` fixture is the native
Vitest browser page. Use `expect.element` for DOM assertions and `expect.poll`
for document changes and element counts. `getBySelector` is a Vitest locator
extension for CSS/XPath selectors; interactions still use the real browser.

Each test gets a fresh network-free Automerge Repo and the same small mission
seed used by Playwright. `mission.change` arranges data; exercise the behavior
under test through the UI. `mission.read` returns an independent document
snapshot. `mission.open()` unmounts the page, resets every Redux slice and mounts
the page again against the same document. It preserves cookies and local storage
within the test, as a reload would. Between tests, cookies, local/session storage,
document handles, terrain subscriptions, map observation, Date overrides, dialog
spies, loaded grids and HTTP stubs are cleaned up. `mission.openDashboard()` uses
the same fixture to mount the real dashboard and minimap.

The harness serves a mission schema generated from current source types using
the production schema command's options. Validation and hydration audits remain
real, and a prior build is unnecessary. Terrain responses describe an explicit
flat surface. Use Playwright's raster tests for actual elevation sampling.
Unexpected HTTP requests, alerts and confirmations fail the scenario; declare
each expected native dialog with `vi.spyOn(window, "confirm")` or `"alert"`.
Clock tests change Date with `vi.setSystemTime` and leave timers/animation frames
running so rendering and subscription behavior stay real.

Use the `requestHandlers` fixture option to supply independent responses at
specific HTTP paths. Unhandled paths still fail. `mission.captureDownload(action)`
runs a real export control and returns its generated Blob and filename; it
intercepts the final download link, verifies exactly one download, and removes
the temporary URL and anchor. Check export contents here, and retain a small
Playwright layer for actual browser/filesystem download delivery.

Map tests use provider commands for real pointer gestures. The command translates
iframe coordinates, including Vitest's iframe scaling, into browser coordinates;
it does not dispatch synthetic OpenLayers events.

## Coverage boundaries

Prefer this fixture for single-client validation, Save/Cancel, CRUD, graph
ownership, calculations, report aggregation, execution clocks/policy, navigation
within the mission, and real map rendering. Keep independent expected values and
all document/relationship assertions when moving a test.

Keep real authentication/authorization, REST contracts, database persistence,
restart/recovery, socket protocols, downloads, and multiple simultaneous UI
clients in Playwright. Remounting verifies UI rehydration from the in-memory
document; it does not verify server persistence. `planning.spec.ts` retains the
server-backed rename/reload and JSON download anchors. The retained execution
specifications exercise dashboard synchronization and concurrent clients.
Action and map-editing browser parity now lives here. The remaining Playwright
parity covers smoke, actual keyboard downloads, raster/tile assets, presence,
crew sources, celestial peer edits and rule-transfer delivery.

The [migration record](../../../../docs/testing/browser-behavior-migration-2026-11-05.md)
contains the moved specifications, discovery counts and measured runtimes.
The [expansion record](../../../../docs/testing/browser-behavior-expansion-2026-11-06.md)
records the larger second pass and retained integration boundaries.
