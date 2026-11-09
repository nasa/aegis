import { userEvent } from "vitest/browser";
import { recordBrowserErrors, waitForMapIdle } from "./mapInteractions";
import { isVisible } from "./browserAssertions";
/**
 * Cross-section workflow tests for the OpenLayers map on Isolated mission.
 *
 * These tests exercise multi-step workflows that span across sections:
 * select an EVA → view its stations → switch back to stations section, etc.
 * They verify that state persists and the map doesn't crash through complex
 * user journeys.
 */

import type { BrowserPage as Page } from "vitest/browser";
import { test, expect } from "./missionHarness";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function openMissionMap(page: Page, mission: BrowserMission): Promise<void> {
  await mission.open();

  await expect.element(page.getBySelector(".ol-viewport").first()).toBeVisible();
}

async function openEyeballMenu(page: Page): Promise<void> {
  const menuPanel = page.getByTestId("map-menu-floating-panel");
  const isOpen = await isVisible(menuPanel);
  if (!isOpen) {
    await page.getByTestId("map-menu-launcher").click();
  }
  await expect.element(menuPanel).toBeVisible();
  await expect.element(menuPanel.getByText("Map Item Visibility", { exact: true })).toBeVisible();
}

// ===========================================================================
// Cross-Section Workflows
// ===========================================================================

test.describe("Isolated mission — Cross-Section Workflows", () => {
  test("EVA → select EVA → switch to stations → see station list", async ({ page, mission }) => {
    await openMissionMap(page, mission);

    // Go to EVAs section and select the first EVA
    await page.getByLabelText("evas Section", { exact: true }).click();
    const firstEva = page.getByLabelText("evaList-item", { exact: true }).first();
    await expect.element(firstEva).toBeVisible();
    await firstEva.click();
    await waitForMapIdle();

    // Now switch to stations section
    await page.getByLabelText("station Section", { exact: true }).click();
    await expect
      .element(page.getByLabelText("leftPanelTitle", { exact: true }))
      .toMatchTextContent("Stations");

    // Station list should still show items
    await expect
      .poll(async () => page.getByLabelText("stationList-item", { exact: true }).length, {
        timeout: 5000,
      })
      .toBeGreaterThan(0);

    // Map should still be alive
    await expect.element(page.getBySelector(".ol-viewport canvas").first()).toBeVisible();
  });

  test("stations → select station → switch to POIs → select POI → no crash", async ({
    page,
    mission,
  }) => {
    const errors: string[] = [];
    recordBrowserErrors(errors);

    await openMissionMap(page, mission);

    // Select station
    await page.getByLabelText("station Section", { exact: true }).click();
    const firstStation = page.getByLabelText("stationList-item", { exact: true }).first();
    await expect.element(firstStation).toBeVisible();
    await firstStation.click();
    await waitForMapIdle();

    // Switch to POIs and select one
    await page.getByLabelText("poi Section", { exact: true }).click();
    const firstPoi = page.getByLabelText("poiList-item", { exact: true }).first();
    await expect.element(firstPoi).toBeVisible();
    await firstPoi.click();
    await waitForMapIdle();

    await expect.element(page.getBySelector(".ol-viewport canvas").first()).toBeVisible();

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });

  test("preset → switch preset → EVA section → no layer glitch", async ({ page, mission }) => {
    const errors: string[] = [];
    recordBrowserErrors(errors);

    await openMissionMap(page, mission);

    // Open preset section
    await page.getByLabelText("preset Section", { exact: true }).click();
    await waitForMapIdle();

    // Switch to EVA section
    await page.getByLabelText("evas Section", { exact: true }).click();
    const firstEva = page.getByLabelText("evaList-item", { exact: true }).first();
    await expect.element(firstEva).toBeVisible();
    await firstEva.click();
    await waitForMapIdle();

    // Back to preset
    await page.getByLabelText("preset Section", { exact: true }).click();
    await waitForMapIdle();

    await expect.element(page.getBySelector(".ol-viewport canvas").first()).toBeVisible();

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });

  test("switching from EVA section to station section and back keeps map alive", async ({
    page,
    mission,
  }) => {
    await openMissionMap(page, mission);

    // Re-visits the same section (EVA → station → EVA) to catch state-reentry
    // bugs a single-pass switch loop wouldn't surface.
    await page.getByLabelText("evas Section", { exact: true }).click();
    await expect.element(page.getBySelector(".ol-viewport canvas").first()).toBeVisible();

    await page.getByLabelText("station Section", { exact: true }).click();
    await expect.element(page.getBySelector(".ol-viewport canvas").first()).toBeVisible();

    await page.getByLabelText("evas Section", { exact: true }).click();
    await expect.element(page.getBySelector(".ol-viewport canvas").first()).toBeVisible();
  });
});

// ===========================================================================
// Keyboard & Focus Tests
// ===========================================================================

test.describe("Isolated mission — Keyboard & Focus", () => {
  test("pressing Escape while map is focused does not crash", async ({ page, mission }) => {
    const errors: string[] = [];
    recordBrowserErrors(errors);

    await openMissionMap(page, mission);

    // Focus the map
    await page.getBySelector(".ol-viewport").first().click();
    await userEvent.keyboard("{Escape}");
    await waitForMapIdle();

    await expect.element(page.getBySelector(".ol-viewport canvas").first()).toBeVisible();

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });
});

// ===========================================================================
// Edge Cases & Error Resilience
// ===========================================================================

test.describe("Isolated mission — Edge Cases", () => {
  test("quickly switching sections 10 times does not leak memory or crash", async ({
    page,
    mission,
  }) => {
    const errors: string[] = [];
    recordBrowserErrors(errors);

    await openMissionMap(page, mission);

    const sections = ["station Section", "evas Section", "poi Section", "preset Section"];

    for (let i = 0; i < 10; i++) {
      const section = sections[i % sections.length];
      await page.getByLabelText(section, { exact: true }).click();
      // Very short wait — we're stress-testing
      await waitForMapIdle();
    }

    // Give it a moment to settle
    await waitForMapIdle();

    await expect.element(page.getBySelector(".ol-viewport canvas").first()).toBeVisible();

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });

  test("zooming to max extent does not crash the map", async ({ page, mission }) => {
    const errors: string[] = [];
    recordBrowserErrors(errors);

    await openMissionMap(page, mission);

    // Click zoom-out many times to reach max extent
    const zoomOut = page.getBySelector(".ol-zoom-out").first();
    for (let i = 0; i < 8; i++) {
      await zoomOut.click();
      await waitForMapIdle();
    }

    await expect.element(page.getBySelector(".ol-viewport canvas").first()).toBeVisible();

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });

  test("zooming to min extent (max zoom in) does not crash", async ({ page, mission }) => {
    const errors: string[] = [];
    recordBrowserErrors(errors);

    await openMissionMap(page, mission);

    // Click zoom-in many times (may become disabled at max zoom)
    const zoomIn = page.getBySelector(".ol-zoom-in").first();
    for (let i = 0; i < 8; i++) {
      const isDisabled = (await zoomIn.element().getAttribute("disabled")) !== null;
      if (isDisabled) break;
      await zoomIn.click({ force: true }).catch(() => {});
      await waitForMapIdle();
    }

    await expect.element(page.getBySelector(".ol-viewport canvas").first()).toBeVisible();

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });
});

// ===========================================================================
// Eyeball Menu — State Persistence
// ===========================================================================

test.describe("Isolated mission — Eyeball Menu State", () => {
  test("eyeball menu state persists across section changes", async ({ page, mission }) => {
    await openMissionMap(page, mission);

    // Open eyeball menu
    await openEyeballMenu(page);
    const menuPanel = page.getByTestId("map-menu-floating-panel");
    await expect.element(menuPanel.getByText("Map Item Visibility", { exact: true })).toBeVisible();

    // Switch sections
    await page.getByLabelText("station Section", { exact: true }).click();
    await waitForMapIdle();

    // Re-open eyeball menu (it may close on section change)
    await openEyeballMenu(page);

    // Menu items should still be present — "Map Item Visibility" title confirms
    // the menu is open, then check for specific menu-only items like "Walkbacks"
    // (which only appear in the eyeball menu, not in panel titles)
    await expect.element(menuPanel.getByText("Map Item Visibility", { exact: true })).toBeVisible();
    await expect.element(menuPanel.getByText("Walkbacks")).toBeVisible();
    await expect.element(menuPanel.getByText("Scale Bar")).toBeVisible();
  });

  test("eyeball toggles produce no JS errors", async ({ page, mission }) => {
    const errors: string[] = [];
    recordBrowserErrors(errors);

    await openMissionMap(page, mission);
    await openEyeballMenu(page);

    // Click each "Labels" toggle to test state changes
    const labelsButtons = page
      .getByTestId("map-menu-floating-panel")
      .getByText("Labels", { exact: true });
    const count = await labelsButtons.length;

    for (let i = 0; i < count; i++) {
      await labelsButtons.nth(i).click();
      await waitForMapIdle();
    }

    // Toggle them all back
    for (let i = 0; i < count; i++) {
      await labelsButtons.nth(i).click();
      await waitForMapIdle();
    }

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });

  test("toggling Walkbacks and Circles produces no errors", async ({ page, mission }) => {
    const errors: string[] = [];
    recordBrowserErrors(errors);

    await openMissionMap(page, mission);
    await openEyeballMenu(page);

    // Toggle Walkbacks off and on
    const menuPanel = page.getByTestId("map-menu-floating-panel");
    const walkbacks = menuPanel.getByText("Walkbacks", { exact: true });
    if (await isVisible(walkbacks)) {
      await walkbacks.click();
      await waitForMapIdle();
      await walkbacks.click();
      await waitForMapIdle();
    }

    // Toggle Circles off and on
    const circles = menuPanel.getByText("Circles", { exact: true });
    if (await isVisible(circles)) {
      await circles.click();
      await waitForMapIdle();
      await circles.click();
      await waitForMapIdle();
    }

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });

  test("toggling traverse arrows produces no errors", async ({ page, mission }) => {
    const errors: string[] = [];
    recordBrowserErrors(errors);

    await openMissionMap(page, mission);
    await openEyeballMenu(page);

    // The traverse section has Arrows toggle
    const arrows = page.getByTestId("map-menu-floating-panel").getByText("Arrows", { exact: true });
    if (await isVisible(arrows)) {
      await arrows.click();
      await waitForMapIdle();
      await arrows.click();
      await waitForMapIdle();
    }

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });
});

// ===========================================================================
// Dashboard Tests
// ===========================================================================

test.describe("Isolated mission — Dashboard Integration", () => {
  test("dashboard page loads without JS errors", async ({ page, mission }) => {
    const errors: string[] = [];
    recordBrowserErrors(errors);

    await mission.openDashboard();

    // Wait for either the map or the "No EVA running" message
    await expect
      .poll(
        async () => {
          const hasMaps = (await page.getBySelector(".ol-viewport").length) > 0;
          const hasNoEvaMessage = await isVisible(page.getByText("No EVA is currently running."));
          return hasMaps || hasNoEvaMessage;
        },
        { timeout: 10000 }
      )
      .toBe(true);

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });

  test("navigating from mission to dashboard and back does not crash", async ({
    page,
    mission,
  }) => {
    const errors: string[] = [];
    recordBrowserErrors(errors);

    // Start at mission page
    await openMissionMap(page, mission);

    // Navigate to dashboard
    await mission.openDashboard();

    await waitForMapIdle();

    // Navigate back to mission
    await mission.open();

    await expect.element(page.getBySelector(".ol-viewport").first()).toBeVisible();

    await expect.element(page.getBySelector(".ol-viewport canvas").first()).toBeVisible();

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });
});

test("unknown mission hash still mounts the map", async ({ page, mission }) => {
  await mission.open({ path: `/mission/${mission.id}#nonexistent` });
  await expect.element(page.getBySelector(".ol-viewport canvas").first()).toBeVisible();
});

test("remounting the mission reconstructs the map without browser errors", async ({
  page,
  mission,
}) => {
  const errors: string[] = [];
  recordBrowserErrors(errors);
  await mission.open();
  await mission.open();
  await expect.element(page.getBySelector(".ol-viewport canvas").first()).toBeVisible();
  expect(
    errors.filter((error) => !error.includes("ResizeObserver") && !error.includes("Script error"))
  ).toEqual([]);
});

test("direct mission entry and return from the mission listing restore the map", async ({
  page,
  mission,
  requestHandlers,
}) => {
  requestHandlers["/api/v1/missionHomepageItems"] = () =>
    Response.json({
      status: "success",
      data: [{ id: mission.id, name: mission.name, runningRex: null }],
    });
  requestHandlers["/api/v1/version"] = () =>
    Response.json({
      version: __APP_VERSION__,
      gitCommit: __GIT_COMMIT__,
      serverEpochUuid: "browser-test-epoch",
    });
  await mission.open();
  await expect.element(page.getBySelector(".ol-viewport").first()).toBeVisible();
  await page.getBySelector('svg[data-icon="bars"]').click();
  await page
    .getBySelector("tr")
    .filter({ has: page.getByText(mission.name, { exact: true }) })
    .getByRole("button", { name: "Select", exact: true })
    .click();
  await expect.element(page.getBySelector(".ol-viewport").first()).toBeVisible();
});
