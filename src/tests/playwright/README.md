# AEGIS browser behavior contracts

The `behavior/` suite describes observable application behavior across states and
transitions. It runs the actual React application, API, PostgreSQL persistence,
and Automerge synchronization. Each test owns a small mission; it does not depend
on imported missions 22 or 47 or an execution happening to be running.

## Run

Use a local development database and the normal application environment. The
configuration starts the application if it is not already running. Database
schema and migrations must already be current, as for normal local development.

```sh
npm run test:playwright:behavior
npm run test:playwright:smoke
```

The first command runs the behavioral contracts in Chromium. The second runs the
small functional smoke set in Chromium, Firefox, and WebKit. Browser binaries must
be installed (`npx playwright install`). For a focused capability:

```sh
npm run test:playwright -- behavior/execution.spec.ts --project=chromium
npm run test:playwright -- behavior/mapEditing.spec.ts --project=chromium
npm run test:playwright -- behavior/planning.spec.ts --project=chromium
npm run test:playwright -- behavior/collaboration.spec.ts --project=chromium
```

The existing `test:playwright` and CI sharding commands also discover these tests.
Legacy mission/configuration and map smoke tests remain available. Playwright
does not become a dependency of container image builds or production deployment.

## Coverage by capability

| Capability                         | Contract examples                                                                                                                                                    | Specification                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Application entry and navigation   | Known mission identity, complete seeded domain relationships, no-execution dashboard, active dashboard and minimap                                                   | `behavior/smoke.spec.ts`         |
| Execution time ownership           | Selected stopped execution, another active execution, A/B/A switching, planned scope, frozen paused clock, ticking clock, zero and hour boundaries                   | `behavior/execution.spec.ts`     |
| Execution controls                 | Start/pause/resume/stop, interlock against simultaneous execution, manual PET validation/cancel, reset confirmation and persistence, dashboard synchronization       | `behavior/execution.spec.ts`     |
| Planning and entity lifecycle      | Name and numeric validation, save/cancel, create/duplicate/delete, shared station protection, independent execution copies, deletion cascades, actual export content | `behavior/planning.spec.ts`      |
| Map representation and preferences | Exact label values, label visibility and changed pixels, selected hidden POI exception, marker click selection, local preference persistence                         | `behavior/mapEditing.spec.ts`    |
| Geometry edits                     | Interior vertex drag, finish/cancel distinction, endpoint pinning, straight-path reset, editing interaction removal on navigation, persisted paths                   | `behavior/mapEditing.spec.ts`    |
| Dashboard/minimap consistency      | Shared scale-bar toggles and persistence, minimap limited to the active execution                                                                                    | `behavior/dashboardMap.spec.ts`  |
| Collaboration                      | Two real browser contexts, live changes, independent local selection, concurrent unrelated edits, canceled edits, creation/deletion, late joining                    | `behavior/collaboration.spec.ts` |

## Fixtures and isolation

Import `test` and `expect` from `fixtures/behavioralTest.ts`. The `mission` fixture:

1. Creates a blank mission through the authenticated application API.
2. Seeds explicit entities through the real Automerge WebSocket with the current
   server epoch, then waits for an authoritative server read to match.
3. Supplies `mission.open(page)`, stable IDs, and `mission.read()` for independent
   persistence assertions.
4. Deletes exactly that mission, including after a test failure.

`mission.change()` is for arranging a scenario, not performing the action being
tested. Use real UI input for that action. `test.use({ scenario: "execution" })`
adds a stopped Alpha execution and an active, paused Bravo execution with
deliberately different times and positions. Defaults are obtained from the
server-created blank mission; the small entity fixtures are explicitly defined
in `fixtures/entitySeeds.ts` and `fixtures/missionSeed.ts`.

The fixture refuses non-local server URLs. Authentication creates a distinct test
account per run and deletes only that account. Failure reports include the
isolated mission state, screenshots, and retry traces. Do not run these tests
against production or point the local server at a production database.

## Meaningful expectations

Assertions should specify expected user outcomes with independently known values.
For example, stopped PET `+02:10:05` minus a position recorded at `+01:55:05` must
display age `+00:15:00`, even while another execution is running at `+00:05:00`.
Do not call the application's age calculator to derive the expected age.

DOM assertions check visible controls and values. Canvas assertions use a
development-only `aegis:map-ready` event to observe the real OpenLayers sources;
the observer neither changes features nor calculates replacement label values.
Label toggle tests additionally compare screenshots from the same browser run.
Source assertions establish the data supplied to rendering; they do not establish
pixel-perfect text appearance, clipping, or contrast. There are no automatically
accepted screenshot baselines.

Time-travel scenarios fix the browser's Date before navigation while leaving
native timers and animation frames running, so sockets and rendering continue.
They neutralize AEGIS's server-time offset updates only within those scenarios;
they do not test server clock-skew correction. Advancing the fixed Date avoids
real minutes of waiting. Frozen-clock assertions also observe elapsed native
time spanning multiple clock ticks before checking that the value stayed fixed.

## Extending the specification

- Name the capability, relevant state/transition, and expected outcome first.
- Create its required data explicitly. Missing prerequisites should fail setup;
  never skip an assertion or action because imported data is absent.
- Exercise meaningful state combinations: planned/executing/historical,
  selected/unselected, editable/read-only, local/another client, and reload.
- Prefer a bounded scenario with one clear contract over a giant chained tour.
- Use retrying assertions against observable state instead of fixed sleeps.
- Check persistence and relationships, not just success messages or a visible
  canvas. Use a second client when synchronization is part of the contract.
- When a defect is found, broaden its capability's state matrix and retain the
  reproducer as an example. Keep fast unit/component tests when they provide
  useful diagnosis; browser tests establish that the pieces work together.
- Demonstrate detection: the test must fail when its target behavior is broken.
  For the historical POS-age case, removing the selected REX from
  `MarkerLabels`'s `useRexPetTime` call should fail the stopped-execution
  scenario even if the hook's unit tests still pass.

Keep the coverage table current when adding a new capability. Test counts and
line coverage alone do not establish functional completeness. Further coverage
can grow toward reconnect/clock-skew scenarios, permissions with distinct users,
GIS asset variants, and generated valid action sequences; those require their
own explicit expected outcomes and fixtures.
