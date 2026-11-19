/**
 * Browser-mode tests for the Newton Path Planner's bottom gutter button: greyed out until
 * Newton reports a slope map over the mission's area, and always marked experimental.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { page } from "vitest/browser";

import { BottomControlPanel } from "components/interface/side-controls";
import { interfaceSlice, setBottomSectionSelected } from "store/interface";
import { pathPlannerSlice } from "store/pathPlanner";
import { NEWTON_COVERAGE_RECHECK_MS, NEWTON_COVERAGE_RETRY_MS } from "store/thunk/thunkPathPlanner";
import { evaSlice } from "store/eva";
import { createReactHarness, type ReactHarness } from "./map/helpers/reactBrowserHarness";

const mission = {
  id: 50,
  planetRadius: 1737400,
  demFilePath: "Data/dem.tif",
  landerLocation: { lat: -84.2, lng: 33.5 },
} as Partial<Mission>;

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: (selector: (m: Partial<Mission>) => unknown) => selector(mission),
}));
vi.mock("components/interface/timeline/timeline", () => ({
  default: () => <div data-testid="timeline-panel" />,
}));
vi.mock("components/interface/measure/measure", () => ({ default: (): null => null }));
vi.mock("components/interface/pathPlanner/path-planner", () => ({
  default: () => <div data-testid="path-planner-panel" />,
}));
const { getNewtonCoverage } = vi.hoisted(() => ({
  getNewtonCoverage: vi.fn<(missionId: number) => Promise<WrappedResponse<NewtonCoverage>>>(),
}));
vi.mock("http-client/newton", () => ({ getNewtonCoverage }));

const coverage = (reason: NewtonCoverageReason): WrappedResponse<NewtonCoverage> => ({
  status: "success",
  message: "ok",
  data: {
    supported: reason === "covered",
    reason,
    planet: "moon",
    probedBy: null,
    maps: [],
  },
});

function makeStore() {
  return configureStore({
    reducer: {
      interface: interfaceSlice.reducer,
      pathPlanner: pathPlannerSlice.reducer,
      eva: evaSlice.reducer,
    },
    // Without a selected EVA, auto-open would close the bottom panel.
    preloadedState: {
      interface: { ...interfaceSlice.getInitialState(), autoBottomPanelOpen: false },
    } as Parameters<typeof configureStore>[0]["preloadedState"],
  });
}

let harness: ReactHarness;
let store: ReturnType<typeof makeStore>;

function render() {
  store = makeStore();
  harness.render(
    <Provider store={store}>
      <BottomControlPanel />
    </Provider>
  );
}

const button = () =>
  harness.container.querySelector<HTMLElement>('[data-testid="path-planner-gutter-button"]');

beforeEach(() => {
  vi.clearAllMocks();
  harness = createReactHarness();
});
afterEach(() => harness.unmount());

describe("Path Planner gutter button", () => {
  it("is greyed out while Newton coverage is checked", async () => {
    getNewtonCoverage.mockReturnValue(new Promise(() => {}));
    render();
    await vi.waitFor(() => expect(button()).not.toBeNull());
    expect(button().getAttribute("aria-disabled")).toBe("true");
    expect(button().dataset.tooltipContent).toBe(
      "Newton Path Planner (experimental): checking Newton coverage…"
    );
    expect(getNewtonCoverage).toHaveBeenCalledWith(50);
  });

  it("opens the Path Planner when the mission is covered", async () => {
    getNewtonCoverage.mockResolvedValue(coverage("covered"));
    render();
    await vi.waitFor(() => expect(button().getAttribute("aria-disabled")).toBe("false"));
    expect(button().dataset.tooltipContent).toBe("Newton Path Planner (experimental)");
    expect(getComputedStyle(button().parentElement).opacity).toBe("1");

    await page.getByRole("button", { name: "Newton Path Planner" }).click();
    await expect.element(page.getByTestId("path-planner-panel")).toBeInTheDocument();
  });

  it("is greyed out and does nothing outside Newton's maps", async () => {
    getNewtonCoverage.mockResolvedValue(coverage("no_slope_map"));
    render();
    await vi.waitFor(() =>
      expect(button().dataset.tooltipContent).toBe(
        "Newton Path Planner (experimental): Newton has no slope map for this mission's area"
      )
    );
    expect(button().getAttribute("aria-disabled")).toBe("true");
    expect(Number(getComputedStyle(button().parentElement).opacity)).toBeLessThan(1);

    // A DOM click: Playwright won't click an aria-disabled element.
    button().click();
    expect(store.getState().interface.bottomSectionSelectedLabel).toBe("timeline");
    expect(harness.container.querySelector('[data-testid="path-planner-panel"]')).toBeNull();
  });

  it("leaves the Path Planner when the mission turns out not to be covered", async () => {
    getNewtonCoverage.mockResolvedValue(coverage("no_slope_map"));
    render();
    store.dispatch(setBottomSectionSelected("pathPlanner"));
    await vi.waitFor(() =>
      expect(store.getState().interface.bottomSectionSelectedLabel).toBe("timeline")
    );
    await expect.element(page.getByTestId("timeline-panel")).toBeInTheDocument();
  });

  it("is greyed out while Newton is not responding", async () => {
    getNewtonCoverage.mockResolvedValue({ status: "error", message: "Newton is unavailable" });
    render();
    await vi.waitFor(() =>
      expect(button().dataset.tooltipContent).toBe(
        "Newton Path Planner (experimental): Newton is not available"
      )
    );
    expect(button().getAttribute("aria-disabled")).toBe("true");
    expect(Number(getComputedStyle(button().parentElement).opacity)).toBeLessThan(1);
  });

  it("follows Newton going down and coming back", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      getNewtonCoverage.mockResolvedValueOnce(coverage("covered"));
      render();
      store.dispatch(setBottomSectionSelected("pathPlanner"));
      await vi.waitFor(() => expect(button().getAttribute("aria-disabled")).toBe("false"));

      getNewtonCoverage.mockResolvedValueOnce({
        status: "error",
        message: "Newton is unavailable",
      });
      await vi.advanceTimersByTimeAsync(NEWTON_COVERAGE_RECHECK_MS);
      await vi.waitFor(() => expect(button().getAttribute("aria-disabled")).toBe("true"));
      expect(button().dataset.tooltipContent).toMatch(/Newton is not available$/);
      // The open tool stays open; its plans report their own errors.
      expect(store.getState().interface.bottomSectionSelectedLabel).toBe("pathPlanner");

      getNewtonCoverage.mockResolvedValueOnce(coverage("covered"));
      await vi.advanceTimersByTimeAsync(NEWTON_COVERAGE_RETRY_MS);
      await vi.waitFor(() => expect(button().getAttribute("aria-disabled")).toBe("false"));
      expect(getNewtonCoverage).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("checks again on click after Newton was unavailable", async () => {
    getNewtonCoverage.mockResolvedValueOnce({ status: "error", message: "Newton is unavailable" });
    render();
    await vi.waitFor(() =>
      expect(button().dataset.tooltipContent).toMatch(/Newton is not available$/)
    );
    getNewtonCoverage.mockResolvedValueOnce(coverage("covered"));
    button().click();
    await vi.waitFor(() => expect(button().getAttribute("aria-disabled")).toBe("false"));
    expect(getNewtonCoverage).toHaveBeenCalledTimes(2);
  });

  it("shows the experimental badge whether or not the tool is available", async () => {
    getNewtonCoverage.mockResolvedValue(coverage("no_slope_map"));
    render();
    const badge = harness.container.querySelector(
      '[data-testid="path-planner-experimental-badge"]'
    );
    expect(badge).not.toBeNull();
    const box = badge.getBoundingClientRect();
    const icon = button().getBoundingClientRect();
    expect(box.width).toBeLessThan(icon.width / 2);
    expect(box.right).toBeLessThanOrEqual(icon.right);
    expect(box.bottom).toBeLessThanOrEqual(icon.bottom);
  });
});
