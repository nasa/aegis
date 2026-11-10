import { test as base, expect, vi } from "vitest";
import { page, locators } from "vitest/browser";
import { Repo } from "@automerge/automerge-repo";
import { RepoContext } from "@automerge/automerge-repo-react-hooks";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { CookiesProvider } from "react-cookie";
import MissionPage from "pages/mission";
import DashboardPage from "pages/dashboard";
import HomePage from "pages/index";
import VersionCheck from "pages/versionCheck";
import ExportPage from "pages/admin/export";
import MissionSTMPage from "pages/admin/missionSTM";
import NotificationBannersPage from "pages/admin/notificationBanners";
import store, { initialState, sliceReducers } from "store";
import { setMissionAutomergeDocHandle } from "client/automergeDocHandles";
import { stopMissionTerrainProfiles } from "store/thunk/thunkTerrainProfile";
import { generateBlankMission } from "store/storeUtils/mission";
import { buildBehavioralMission, MISSION_IDS } from "tests/playwright/fixtures/missionSeed";
import { createReactHarness } from "../map/helpers/reactBrowserHarness";
import missionSchema from "virtual:aegis-mission-schema";
import { observeMissionMaps } from "./mapObserver";
import { clearLoadedGrid } from "utils/mapping/grid";
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
  requestHandlers: async ({}, runFixture) => runFixture({}),
  mission: async ({ scenario, requestHandlers }, runFixture) => {
    const repo = new Repo({ network: [] });
    const seed = buildBehavioralMission(
      1,
      "Browser behavior mission",
      scenario,
      generateBlankMission()
    );
    const handle = repo.create<Mission>(seed);
    const handles = new Map([[1, handle]]);
    const stopObservingMaps = observeMissionMaps();
    let harness: ReturnType<typeof createReactHarness> | undefined;
    let navigate: ReturnType<typeof useNavigate>;
    function RouteObserver(): null {
      navigate = useNavigate();
      return null;
    }
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
      const handler = requestHandlers[url.pathname];
      if (handler) return handler(url, init ?? {});
      const success = (data: unknown) => Response.json({ status: "success", data });
      switch (url.pathname) {
        case "/api/v1/auth/isLoggedIn":
          return success({ id: 1, username: "Browser editor", isSuperAdmin: true });
        case "/api/v1/all":
          return success({
            mission: handles.get(Number(url.searchParams.get("missionId") ?? 1))?.doc(),
          });
        case "/api/v1/docListing":
          return success(
            [...handles]
              .filter(
                ([id]) =>
                  !url.searchParams.has("missionId") ||
                  id === Number(url.searchParams.get("missionId"))
              )
              .map(([missionId, doc]) => ({ missionId, automergeUrl: doc.url }))
          );
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
      clearLoadedGrid();
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

    const open = async (
      route: "mission" | "dashboard",
      id = 1,
      options?: { path?: string; waitForReady?: boolean }
    ) => {
      unmount();
      resetStore();
      harness = createReactHarness();
      harness.container.id = "root";
      harness.render(
        <Provider store={store}>
          <RepoContext.Provider value={repo}>
            <CookiesProvider>
              <MemoryRouter initialEntries={[options?.path ?? `/${route}/${id}`]}>
                <RouteObserver />
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/versionCheck" element={<VersionCheck />} />
                  <Route path="/admin/export/:id" element={<ExportPage />} />
                  <Route path="/admin/mission_stm/:id" element={<MissionSTMPage />} />
                  <Route path="/admin/notificationBanners" element={<NotificationBannersPage />} />
                  <Route path="/mission/:id" element={<MissionPage />} />
                  <Route path="/dashboard/:id" element={<DashboardPage />} />
                </Routes>
              </MemoryRouter>
            </CookiesProvider>
          </RepoContext.Provider>
        </Provider>
      );
      if (options?.waitForReady === false) return;
      const openedHandle = handles.get(id)!;
      if (route === "mission") {
        await expect
          .element(page.getByLabelText("missionNameHeader", { exact: true }))
          .toMatchTextContent(openedHandle.doc().name);
        await expect.poll(() => page.getBySelector(".ol-viewport").length).toBe(1);
        await expect
          .element(page.getByLabelText("globalEditToggle", { exact: true }))
          .toBeEnabled();
      } else if (Object.values(openedHandle.doc().rexes).some((rex) => rex.isRunning)) {
        await expect.element(page.getByTestId("dashboard-pet-clock")).toBeVisible();
        await expect.poll(() => page.getBySelector(".ol-viewport").length).toBe(2);
      } else {
        await expect
          .element(page.getByText("No EVA is currently running.", { exact: true }))
          .toBeVisible();
      }
    };

    const captureDownload = async (action: () => Promise<void>): Promise<BrowserDownload> => {
      const blobs = new Map<string, Blob>();
      const anchors = new Set<HTMLAnchorElement>();
      const errors: string[] = [];
      let attempts = 0;
      let download: BrowserDownload | undefined;
      const createObjectURL = URL.createObjectURL.bind(URL);
      const objectURLs = vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
        if (!(blob instanceof Blob)) throw new Error("Expected an exported Blob");
        const url = createObjectURL(blob);
        blobs.set(url, blob);
        return url;
      });
      const anchorClick = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(function (this: HTMLAnchorElement) {
          anchors.add(this);
          attempts += 1;
          const blob = blobs.get(this.href);
          if (!blob || !this.download || download) {
            const message = download
              ? "Expected exactly one download"
              : "Expected a named Blob download";
            errors.push(message);
            throw new Error(message);
          }
          download = { filename: this.download, blob, text: () => blob.text() };
        });
      try {
        await action();
        await expect
          .poll(() => Boolean(download), { message: "Wait for the export link" })
          .toBe(true);
        expect(errors, "The export must produce one valid download").toEqual([]);
        expect(attempts).toBe(1);
        return download!;
      } finally {
        objectURLs.mockRestore();
        anchorClick.mockRestore();
        for (const url of blobs.keys()) URL.revokeObjectURL(url);
        for (const anchor of anchors) anchor.remove();
      }
    };

    try {
      await page.viewport(1960, 1080);
      localStorage.clear();
      sessionStorage.clear();
      const fixture = (id: number): BrowserMission => ({
        id,
        name: handles.get(id)!.doc().name,
        ids: MISSION_IDS,
        read: async () => JSON.parse(JSON.stringify(handles.get(id)!.doc())) as Mission,
        change: async (mutator) => handles.get(id)!.change(mutator),
        open: (options) => open("mission", id, options),
        openDashboard: () => open("dashboard", id),
        navigate: async (path) => {
          await navigate(path);
        },
        addMission: async (name) => {
          const nextId = handles.size + 1;
          handles.set(
            nextId,
            repo.create<Mission>(
              buildBehavioralMission(nextId, name, scenario, generateBlankMission())
            )
          );
          return fixture(nextId);
        },
        captureDownload,
      });
      await runFixture(fixture(1));
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
