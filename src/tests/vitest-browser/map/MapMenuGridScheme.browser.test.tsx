/**
 * Browser-mode tests for the map menu's Earth label scheme handling.
 *
 * Mocks:
 *  - `utils/useDocSelector` — provides the mission's grid system fields
 *  - `useResolvedMissionGrid` — no grid, or the dynamic grid
 *
 * Verifies:
 *  - The map menu has no label scheme toggle; labels follow the mission's admin setting
 *  - The dynamic grid's fixed spacings follow the mission scheme (10 km only in MGRS)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Provider } from "react-redux";
import { CookiesProvider } from "react-cookie";
import { configureStore } from "@reduxjs/toolkit";

import { MapMenuProvider } from "components/interface/map/MapMenuProvider";
import { MapMenuPanel } from "components/interface/map/overlays/map-menu";
import { interfaceSlice } from "store/interface";
import { rexSlice } from "store/rex";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";

const mockMissionDoc: Partial<Mission> = {};

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc as Mission),
}));

let mockResolvedGrid: ResolvedMissionGrid = { kind: "none" };

vi.mock("components/interface/map/hooks/useResolvedMissionGrid", () => ({
  useResolvedMissionGrid: (): ResolvedMissionGrid => mockResolvedGrid,
}));

function makeStore() {
  return configureStore({
    reducer: { interface: interfaceSlice.reducer, rex: rexSlice.reducer },
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

/** Option texts of the map menu's Grid spacing row. */
function gridSpacingOptions(): string[] {
  const row = Array.from(harness.container.querySelectorAll("div")).find(
    (div) => div.firstChild?.nodeType === Node.TEXT_NODE && div.firstChild.textContent === "Grid"
  );
  return Array.from(row?.children ?? []).map((option) => option.textContent ?? "");
}

beforeEach(() => {
  for (const key of Object.keys(mockMissionDoc)) delete mockMissionDoc[key as keyof Mission];
  mockResolvedGrid = { kind: "none" };
  store = makeStore();
  harness = createReactHarness();
});

afterEach(() => {
  harness.unmount();
});

describe("map menu grid scheme", () => {
  it.each([undefined, "moon-m2025", "earth-wgs84"] as const)(
    "has no scheme toggle for grid system %s",
    (gridSystem) => {
      mockMissionDoc.gridSystem = gridSystem;
      mockMissionDoc.earthGridLabelScheme = "mgrs";
      renderMenu();
      expect(harness.container.querySelector("[data-testid='map-menu-grid-scheme']")).toBeNull();
    }
  );

  it.each([
    { scheme: "lunar-acc", expected: ["Auto", "10m", "100m", "1km"] },
    { scheme: "mgrs", expected: ["Auto", "10m", "100m", "1km", "10km"] },
  ] as const)(
    "offers the $scheme mission scheme's fixed spacings for the dynamic grid",
    ({ scheme, expected }) => {
      mockMissionDoc.gridSystem = "earth-wgs84";
      mockMissionDoc.earthGridLabelScheme = scheme;
      mockResolvedGrid = { kind: "dynamic-lgrs" };
      renderMenu();
      expect(gridSpacingOptions()).toEqual(expected);
    }
  );
});
