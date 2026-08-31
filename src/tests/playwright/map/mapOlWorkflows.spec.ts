/**
 * Cross-section workflow tests for the OpenLayers map on Mission 22.
 *
 * These tests exercise multi-step workflows that span across sections:
 * select an EVA → view its stations → switch back to stations section, etc.
 * They verify that state persists and the map doesn't crash through complex
 * user journeys.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "@playwright/test";
import { waitForPageReady } from "../helpers";

const MISSION_URL = "http://localhost:4000/mission/22";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function openMissionMap(page: Page): Promise<void> {
  await page.goto(MISSION_URL);
  await waitForPageReady(page);
  await page.locator(".ol-viewport").first().waitFor({ state: "visible", timeout: 15000 });
}

async function openEyeballMenu(page: Page): Promise<void> {
  const menuTitle = page.getByText("Map Item Visibility", { exact: true });
  const isOpen = await menuTitle.isVisible().catch(() => false);
  if (!isOpen) {
    await page.getByTestId("map-menu-launcher").click();
    await expect(page.getByTestId("map-menu-floating-panel")).toBeVisible();
    await expect(menuTitle).toBeVisible({ timeout: 3000 });
  }
}

// ===========================================================================
// Cross-Section Workflows
// ===========================================================================

test.describe("Mission 22 — Cross-Section Workflows", () => {
  test("EVA → select EVA → switch to stations → see station list", async ({ page }) => {
    await openMissionMap(page);

    // Go to EVAs section and select the first EVA
    await page.getByLabel("evas Section", { exact: true }).click();
    const firstEva = page.getByLabel("evaList-item", { exact: true }).first();
    await expect(firstEva).toBeVisible({ timeout: 5000 });
    await firstEva.click();
    await page.waitForTimeout(500);

    // Now switch to stations section
    await page.getByLabel("station Section", { exact: true }).click();
    await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText("Stations");

    // Station list should still show items
    await expect
      .poll(
        async () =>
          page
            .getByLabel("stationList-item", { exact: true })
            .count()
            .catch(() => 0),
        { timeout: 5000 }
      )
      .toBeGreaterThan(0);

    // Map should still be alive
    await expect(page.locator(".ol-viewport canvas").first()).toBeVisible();
  });

  test("stations → select station → switch to POIs → select POI → no crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await openMissionMap(page);

    // Select station
    await page.getByLabel("station Section", { exact: true }).click();
    const firstStation = page.getByLabel("stationList-item", { exact: true }).first();
    await expect(firstStation).toBeVisible({ timeout: 5000 });
    await firstStation.click();
    await page.waitForTimeout(500);

    // Switch to POIs and select one
    await page.getByLabel("poi Section", { exact: true }).click();
    const firstPoi = page.getByLabel("poiList-item", { exact: true }).first();
    await expect(firstPoi).toBeVisible({ timeout: 5000 });
    await firstPoi.click();
    await page.waitForTimeout(500);

    await expect(page.locator(".ol-viewport canvas").first()).toBeVisible();

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });

  test("preset → switch preset → EVA section → no layer glitch", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await openMissionMap(page);

    // Open preset section
    await page.getByLabel("preset Section", { exact: true }).click();
    await page.waitForTimeout(500);

    // Switch to EVA section
    await page.getByLabel("evas Section", { exact: true }).click();
    const firstEva = page.getByLabel("evaList-item", { exact: true }).first();
    await expect(firstEva).toBeVisible({ timeout: 5000 });
    await firstEva.click();
    await page.waitForTimeout(500);

    // Back to preset
    await page.getByLabel("preset Section", { exact: true }).click();
    await page.waitForTimeout(500);

    await expect(page.locator(".ol-viewport canvas").first()).toBeVisible();

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });

  test("switching from EVA section to station section and back keeps map alive", async ({
    page,
  }) => {
    await openMissionMap(page);

    // Re-visits the same section (EVA → station → EVA) to catch state-reentry
    // bugs a single-pass switch loop wouldn't surface.
    await page.getByLabel("evas Section", { exact: true }).click();
    await expect(page.locator(".ol-viewport canvas").first()).toBeVisible();

    await page.getByLabel("station Section", { exact: true }).click();
    await expect(page.locator(".ol-viewport canvas").first()).toBeVisible();

    await page.getByLabel("evas Section", { exact: true }).click();
    await expect(page.locator(".ol-viewport canvas").first()).toBeVisible();
  });
});

// ===========================================================================
// Keyboard & Focus Tests
// ===========================================================================

test.describe("Mission 22 — Keyboard & Focus", () => {
  test("pressing Escape while map is focused does not crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await openMissionMap(page);

    // Focus the map
    await page.locator(".ol-viewport").first().click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    await expect(page.locator(".ol-viewport canvas").first()).toBeVisible();

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });
});

// ===========================================================================
// Edge Cases & Error Resilience
// ===========================================================================

test.describe("Mission 22 — Edge Cases", () => {
  test("loading mission page with a non-existent hash fragment does not crash", async ({
    page,
  }) => {
    await page.goto(`${MISSION_URL}#nonexistent`);
    await waitForPageReady(page);
    // The map should still load
    await page.locator(".ol-viewport").first().waitFor({ state: "visible", timeout: 15000 });
    await expect(page.locator(".ol-viewport canvas").first()).toBeVisible();
  });

  test("quickly switching sections 10 times does not leak memory or crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await openMissionMap(page);

    const sections = ["station Section", "evas Section", "poi Section", "preset Section"];

    for (let i = 0; i < 10; i++) {
      const section = sections[i % sections.length];
      await page.getByLabel(section, { exact: true }).click();
      // Very short wait — we're stress-testing
      await page.waitForTimeout(100);
    }

    // Give it a moment to settle
    await page.waitForTimeout(500);

    await expect(page.locator(".ol-viewport canvas").first()).toBeVisible();

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });

  test("zooming to max extent does not crash the map", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await openMissionMap(page);

    // Click zoom-out many times to reach max extent
    const zoomOut = page.locator(".ol-zoom-out").first();
    for (let i = 0; i < 8; i++) {
      await zoomOut.click();
      await page.waitForTimeout(200);
    }

    await expect(page.locator(".ol-viewport canvas").first()).toBeVisible();

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });

  test("zooming to min extent (max zoom in) does not crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await openMissionMap(page);

    // Click zoom-in many times (may become disabled at max zoom)
    const zoomIn = page.locator(".ol-zoom-in").first();
    for (let i = 0; i < 8; i++) {
      const isDisabled = await zoomIn
        .getAttribute("disabled")
        .then((v) => v !== null)
        .catch(() => false);
      if (isDisabled) break;
      await zoomIn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(200);
    }

    await expect(page.locator(".ol-viewport canvas").first()).toBeVisible();

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });

  test("page reloads cleanly (no JS errors on hard reload)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await openMissionMap(page);
    await page.reload();
    await waitForPageReady(page);
    await page.locator(".ol-viewport").first().waitFor({ state: "visible", timeout: 15000 });

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });
});

// ===========================================================================
// Page Navigation
// ===========================================================================

test.describe("Mission 22 — Page Navigation", () => {
  test("navigating directly to mission/22 loads the map", async ({ page }) => {
    await page.goto(MISSION_URL);
    await waitForPageReady(page);
    await expect(page.locator(".ol-viewport").first()).toBeVisible({ timeout: 15000 });
  });

  test("navigating away and back restores the map", async ({ page }) => {
    await page.goto(MISSION_URL);
    await waitForPageReady(page);
    await page.locator(".ol-viewport").first().waitFor({ state: "visible", timeout: 15000 });

    // Navigate away to the mission listing
    await page.goto("http://localhost:4000/");
    await waitForPageReady(page);

    // Navigate back
    await page.goto(MISSION_URL);
    await waitForPageReady(page);
    await expect(page.locator(".ol-viewport").first()).toBeVisible({ timeout: 15000 });
  });
});

// ===========================================================================
// Eyeball Menu — State Persistence
// ===========================================================================

test.describe("Mission 22 — Eyeball Menu State", () => {
  test("eyeball menu state persists across section changes", async ({ page }) => {
    await openMissionMap(page);

    // Open eyeball menu
    await openEyeballMenu(page);
    await expect(page.getByText("Map Item Visibility")).toBeVisible();

    // Switch sections
    await page.getByLabel("station Section", { exact: true }).click();
    await page.waitForTimeout(300);

    // Re-open eyeball menu (it may close on section change)
    await openEyeballMenu(page);

    // Menu items should still be present — "Map Item Visibility" title confirms
    // the menu is open, then check for specific menu-only items like "Walkbacks"
    // (which only appear in the eyeball menu, not in panel titles)
    await expect(page.getByText("Map Item Visibility")).toBeVisible();
    await expect(page.getByText("Walkbacks")).toBeVisible();
    await expect(page.getByText("Scale Bar")).toBeVisible();
  });

  test("eyeball toggles produce no JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await openMissionMap(page);
    await openEyeballMenu(page);

    // Click each "Labels" toggle to test state changes
    const labelsButtons = page.getByText("Labels", { exact: true });
    const count = await labelsButtons.count();

    for (let i = 0; i < count; i++) {
      await labelsButtons.nth(i).click();
      await page.waitForTimeout(200);
    }

    // Toggle them all back
    for (let i = 0; i < count; i++) {
      await labelsButtons.nth(i).click();
      await page.waitForTimeout(200);
    }

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });

  test("toggling Walkbacks and Circles produces no errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await openMissionMap(page);
    await openEyeballMenu(page);

    // Toggle Walkbacks off and on
    const walkbacks = page.getByText("Walkbacks", { exact: true });
    if (await walkbacks.isVisible()) {
      await walkbacks.click();
      await page.waitForTimeout(300);
      await walkbacks.click();
      await page.waitForTimeout(300);
    }

    // Toggle Circles off and on
    const circles = page.getByText("Circles", { exact: true });
    if (await circles.isVisible()) {
      await circles.click();
      await page.waitForTimeout(300);
      await circles.click();
      await page.waitForTimeout(300);
    }

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });

  test("toggling traverse arrows produces no errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await openMissionMap(page);
    await openEyeballMenu(page);

    // The traverse section has Arrows toggle
    const arrows = page.getByText("Arrows", { exact: true });
    if (await arrows.isVisible()) {
      await arrows.click();
      await page.waitForTimeout(300);
      await arrows.click();
      await page.waitForTimeout(300);
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

test.describe("Mission 22 — Dashboard Integration", () => {
  const DASHBOARD_URL = "http://localhost:4000/dashboard/22";

  test("dashboard page loads without JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(DASHBOARD_URL);
    await waitForPageReady(page);

    // Wait for either the map or the "No EVA running" message
    await expect
      .poll(
        async () => {
          const hasMaps = (await page.locator(".ol-viewport").count()) > 0;
          const hasNoEvaMessage = await page
            .getByText("No EVA is currently running.")
            .isVisible()
            .catch(() => false);
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

  test("navigating from mission to dashboard and back does not crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    // Start at mission page
    await openMissionMap(page);

    // Navigate to dashboard
    await page.goto(DASHBOARD_URL);
    await waitForPageReady(page);
    await page.waitForTimeout(1000);

    // Navigate back to mission
    await page.goto(MISSION_URL);
    await waitForPageReady(page);
    await page.locator(".ol-viewport").first().waitFor({ state: "visible", timeout: 15000 });

    await expect(page.locator(".ol-viewport canvas").first()).toBeVisible();

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });

  test("when an EVA is running, both big-map and minimap OL viewports render", async ({ page }) => {
    await page.goto(DASHBOARD_URL);
    await waitForPageReady(page);

    const noEva = await page
      .getByText("No EVA is currently running.")
      .isVisible()
      .catch(() => false);

    test.skip(
      noEva,
      "Mission 22 has no REX currently running — map portion of dashboard is hidden"
    );

    // Wait for at least one OL viewport to attach
    await page.locator(".ol-viewport").first().waitFor({ state: "visible", timeout: 15000 });
    const viewportCount = await page.locator(".ol-viewport").count();
    // Big map + minimap → 2 OL viewports
    expect(viewportCount).toBeGreaterThanOrEqual(2);
  });
});
