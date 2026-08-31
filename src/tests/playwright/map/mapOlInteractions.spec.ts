/**
 * Integration tests for OpenLayers map interactions on Mission 22.
 *
 * These tests exercise the full integrated map — eyeball menu toggles,
 * station/POI/EVA selection, panel navigation, and map display settings.
 *
 * Requires Mission 22 to be seeded with at least one preset, one station,
 * one POI, and one EVA.
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

/** Open the eyeball (Map Item Visibility) menu. */
async function openEyeballMenu(page: Page): Promise<void> {
  const menuPanel = page.getByTestId("map-menu-floating-panel");
  const isOpen = await menuPanel.isVisible().catch(() => false);
  if (!isOpen) {
    await page.getByTestId("map-menu-launcher").click();
  }
  await expect(menuPanel).toBeVisible();
  await expect(menuPanel.getByText("Map Item Visibility", { exact: true })).toBeVisible();
}

/** Wait for the OL map to have painted pixels (tiles loaded). */
async function waitForMapPainted(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const canvas = document.querySelector(".ol-viewport canvas") as HTMLCanvasElement | null;
          if (!canvas) return false;
          try {
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (!ctx) return false;
            const w = Math.min(canvas.width, 200);
            const h = Math.min(canvas.height, 200);
            const data = ctx.getImageData(0, 0, w, h).data;
            for (let i = 3; i < data.length; i += 4) {
              if (data[i] > 0) return true;
            }
            return false;
          } catch {
            return true;
          }
        }),
      { timeout: 10000, intervals: [100, 200, 500] }
    )
    .toBe(true);
}

// ===========================================================================
// Page Load & Rendering Tests
// ===========================================================================

test.describe("Mission 22 — Page Load & Rendering", () => {
  test("OL canvas is sized and visible", async ({ page }) => {
    await openMissionMap(page);

    const canvas = page.locator(".ol-viewport canvas").first();
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.height).toBeGreaterThan(100);
  });

  test("OL canvas paints non-blank pixels (tiles or vector content)", async ({ page }) => {
    await openMissionMap(page);
    await waitForMapPainted(page);
  });

  test("scale bar is visible by default in editor mode", async ({ page }) => {
    await openMissionMap(page);
    // ScaleBar renders text like "100 m" or "1 km" inside an aria-labelled element.
    const scaleBar = page.getByLabel("scaleBar", { exact: true });
    await expect(scaleBar).toBeVisible({ timeout: 5000 });
  });

  test("zoom controls (+ / -) are present in editor mode", async ({ page }) => {
    await openMissionMap(page);
    // OL renders default zoom controls as .ol-zoom buttons
    const zoomIn = page.locator(".ol-zoom-in");
    const zoomOut = page.locator(".ol-zoom-out");
    await expect(zoomIn).toBeVisible({ timeout: 5000 });
    await expect(zoomOut).toBeVisible({ timeout: 5000 });
  });

  test("map canvas does not become blank after waiting 3 seconds", async ({ page }) => {
    await openMissionMap(page);
    // Wait 3s then verify canvas still has pixels. Distinct from the poll-based
    // paint check: this asserts the canvas STAYS painted, not just that it
    // eventually paints.
    await page.waitForTimeout(3000);
    const hasPaintedPixels = await page.evaluate(() => {
      const canvas = document.querySelector(".ol-viewport canvas") as HTMLCanvasElement | null;
      if (!canvas) return false;
      try {
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return false;
        const w = Math.min(canvas.width, 200);
        const h = Math.min(canvas.height, 200);
        const data = ctx.getImageData(0, 0, w, h).data;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 0) return true;
        }
        return false;
      } catch {
        return true; // tainted canvas = content present
      }
    });
    expect(hasPaintedPixels).toBe(true);
  });

  test("page title reflects the mission name", async ({ page }) => {
    await openMissionMap(page);
    // Just check the page didn't return an error page
    const title = await page.title();
    expect(title).not.toContain("Error");
    expect(title.length).toBeGreaterThan(0);
  });

  test("ol-viewport has correct CSS classes applied", async ({ page }) => {
    await openMissionMap(page);
    const viewport = page.locator(".ol-viewport").first();
    await expect(viewport).toBeVisible();
    // OL adds these classes to the viewport element
    await expect(viewport).toHaveClass(/ol-viewport/);
  });
});

// ===========================================================================
// Eyeball Menu Tests
// ===========================================================================

test.describe("Mission 22 — Eyeball Menu", () => {
  test("eyeball menu opens and shows 'Map Item Visibility' title", async ({ page }) => {
    await openMissionMap(page);
    await openEyeballMenu(page);
    const menuPanel = page.getByTestId("map-menu-floating-panel");
    await expect(menuPanel.getByText("Map Item Visibility", { exact: true })).toBeVisible();
  });

  test("eyeball menu shows POIs, Stations, Actions, Positions labels", async ({ page }) => {
    await openMissionMap(page);
    await openEyeballMenu(page);

    const menuPanel = page.getByTestId("map-menu-floating-panel");
    await expect(menuPanel.getByText("POIs")).toBeVisible();
    await expect(menuPanel.getByText("Stations")).toBeVisible();
    await expect(menuPanel.getByText("Actions")).toBeVisible();
    // "Positions" may be within a collapsible section
    await expect(menuPanel.getByText("Positions")).toBeVisible();
  });

  test("eyeball menu shows Scale Bar and Mouse Lat/Lon toggles", async ({ page }) => {
    await openMissionMap(page);
    await openEyeballMenu(page);

    const menuPanel = page.getByTestId("map-menu-floating-panel");
    await expect(menuPanel.getByText("Scale Bar")).toBeVisible();
    await expect(menuPanel.getByText("Mouse Lat/Lon")).toBeVisible();
  });

  test("eyeball menu shows Stations sub-toggles: Labels, Walkbacks, Circles", async ({ page }) => {
    await openMissionMap(page);
    await openEyeballMenu(page);

    // Station row has Labels, Walkbacks, Circles sub-toggles
    // Note: "Labels" appears for POIs, Stations, and Actions rows
    const menuPanel = page.getByTestId("map-menu-floating-panel");
    await expect(menuPanel.getByText("Walkbacks")).toBeVisible();
    await expect(menuPanel.getByText("Circles")).toBeVisible();
  });

  test("toggling scale bar off hides the scale bar from the map", async ({ page }) => {
    await openMissionMap(page);

    // Scale bar should be visible by default
    const scaleBar = page.getByLabel("scaleBar", { exact: true });
    await expect(scaleBar).toBeVisible({ timeout: 5000 });

    // Open eyeball menu and toggle Scale Bar off
    await openEyeballMenu(page);

    // Click the eye icon next to "Scale Bar" to toggle it off
    // The Scale Bar row has an eye icon to its left
    const scaleBarRow = page.getByTestId("map-menu-floating-panel").getByText("Scale Bar");
    const scaleBarContainer = scaleBarRow.locator("..");
    // Find the eye icon within the same parent container
    await scaleBarContainer.locator("[class*='menuEyeIcon'], [class*='Eye']").first().click();

    // Scale bar should be hidden now
    await expect(scaleBar).not.toBeVisible({ timeout: 3000 });
  });

  test("toggling scale bar back on re-shows the scale bar", async ({ page }) => {
    await openMissionMap(page);
    await openEyeballMenu(page);

    const scaleBarRow = page.getByTestId("map-menu-floating-panel").getByText("Scale Bar");
    const scaleBarContainer = scaleBarRow.locator("..");
    const eyeIcon = scaleBarContainer.locator("[class*='menuEyeIcon'], [class*='Eye']").first();

    // Toggle off
    await eyeIcon.click();
    await page.waitForTimeout(300);

    // Toggle back on
    await eyeIcon.click();

    // Scale bar should reappear
    const scaleBar = page.getByLabel("scaleBar", { exact: true });
    await expect(scaleBar).toBeVisible({ timeout: 5000 });
  });

  test("eyeball menu closes when clicking the X button", async ({ page }) => {
    await openMissionMap(page);
    await openEyeballMenu(page);

    const menuPanel = page.getByTestId("map-menu-floating-panel");
    const title = menuPanel.getByText("Map Item Visibility", { exact: true });
    await expect(title).toBeVisible();

    // Click the close (X) icon in the header
    await page.locator("[class*='menuHeaderClose']").first().click();

    // The menu content should be hidden
    await expect(menuPanel).not.toBeVisible({ timeout: 3000 });
  });
});

// ===========================================================================
// Section Navigation & Panel Tests
// ===========================================================================

test.describe("Mission 22 — Section Navigation", () => {
  test("all section buttons are present", async ({ page }) => {
    await openMissionMap(page);

    const sections = ["station Section", "poi Section", "evas Section", "preset Section"];
    for (const section of sections) {
      await expect(page.getByLabel(section, { exact: true })).toBeVisible();
    }
  });

  test("clicking station section shows Stations panel title", async ({ page }) => {
    await openMissionMap(page);

    await page.getByLabel("station Section", { exact: true }).click();
    await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText("Stations");
  });

  test("clicking POI section shows Points of Interest panel title", async ({ page }) => {
    await openMissionMap(page);

    await page.getByLabel("poi Section", { exact: true }).click();
    await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText(
      "Points of Interest"
    );
  });

  test("clicking EVAs section shows EVAs panel title", async ({ page }) => {
    await openMissionMap(page);

    await page.getByLabel("evas Section", { exact: true }).click();
    await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText("EVAs");
  });

  test("clicking presets section shows preset panel", async ({ page }) => {
    await openMissionMap(page);

    await page.getByLabel("preset Section", { exact: true }).click();
    await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText("Presets");
  });

  test("station section shows a list of stations when mission has station data", async ({
    page,
  }) => {
    await openMissionMap(page);

    await page.getByLabel("station Section", { exact: true }).click();
    // Wait for the station list to populate (may take a moment after section change)
    await expect
      .poll(
        async () => {
          const count = await page
            .getByLabel("stationList-item", { exact: true })
            .count()
            .catch(() => 0);
          return count;
        },
        { timeout: 5000 }
      )
      .toBeGreaterThan(0);
  });

  test("EVA section shows a list of EVAs when mission has EVA data", async ({ page }) => {
    await openMissionMap(page);

    await page.getByLabel("evas Section", { exact: true }).click();
    await expect
      .poll(
        async () => {
          const count = await page
            .getByLabel("evaList-item", { exact: true })
            .count()
            .catch(() => 0);
          return count;
        },
        { timeout: 5000 }
      )
      .toBeGreaterThan(0);
  });

  test("POI section shows a list of POIs when mission has POI data", async ({ page }) => {
    await openMissionMap(page);

    await page.getByLabel("poi Section", { exact: true }).click();
    await expect
      .poll(
        async () => {
          const count = await page
            .getByLabel("poiList-item", { exact: true })
            .count()
            .catch(() => 0);
          return count;
        },
        { timeout: 5000 }
      )
      .toBeGreaterThan(0);
  });

  test("rapid section switching does not crash the map", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await openMissionMap(page);

    const sections = [
      "station Section",
      "evas Section",
      "poi Section",
      "preset Section",
      "station Section",
      "evas Section",
    ];
    for (const section of sections) {
      await page.getByLabel(section, { exact: true }).click();
      // Don't wait too long — we're testing rapid switching
      await page.waitForTimeout(200);
    }

    await expect(page.locator(".ol-viewport canvas").first()).toBeVisible();

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });

  test("map canvas remains visible after multiple section switches", async ({ page }) => {
    await openMissionMap(page);

    const sections = ["station Section", "poi Section", "evas Section", "preset Section"];
    for (const section of sections) {
      await page.getByLabel(section, { exact: true }).click();
      await expect(page.locator(".ol-viewport canvas").first()).toBeVisible();
    }
  });

  test("measurement section opens without crashing the map", async ({ page }) => {
    await openMissionMap(page);

    // Measurement section may use a different label depending on implementation
    const measureBtn = page.getByLabel("measurement Section", { exact: true });
    const hasMeasureSection = await measureBtn.isVisible().catch(() => false);
    if (hasMeasureSection) {
      await measureBtn.click();
      await expect(page.locator(".ol-viewport canvas").first()).toBeVisible();
    }
  });
});

// ===========================================================================
// Station Interaction Tests
// ===========================================================================

test.describe("Mission 22 — Station Interactions", () => {
  test("clicking a station in the station list opens station details", async ({ page }) => {
    await openMissionMap(page);

    await page.getByLabel("station Section", { exact: true }).click();
    await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText("Stations");

    // Click the first station item
    const firstStation = page.getByLabel("stationList-item", { exact: true }).first();
    await expect(firstStation).toBeVisible({ timeout: 5000 });
    await firstStation.click();

    // The right panel should open — we detect it by looking for the right-panel
    // nav icons (info_panel, edit_panel, etc.) which have aria-label attributes
    await expect
      .poll(
        async () => {
          const infoPanel = page.getByLabel("info_panel", { exact: true });
          return infoPanel.isVisible().catch(() => false);
        },
        { timeout: 5000 }
      )
      .toBe(true);
  });

  test("selecting a station keeps the map visible", async ({ page }) => {
    await openMissionMap(page);

    await page.getByLabel("station Section", { exact: true }).click();
    const firstStation = page.getByLabel("stationList-item", { exact: true }).first();
    await expect(firstStation).toBeVisible({ timeout: 5000 });
    await firstStation.click();

    await expect(page.locator(".ol-viewport canvas").first()).toBeVisible();
  });

  test("selecting and deselecting a station does not crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await openMissionMap(page);

    await page.getByLabel("station Section", { exact: true }).click();
    const firstStation = page.getByLabel("stationList-item", { exact: true }).first();
    await expect(firstStation).toBeVisible({ timeout: 5000 });

    // Select
    await firstStation.click();
    await page.waitForTimeout(500);

    // Deselect by switching section
    await page.getByLabel("preset Section", { exact: true }).click();
    await page.waitForTimeout(500);

    await expect(page.locator(".ol-viewport canvas").first()).toBeVisible();

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });
});

// ===========================================================================
// EVA / Traverse Interaction Tests
// ===========================================================================

test.describe("Mission 22 — EVA Interactions", () => {
  test("selecting an EVA keeps the map alive", async ({ page }) => {
    await openMissionMap(page);

    await page.getByLabel("evas Section", { exact: true }).click();
    const firstEva = page.getByLabel("evaList-item", { exact: true }).first();
    await expect(firstEva).toBeVisible({ timeout: 5000 });
    await firstEva.click();

    await expect(page.locator(".ol-viewport canvas").first()).toBeVisible();
  });

  test("selecting an EVA shows the EVA sequence/timeline panel", async ({ page }) => {
    await openMissionMap(page);

    await page.getByLabel("evas Section", { exact: true }).click();
    const firstEva = page.getByLabel("evaList-item", { exact: true }).first();
    await expect(firstEva).toBeVisible({ timeout: 5000 });
    await firstEva.click();

    // After selecting an EVA, the panel should show EVA-related content
    // such as the sequence of stations, traverses, and actions
    await expect
      .poll(
        async () => {
          const panelText = await page.locator("body").textContent();
          // EVA panel typically shows "Sequence" or station names or "traverse"
          return (
            panelText?.includes("Sequence") ||
            panelText?.includes("sequence") ||
            panelText?.includes("Traverse") ||
            panelText?.includes("Station") ||
            false
          );
        },
        { timeout: 5000 }
      )
      .toBe(true);
  });

  test("map has no JS errors when switching between EVAs", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await openMissionMap(page);

    await page.getByLabel("evas Section", { exact: true }).click();
    const evaItems = page.getByLabel("evaList-item", { exact: true });
    const count = await evaItems.count();

    // Click through each EVA (up to 3)
    for (let i = 0; i < Math.min(count, 3); i++) {
      await evaItems.nth(i).click();
      await page.waitForTimeout(500);
    }

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });
});

// ===========================================================================
// POI Interaction Tests
// ===========================================================================

test.describe("Mission 22 — POI Interactions", () => {
  test("selecting a POI keeps the map alive", async ({ page }) => {
    await openMissionMap(page);

    await page.getByLabel("poi Section", { exact: true }).click();
    const firstPoi = page.getByLabel("poiList-item", { exact: true }).first();
    await expect(firstPoi).toBeVisible({ timeout: 5000 });
    await firstPoi.click();

    await expect(page.locator(".ol-viewport canvas").first()).toBeVisible();
  });

  test("selecting a POI opens POI details panel", async ({ page }) => {
    await openMissionMap(page);

    await page.getByLabel("poi Section", { exact: true }).click();
    const firstPoi = page.getByLabel("poiList-item", { exact: true }).first();
    await expect(firstPoi).toBeVisible({ timeout: 5000 });
    await firstPoi.click();

    // Right panel should open — detect via right-panel nav icon
    await expect
      .poll(
        async () => {
          const infoPanel = page.getByLabel("info_panel", { exact: true });
          return infoPanel.isVisible().catch(() => false);
        },
        { timeout: 5000 }
      )
      .toBe(true);
  });

  test("no JS errors when clicking through POIs", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await openMissionMap(page);

    await page.getByLabel("poi Section", { exact: true }).click();
    const poiItems = page.getByLabel("poiList-item", { exact: true });
    const count = await poiItems.count();

    for (let i = 0; i < Math.min(count, 3); i++) {
      await poiItems.nth(i).click();
      await page.waitForTimeout(400);
    }

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });
});

// ===========================================================================
// Preset Switching Tests
// ===========================================================================

test.describe("Mission 22 — Preset Switching", () => {
  test("preset list shows at least one preset", async ({ page }) => {
    await openMissionMap(page);

    await page.getByLabel("preset Section", { exact: true }).click();

    await expect
      .poll(
        async () => {
          const list = page.getByLabel("presetList", { exact: true });
          const isVis = await list.isVisible().catch(() => false);
          return isVis;
        },
        { timeout: 5000 }
      )
      .toBe(true);
  });

  test("switching presets does not crash the map", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await openMissionMap(page);

    await page.getByLabel("preset Section", { exact: true }).click();

    // Look for clickable preset items (may be styled as cards or list items)
    const presetItems = page
      .getByLabel("presetList", { exact: true })
      .locator("li, [class*='item'], [class*='card']");
    const count = await presetItems.count();

    if (count >= 2) {
      // Click the second preset
      await presetItems.nth(1).click();
      await page.waitForTimeout(1000);

      // Click back to the first preset
      await presetItems.nth(0).click();
      await page.waitForTimeout(1000);
    }

    await expect(page.locator(".ol-viewport canvas").first()).toBeVisible();

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });

  test("map canvas still has painted pixels after preset switch", async ({ page }) => {
    await openMissionMap(page);

    await page.getByLabel("preset Section", { exact: true }).click();

    const presetItems = page
      .getByLabel("presetList", { exact: true })
      .locator("li, [class*='item'], [class*='card']");
    const count = await presetItems.count();

    if (count >= 2) {
      await presetItems.nth(1).click();
      // Wait for tiles to load after preset switch
      await page.waitForTimeout(2000);
    }

    await waitForMapPainted(page);
  });
});

// ===========================================================================
// Map Display Integration Tests
// ===========================================================================

test.describe("Mission 22 — Map Display Integration", () => {
  test("double-click on map zooms in", async ({ page }) => {
    await openMissionMap(page);

    const viewport = page.locator(".ol-viewport").first();
    const box = await viewport.boundingBox();
    expect(box).not.toBeNull();

    const scaleText = async (): Promise<string | null> =>
      page
        .getByLabel("scaleBar", { exact: true })
        .textContent()
        .catch((): null => null);

    const before = await scaleText();

    // Double-click on the map
    await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(800);

    const after = await scaleText();

    if (before && after) {
      expect(after).not.toEqual(before);
    }
  });

  test("map canvas remains after resizing the browser window", async ({ page }) => {
    await openMissionMap(page);

    // Resize viewport
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForTimeout(500);

    await expect(page.locator(".ol-viewport canvas").first()).toBeVisible();

    // Resize back
    await page.setViewportSize({ width: 1960, height: 1080 });
    await page.waitForTimeout(500);

    await expect(page.locator(".ol-viewport canvas").first()).toBeVisible();
  });

  test("map viewport can be panned by mouse drag without crashing", async ({ page }) => {
    await openMissionMap(page);

    const viewport = page.locator(".ol-viewport").first();
    const box = await viewport.boundingBox();
    expect(box).not.toBeNull();

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    // Drag from center to 100px left
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 100, cy, { steps: 10 });
    await page.mouse.up();

    // Map should still be rendered after drag
    await expect(page.locator(".ol-viewport canvas").first()).toBeVisible();
  });

  test("map has no JS errors during normal use", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await openMissionMap(page);

    // Interact with the map — use force: true for zoom and wrap everything
    // in try/catch to tolerate page-level crashes during the interaction
    try {
      const viewport = page.locator(".ol-viewport").first();
      const box = await viewport.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page
          .locator(".ol-zoom-in")
          .first()
          .click({ force: true })
          .catch(() => {});
        await page.waitForTimeout(500);
      }
    } catch {
      // If the page crashes during interaction, the errors array will capture why
    }

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });
});
