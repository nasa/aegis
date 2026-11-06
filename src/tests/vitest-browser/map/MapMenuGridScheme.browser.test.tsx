/**
 * Browser-mode tests for the map menu's Earth label scheme toggle.
 *
 * Mocks:
 *  - `utils/useDocSelector` — provides the mission's grid system fields
 *  - `useResolvedMissionGrid` — no grid
 *  - `utils/lgrs/system` — stands in a lunar-formatted system for `earth-wgs84`
 *
 * Verifies:
 *  - The toggle is hidden on lunar missions
 *  - It shows the active scheme: the user override, else the mission default
 *  - Choosing a scheme stores the override in Redux and a cookie; choosing the mission
 *    default clears it
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Provider } from "react-redux";
import { CookiesProvider } from "react-cookie";
import { configureStore } from "@reduxjs/toolkit";
import Cookies from "js-cookie";

import { MapMenuProvider } from "components/interface/map/MapMenuProvider";
import { MapMenuPanel } from "components/interface/map/overlays/map-menu";
import { interfaceSlice } from "store/interface";
import { rexSlice } from "store/rex";
import type * as SystemModule from "utils/lgrs/system";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";

const mockMissionDoc: Partial<Mission> = {};

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc as Mission),
}));

vi.mock("components/interface/map/hooks/useResolvedMissionGrid", () => ({
  useResolvedMissionGrid: (): ResolvedMissionGrid => ({ kind: "none" }),
}));

vi.mock("utils/lgrs/system", async (importOriginal) =>
  (await import("./helpers/earthStandIn")).withEarthStandIn(
    await importOriginal<typeof SystemModule>()
  )
);

const COOKIE = "AEGIS_Grid_Label_Scheme";

function makeStore(gridLabelSchemeOverride: GridLabelScheme | null = null) {
  return configureStore({
    reducer: { interface: interfaceSlice.reducer, rex: rexSlice.reducer },
    preloadedState: {
      interface: { ...interfaceSlice.getInitialState(), gridLabelSchemeOverride },
    },
  });
}

let harness: ReactHarness;
let store: ReturnType<typeof makeStore>;

function renderMenu() {
  harness.render(
    <CookiesProvider>
      <Provider store={store}>
        <MapMenuProvider>
          <MapMenuPanel />
        </MapMenuProvider>
      </Provider>
    </CookiesProvider>
  );
}

function schemeButton(name: "ACC" | "MGRS"): HTMLElement | undefined {
  const row = harness.container.querySelector("[data-testid='map-menu-grid-scheme']");
  return Array.from(row?.querySelectorAll<HTMLElement>("[aria-pressed]") ?? []).find(
    (button) => button.textContent === name
  );
}

function activeScheme(): string | undefined {
  return ["ACC", "MGRS"].find(
    (name) => schemeButton(name as "ACC" | "MGRS")?.getAttribute("aria-pressed") === "true"
  );
}

beforeEach(() => {
  for (const key of Object.keys(mockMissionDoc)) delete mockMissionDoc[key as keyof Mission];
  Cookies.remove(COOKIE, { path: "/" });
  store = makeStore();
  harness = createReactHarness();
});

afterEach(() => {
  harness.unmount();
  Cookies.remove(COOKIE, { path: "/" });
});

describe("map menu grid scheme toggle", () => {
  it.each([undefined, "moon-m2025"] as const)("is hidden for grid system %s", (gridSystem) => {
    mockMissionDoc.gridSystem = gridSystem;
    mockMissionDoc.earthGridLabelScheme = "mgrs";
    store = makeStore("mgrs");
    renderMenu();
    expect(harness.container.querySelector("[data-testid='map-menu-grid-scheme']")).toBeNull();
  });

  it.each([
    { scheme: undefined, override: null, expected: "ACC" },
    { scheme: "mgrs", override: null, expected: "MGRS" },
    { scheme: "mgrs", override: "lunar-acc", expected: "ACC" },
  ] as const)(
    "shows $expected with default $scheme and override $override",
    ({ scheme, override, expected }) => {
      mockMissionDoc.gridSystem = "earth-wgs84";
      mockMissionDoc.earthGridLabelScheme = scheme;
      store = makeStore(override);
      renderMenu();
      expect(activeScheme()).toBe(expected);
    }
  );

  it("stores an override and clears it when the mission default is chosen", async () => {
    mockMissionDoc.gridSystem = "earth-wgs84";
    mockMissionDoc.earthGridLabelScheme = "lunar-acc";
    renderMenu();

    schemeButton("MGRS").click();
    await vi.waitFor(() => expect(activeScheme()).toBe("MGRS"));
    expect(store.getState().interface.gridLabelSchemeOverride).toBe("mgrs");
    expect(Cookies.get(COOKIE)).toBe("mgrs");

    schemeButton("ACC").click();
    await vi.waitFor(() => expect(activeScheme()).toBe("ACC"));
    expect(store.getState().interface.gridLabelSchemeOverride).toBeNull();
    expect(Cookies.get(COOKIE)).toBeUndefined();
  });
});
