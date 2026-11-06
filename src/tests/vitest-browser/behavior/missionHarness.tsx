import { test as base, expect, vi } from "vitest";
import { page, locators } from "vitest/browser";
import { Repo } from "@automerge/automerge-repo";
import { RepoContext } from "@automerge/automerge-repo-react-hooks";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router";
import { CookiesProvider } from "react-cookie";
import MissionPage from "pages/mission";
import store, { initialState, sliceReducers } from "store";
import { setMissionAutomergeDocHandle } from "client/automergeDocHandles";
import { stopMissionTerrainProfiles } from "store/thunk/thunkTerrainProfile";
import { generateBlankMission } from "store/storeUtils/mission";
import { buildBehavioralMission, MISSION_IDS } from "tests/playwright/fixtures/missionSeed";
import { createReactHarness } from "../map/helpers/reactBrowserHarness";
import missionSchema from "virtual:aegis-mission-schema";
import { observeMissionMaps } from "./mapObserver";
import "styles/globals.css";

// Socket transport and REST are the boundary; hydration, selectors and mutations stay real.
vi.mock("components/page/socketClient", () => ({ default: (): null => null }));

locators.extend({
  getBySelector(selector: string) {
    return selector;
  },
});

export { expect } from "vitest";

export const test = base.extend<BrowserMissionFixtures>({
  page: async ({}, runFixture) => runFixture(page),
  scenario: "planning",
  mission: async ({ scenario }, runFixture) => {
    const repo = new Repo({ network: [] });
    const seed = buildBehavioralMission(
      1,
      "Browser behavior mission",
      scenario,
      generateBlankMission()
    );
    const handle = repo.create<Mission>(seed);
    const stopObservingMaps = observeMissionMaps();
    let harness: ReturnType<typeof createReactHarness> | undefined;
    const unexpectedRequests: string[] = [];
    const unexpectedDialogs: string[] = [];
    const version: AppVersion = {
      version: __APP_VERSION__,
      gitCommit: __GIT_COMMIT__,
      serverEpochUuid: "browser-test-epoch",
    };

    vi.spyOn(window, "alert").mockImplementation((message) => {
      unexpectedDialogs.push(`alert: ${message}`);
    });
    vi.spyOn(window, "confirm").mockImplementation((message) => {
      unexpectedDialogs.push(`confirm: ${message}`);
      return false;
    });

    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
      const success = (data: unknown) => Response.json({ status: "success", data });
      switch (url.pathname) {
        case "/api/v1/auth/isLoggedIn":
          return success({ id: 1, username: "Browser editor", isSuperAdmin: true });
        case "/api/v1/all":
          return success({ mission: handle.doc() });
        case "/api/v1/docListing":
          return success([{ missionId: 1, automergeUrl: handle.url }]);
        case "/api/v1/mission/schema":
          return success(missionSchema);
        case "/api/v1/terrain-profile":
        case "/api/v1/terrain-profile/batch": {
          const body = JSON.parse(String(init?.body));
          const profile = (request: TerrainProfilePostData) => ({
            status: "success",
            data: {
              elevationsMeters: request.pathSegmentDistances.map(() => [0, 0]),
              terrainSlopesDegrees: request.pathSegmentDistances.map(() => [0, 0]),
            },
          });
          return url.pathname.endsWith("/batch")
            ? success(body.profiles.map(profile))
            : Response.json(profile(body));
        }
        default:
          unexpectedRequests.push(`${init?.method ?? "GET"} ${url.pathname}`);
          throw new Error(`Unstubbed mission request: ${url.pathname}`);
      }
    });

    const unmount = () => {
      harness?.unmount();
      harness = undefined;
      stopMissionTerrainProfiles();
      setMissionAutomergeDocHandle(null);
    };
    const resetStore = () => {
      const state = structuredClone(initialState);
      state.connection.clientAppVersion = version;
      state.connection.automergeConnectionStatus = "connected";
      state.connection.socketStatus.connectionStatus = "connected";
      state.connection.socketStatus.lastStatusFromServer.serverVersion = version;
      // Replace the reducer briefly to reset every slice, including slices without hydration actions.
      store.replaceReducer(() => state);
      store.replaceReducer(sliceReducers);
    };

    try {
      await page.viewport(1960, 1080);
      localStorage.clear();
      sessionStorage.clear();
      await runFixture({
        id: 1,
        name: seed.name,
        ids: MISSION_IDS,
        read: async () => JSON.parse(JSON.stringify(handle.doc())) as Mission,
        change: async (mutator) => handle.change(mutator),
        open: async () => {
          unmount();
          resetStore();
          harness = createReactHarness();
          harness.container.id = "root";
          harness.render(
            <Provider store={store}>
              <RepoContext.Provider value={repo}>
                <CookiesProvider>
                  <MemoryRouter initialEntries={["/mission/1"]}>
                    <Routes>
                      <Route path="/mission/:id" element={<MissionPage />} />
                    </Routes>
                  </MemoryRouter>
                </CookiesProvider>
              </RepoContext.Provider>
            </Provider>
          );
          await expect
            .element(page.getByLabelText("missionNameHeader", { exact: true }))
            .toHaveTextContent(handle.doc().name);
          await expect.poll(() => page.getBySelector(".ol-viewport").length).toBe(1);
          await expect
            .element(page.getByLabelText("globalEditToggle", { exact: true }))
            .toBeEnabled();
        },
      });
    } finally {
      unmount();
      stopObservingMaps();
      await repo.shutdown();
      resetStore();
      vi.unstubAllGlobals();
      vi.useRealTimers();
      vi.restoreAllMocks();
      expect(unexpectedRequests, "Every mission request must have an explicit fixture").toEqual([]);
      expect(unexpectedDialogs, "Every native dialog must be handled by the scenario").toEqual([]);
    }
  },
});
