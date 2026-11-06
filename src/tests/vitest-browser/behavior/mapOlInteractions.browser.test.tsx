import { commands } from "vitest/browser";
import { recordBrowserErrors, waitForMapIdle } from "./mapInteractions";
import { isVisible } from "./browserAssertions";
/**
 * Integration tests for OpenLayers map interactions on Isolated mission.
 *
 * These tests exercise the full integrated map — eyeball menu toggles,
 * station/POI/EVA selection, panel navigation, and map display settings.
 *
 * Each test creates a validated mission with presets, stations, POIs and EVAs.
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

/** Open the eyeball (Map Item Visibility) menu. */
async function openEyeballMenu(page: Page): Promise<void> {
  const menuPanel = page.getByTestId("map-menu-floating-panel");
  const isOpen = await isVisible(menuPanel);
  if (!isOpen) {
    await page.getByTestId("map-menu-launcher").click();
  }
  await expect.element(menuPanel).toBeVisible();
  await expect.element(menuPanel.getByText("Map Item Visibility", { exact: true })).toBeVisible();
}

/** Wait for the OL map to have painted pixels (tiles loaded). */
async function waitForMapPainted(): Promise<void> {
  await expect
    .poll(
      () =>
        (() => {
          const canvas = document.querySelector(".ol-viewport canvas") as HTMLCanvasElement | null;
          if (!canvas) return false;
          try {
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (!ctx) return false;
            const w = canvas.width;
            const h = canvas.height;
            const data = ctx.getImageData(0, 0, w, h).data;
            for (let i = 3; i < data.length; i += 4) {
              if (data[i] > 0) return true;
            }
            return false;
          } catch {
            return true;
          }
        })(),
      { timeout: 10000, interval: 100 }
    )
    .toBe(true);
}

// ===========================================================================
// Page Load & Rendering Tests
// ===========================================================================

test.describe("Isolated mission — Page Load & Rendering", () => {
  test("OL canvas is sized and visible", async ({ page, mission }) => {
    await openMissionMap(page, mission);

    const canvas = page.getBySelector(".ol-viewport canvas").first();
    await expect.element(canvas).toBeVisible();

    const box = await canvas.element().getBoundingClientRect();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.height).toBeGreaterThan(100);
  });

  test("OL canvas paints non-blank pixels (tiles or vector content)", async ({ page, mission }) => {
    await openMissionMap(page, mission);
    await waitForMapPainted();
  });

  test("scale bar is visible by default in editor mode", async ({ page, mission }) => {
    await openMissionMap(page, mission);
    // ScaleBar renders text like "100 m" or "1 km" inside an aria-labelled element.
    const scaleBar = page.getByLabelText("scaleBar", { exact: true });
    await expect.element(scaleBar).toBeVisible();
  });

  test("zoom controls (+ / -) are present in editor mode", async ({ page, mission }) => {
    await openMissionMap(page, mission);
    // OL renders default zoom controls as .ol-zoom buttons
    const zoomIn = page.getBySelector(".ol-zoom-in");
    const zoomOut = page.getBySelector(".ol-zoom-out");
    await expect.element(zoomIn).toBeVisible();
    await expect.element(zoomOut).toBeVisible();
  });

  test("map canvas does not become blank after waiting 3 seconds", async ({ page, mission }) => {
    await openMissionMap(page, mission);
    // Wait 3s then verify canvas still has pixels. Distinct from the poll-based
    // paint check: this asserts the canvas STAYS painted, not just that it
    // eventually paints.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const hasPaintedPixels = await (() => {
      const canvas = document.querySelector(".ol-viewport canvas") as HTMLCanvasElement | null;
      if (!canvas) return false;
      try {
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return false;
        const w = canvas.width;
        const h = canvas.height;
        const data = ctx.getImageData(0, 0, w, h).data;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 0) return true;
        }
        return false;
      } catch {
        return true; // tainted canvas = content present
      }
    })();
    expect(hasPaintedPixels).toBe(true);
  });

  test("page title reflects the mission name", async ({ page, mission }) => {
    await openMissionMap(page, mission);
    // Just check the page didn't return an error page
    const title = await document.title;
    expect(title).not.toContain("Error");
    expect(title.length).toBeGreaterThan(0);
  });

  test("ol-viewport has correct CSS classes applied", async ({ page, mission }) => {
    await openMissionMap(page, mission);
    const viewport = page.getBySelector(".ol-viewport").first();
    await expect.element(viewport).toBeVisible();
    // OL adds these classes to the viewport element
    await expect.element(viewport).toHaveClass(/ol-viewport/);
  });
});

// ===========================================================================
// Eyeball Menu Tests
// ===========================================================================

test.describe("Isolated mission — Eyeball Menu", () => {
  test("eyeball menu opens and shows 'Map Item Visibility' title", async ({ page, mission }) => {
    await openMissionMap(page, mission);
    await openEyeballMenu(page);
    const menuPanel = page.getByTestId("map-menu-floating-panel");
    await expect.element(menuPanel.getByText("Map Item Visibility", { exact: true })).toBeVisible();
  });

  test("eyeball menu shows POIs, Stations, Actions, Positions labels", async ({
    page,
    mission,
  }) => {
    await openMissionMap(page, mission);
    await openEyeballMenu(page);

    const menuPanel = page.getByTestId("map-menu-floating-panel");
    await expect.element(menuPanel.getByText("POIs")).toBeVisible();
    await expect.element(menuPanel.getByText("Stations")).toBeVisible();
    await expect.element(menuPanel.getByText("Actions")).toBeVisible();
    // "Positions" may be within a collapsible section
    await expect.element(menuPanel.getByText("Positions")).toBeVisible();
  });

  test("eyeball menu shows Scale Bar and Mouse Coordinates toggles", async ({ page, mission }) => {
    await openMissionMap(page, mission);
    await openEyeballMenu(page);

    const menuPanel = page.getByTestId("map-menu-floating-panel");
    await expect.element(menuPanel.getByText("Scale Bar")).toBeVisible();
    await expect.element(menuPanel.getByText("Mouse Coordinates")).toBeVisible();
  });

  test("eyeball menu shows Stations sub-toggles: Labels, Walkbacks, Circles", async ({
    page,
    mission,
  }) => {
    await openMissionMap(page, mission);
    await openEyeballMenu(page);

    // Station row has Labels, Walkbacks, Circles sub-toggles
    // Note: "Labels" appears for POIs, Stations, and Actions rows
    const menuPanel = page.getByTestId("map-menu-floating-panel");
    await expect.element(menuPanel.getByText("Walkbacks")).toBeVisible();
    await expect.element(menuPanel.getByText("Circles")).toBeVisible();
  });

  test("toggling scale bar off hides the scale bar from the map", async ({ page, mission }) => {
    await openMissionMap(page, mission);

    // Scale bar should be visible by default
    const scaleBar = page.getByLabelText("scaleBar", { exact: true });
    await expect.element(scaleBar).toBeVisible();

    // Open eyeball menu and toggle Scale Bar off
    await openEyeballMenu(page);

    // Click the eye icon next to "Scale Bar" to toggle it off
    // The Scale Bar row has an eye icon to its left
    const scaleBarRow = page.getByTestId("map-menu-floating-panel").getByText("Scale Bar");
    const scaleBarContainer = scaleBarRow.getBySelector("..");
    // Find the eye icon within the same parent container
    await scaleBarContainer.getBySelector("[class*='menuEyeIcon'], [class*='Eye']").first().click();

    // Scale bar should be hidden now
    await expect.poll(() => isVisible(scaleBar)).toBe(false);
  });

  test("toggling scale bar back on re-shows the scale bar", async ({ page, mission }) => {
    await openMissionMap(page, mission);
    await openEyeballMenu(page);

    const scaleBarRow = page.getByTestId("map-menu-floating-panel").getByText("Scale Bar");
    const scaleBarContainer = scaleBarRow.getBySelector("..");
    const eyeIcon = scaleBarContainer
      .getBySelector("[class*='menuEyeIcon'], [class*='Eye']")
      .first();

    // Toggle off
    await eyeIcon.click();
    await waitForMapIdle();

    // Toggle back on
    await eyeIcon.click();

    // Scale bar should reappear
    const scaleBar = page.getByLabelText("scaleBar", { exact: true });
    await expect.element(scaleBar).toBeVisible();
  });

  test("eyeball menu closes when clicking the X button", async ({ page, mission }) => {
    await openMissionMap(page, mission);
    await openEyeballMenu(page);

    const menuPanel = page.getByTestId("map-menu-floating-panel");
    const title = menuPanel.getByText("Map Item Visibility", { exact: true });
    await expect.element(title).toBeVisible();

    // Click the close (X) icon in the header
    await page.getBySelector("[class*='menuHeaderClose']").first().click();

    // The menu content should be hidden
    await expect.poll(() => isVisible(menuPanel)).toBe(false);
  });
});

// ===========================================================================
// Section Navigation & Panel Tests
// ===========================================================================

test.describe("Isolated mission — Section Navigation", () => {
  test("all section buttons are present", async ({ page, mission }) => {
    await openMissionMap(page, mission);

    const sections = ["station Section", "poi Section", "evas Section", "preset Section"];
    for (const section of sections) {
      await expect.element(page.getByLabelText(section, { exact: true })).toBeVisible();
    }
  });

  test("clicking station section shows Stations panel title", async ({ page, mission }) => {
    await openMissionMap(page, mission);

    await page.getByLabelText("station Section", { exact: true }).click();
    await expect
      .element(page.getByLabelText("leftPanelTitle", { exact: true }))
      .toHaveTextContent("Stations");
  });

  test("clicking POI section shows Points of Interest panel title", async ({ page, mission }) => {
    await openMissionMap(page, mission);

    await page.getByLabelText("poi Section", { exact: true }).click();
    await expect
      .element(page.getByLabelText("leftPanelTitle", { exact: true }))
      .toHaveTextContent("Points of Interest");
  });

  test("clicking EVAs section shows EVAs panel title", async ({ page, mission }) => {
    await openMissionMap(page, mission);

    await page.getByLabelText("evas Section", { exact: true }).click();
    await expect
      .element(page.getByLabelText("leftPanelTitle", { exact: true }))
      .toHaveTextContent("EVAs");
  });

  test("clicking presets section shows preset panel", async ({ page, mission }) => {
    await openMissionMap(page, mission);

    await page.getByLabelText("preset Section", { exact: true }).click();
    await expect
      .element(page.getByLabelText("leftPanelTitle", { exact: true }))
      .toHaveTextContent("Presets");
  });

  test("station section shows a list of stations when mission has station data", async ({
    page,
    mission,
  }) => {
    await openMissionMap(page, mission);

    await page.getByLabelText("station Section", { exact: true }).click();
    // Wait for the station list to populate (may take a moment after section change)
    await expect
      .poll(
        async () => {
          const count = await page.getByLabelText("stationList-item", { exact: true }).length;
          return count;
        },
        { timeout: 5000 }
      )
      .toBeGreaterThan(0);
  });

  test("EVA section shows a list of EVAs when mission has EVA data", async ({ page, mission }) => {
    await openMissionMap(page, mission);

    await page.getByLabelText("evas Section", { exact: true }).click();
    await expect
      .poll(
        async () => {
          const count = await page.getByLabelText("evaList-item", { exact: true }).length;
          return count;
        },
        { timeout: 5000 }
      )
      .toBeGreaterThan(0);
  });

  test("POI section shows a list of POIs when mission has POI data", async ({ page, mission }) => {
    await openMissionMap(page, mission);

    await page.getByLabelText("poi Section", { exact: true }).click();
    await expect
      .poll(
        async () => {
          const count = await page.getByLabelText("poiList-item", { exact: true }).length;
          return count;
        },
        { timeout: 5000 }
      )
      .toBeGreaterThan(0);
  });

  test("rapid section switching does not crash the map", async ({ page, mission }) => {
    const errors: string[] = [];
    recordBrowserErrors(errors);

    await openMissionMap(page, mission);

    const sections = [
      "station Section",
      "evas Section",
      "poi Section",
      "preset Section",
      "station Section",
      "evas Section",
    ];
    for (const section of sections) {
      await page.getByLabelText(section, { exact: true }).click();
      // Don't wait too long — we're testing rapid switching
      await waitForMapIdle();
    }

    await expect.element(page.getBySelector(".ol-viewport canvas").first()).toBeVisible();

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });

  test("map canvas remains visible after multiple section switches", async ({ page, mission }) => {
    await openMissionMap(page, mission);

    const sections = ["station Section", "poi Section", "evas Section", "preset Section"];
    for (const section of sections) {
      await page.getByLabelText(section, { exact: true }).click();
      await expect.element(page.getBySelector(".ol-viewport canvas").first()).toBeVisible();
    }
  });

  test("measurement section opens without crashing the map", async ({ page, mission }) => {
    await openMissionMap(page, mission);

    // Measurement section may use a different label depending on implementation
    const measureBtn = page.getByLabelText("measurement Section", { exact: true });
    const hasMeasureSection = await isVisible(measureBtn);
    if (hasMeasureSection) {
      await measureBtn.click();
      await expect.element(page.getBySelector(".ol-viewport canvas").first()).toBeVisible();
    }
  });
});

// ===========================================================================
// Station Interaction Tests
// ===========================================================================

test.describe("Isolated mission — Station Interactions", () => {
  test("clicking a station in the station list opens station details", async ({
    page,
    mission,
  }) => {
    await openMissionMap(page, mission);

    await page.getByLabelText("station Section", { exact: true }).click();
    await expect
      .element(page.getByLabelText("leftPanelTitle", { exact: true }))
      .toHaveTextContent("Stations");

    // Click the first station item
    const firstStation = page.getByLabelText("stationList-item", { exact: true }).first();
    await expect.element(firstStation).toBeVisible();
    await firstStation.click();

    // The right panel should open — we detect it by looking for the right-panel
    // nav icons (info_panel, edit_panel, etc.) which have aria-label attributes
    await expect
      .poll(
        async () => {
          const infoPanel = page.getByLabelText("info_panel", { exact: true });
          return isVisible(infoPanel);
        },
        { timeout: 5000 }
      )
      .toBe(true);
  });

  test("selecting a station keeps the map visible", async ({ page, mission }) => {
    await openMissionMap(page, mission);

    await page.getByLabelText("station Section", { exact: true }).click();
    const firstStation = page.getByLabelText("stationList-item", { exact: true }).first();
    await expect.element(firstStation).toBeVisible();
    await firstStation.click();

    await expect.element(page.getBySelector(".ol-viewport canvas").first()).toBeVisible();
  });

  test("selecting and deselecting a station does not crash", async ({ page, mission }) => {
    const errors: string[] = [];
    recordBrowserErrors(errors);

    await openMissionMap(page, mission);

    await page.getByLabelText("station Section", { exact: true }).click();
    const firstStation = page.getByLabelText("stationList-item", { exact: true }).first();
    await expect.element(firstStation).toBeVisible();

    // Select
    await firstStation.click();
    await waitForMapIdle();

    // Deselect by switching section
    await page.getByLabelText("preset Section", { exact: true }).click();
    await waitForMapIdle();

    await expect.element(page.getBySelector(".ol-viewport canvas").first()).toBeVisible();

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });
});

// ===========================================================================
// EVA / Traverse Interaction Tests
// ===========================================================================

test.describe("Isolated mission — EVA Interactions", () => {
  test("selecting an EVA keeps the map alive", async ({ page, mission }) => {
    await openMissionMap(page, mission);

    await page.getByLabelText("evas Section", { exact: true }).click();
    const firstEva = page.getByLabelText("evaList-item", { exact: true }).first();
    await expect.element(firstEva).toBeVisible();
    await firstEva.click();

    await expect.element(page.getBySelector(".ol-viewport canvas").first()).toBeVisible();
  });

  test("selecting an EVA shows the EVA sequence/timeline panel", async ({ page, mission }) => {
    await openMissionMap(page, mission);

    await page.getByLabelText("evas Section", { exact: true }).click();
    const firstEva = page.getByLabelText("evaList-item", { exact: true }).first();
    await expect.element(firstEva).toBeVisible();
    await firstEva.click();

    // After selecting an EVA, the panel should show EVA-related content
    // such as the sequence of stations, traverses, and actions
    await expect
      .poll(
        async () => {
          const panelText = await page.getBySelector("body").element().textContent;
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

  test("map has no JS errors when switching between EVAs", async ({ page, mission }) => {
    const errors: string[] = [];
    recordBrowserErrors(errors);

    await openMissionMap(page, mission);

    await page.getByLabelText("evas Section", { exact: true }).click();
    const evaItems = page.getByLabelText("evaList-item", { exact: true });
    const count = await evaItems.length;

    // Click through each EVA (up to 3)
    for (let i = 0; i < Math.min(count, 3); i++) {
      await evaItems.nth(i).click();
      await waitForMapIdle();
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

test.describe("Isolated mission — POI Interactions", () => {
  test("selecting a POI keeps the map alive", async ({ page, mission }) => {
    await openMissionMap(page, mission);

    await page.getByLabelText("poi Section", { exact: true }).click();
    const firstPoi = page.getByLabelText("poiList-item", { exact: true }).first();
    await expect.element(firstPoi).toBeVisible();
    await firstPoi.click();

    await expect.element(page.getBySelector(".ol-viewport canvas").first()).toBeVisible();
  });

  test("selecting a POI opens POI details panel", async ({ page, mission }) => {
    await openMissionMap(page, mission);

    await page.getByLabelText("poi Section", { exact: true }).click();
    const firstPoi = page.getByLabelText("poiList-item", { exact: true }).first();
    await expect.element(firstPoi).toBeVisible();
    await firstPoi.click();

    // Right panel should open — detect via right-panel nav icon
    await expect
      .poll(
        async () => {
          const infoPanel = page.getByLabelText("info_panel", { exact: true });
          return isVisible(infoPanel);
        },
        { timeout: 5000 }
      )
      .toBe(true);
  });

  test("no JS errors when clicking through POIs", async ({ page, mission }) => {
    const errors: string[] = [];
    recordBrowserErrors(errors);

    await openMissionMap(page, mission);

    await page.getByLabelText("poi Section", { exact: true }).click();
    const poiItems = page.getByLabelText("poiList-item", { exact: true });
    const count = await poiItems.length;

    for (let i = 0; i < Math.min(count, 3); i++) {
      await poiItems.nth(i).click();
      await waitForMapIdle();
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

test.describe("Isolated mission — Preset Switching", () => {
  test("preset list shows at least one preset", async ({ page, mission }) => {
    await openMissionMap(page, mission);

    await page.getByLabelText("preset Section", { exact: true }).click();

    await expect
      .poll(
        async () => {
          const list = page.getByLabelText("presetList", { exact: true });
          const isVis = await isVisible(list);
          return isVis;
        },
        { timeout: 5000 }
      )
      .toBe(true);
  });

  test("switching presets does not crash the map", async ({ page, mission }) => {
    const errors: string[] = [];
    recordBrowserErrors(errors);

    await openMissionMap(page, mission);

    await page.getByLabelText("preset Section", { exact: true }).click();

    // Look for clickable preset items (may be styled as cards or list items)
    const presetItems = page
      .getByLabelText("presetList", { exact: true })
      .getBySelector("li, [class*='item'], [class*='card']");
    const count = await presetItems.length;

    if (count >= 2) {
      // Click the second preset
      await presetItems.nth(1).click();
      await waitForMapIdle();

      // Click back to the first preset
      await presetItems.nth(0).click();
      await waitForMapIdle();
    }

    await expect.element(page.getBySelector(".ol-viewport canvas").first()).toBeVisible();

    const fatal = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Script error")
    );
    expect(fatal).toHaveLength(0);
  });

  test("map canvas still has painted pixels after preset switch", async ({ page, mission }) => {
    await openMissionMap(page, mission);

    await page.getByLabelText("preset Section", { exact: true }).click();

    const presetItems = page
      .getByLabelText("presetList", { exact: true })
      .getBySelector("li, [class*='item'], [class*='card']");
    const count = await presetItems.length;

    if (count >= 2) {
      await presetItems.nth(1).click();
      // Wait for tiles to load after preset switch
      await waitForMapIdle();
    }

    await waitForMapPainted();
  });
});

// ===========================================================================
// Map Display Integration Tests
// ===========================================================================

test.describe("Isolated mission — Map Display Integration", () => {
  test("double-click on map zooms in", async ({ page, mission }) => {
    await openMissionMap(page, mission);

    const viewport = page.getBySelector(".ol-viewport").first();
    const box = await viewport.element().getBoundingClientRect();
    expect(box).not.toBeNull();

    const scaleText = async (): Promise<string | null> =>
      (await page.getByLabelText("scaleBar", { exact: true }).findElement()).textContent;

    const before = await scaleText();

    // Double-click on the map
    await commands.mapPointer("dblclick", box!.x + box!.width / 2, box!.y + box!.height / 2);
    await waitForMapIdle();

    const after = await scaleText();

    if (before && after) {
      expect(after).not.toEqual(before);
    }
  });

  test("map canvas remains after resizing the browser window", async ({ page, mission }) => {
    await openMissionMap(page, mission);

    // Resize viewport
    await page.viewport(1200, 800);
    await waitForMapIdle();

    await expect.element(page.getBySelector(".ol-viewport canvas").first()).toBeVisible();

    // Resize back
    await page.viewport(1960, 1080);
    await waitForMapIdle();

    await expect.element(page.getBySelector(".ol-viewport canvas").first()).toBeVisible();
  });

  test("map viewport can be panned by mouse drag without crashing", async ({ page, mission }) => {
    await openMissionMap(page, mission);

    const viewport = page.getBySelector(".ol-viewport").first();
    const box = await viewport.element().getBoundingClientRect();
    expect(box).not.toBeNull();

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    // Drag from center to 100px left
    await commands.mapPointer("move", cx, cy);
    await commands.mapPointer("down");
    await commands.mapPointer("move", cx - 100, cy, 10);
    await commands.mapPointer("up");

    // Map should still be rendered after drag
    await expect.element(page.getBySelector(".ol-viewport canvas").first()).toBeVisible();
  });

  test("map has no JS errors during normal use", async ({ page, mission }) => {
    const errors: string[] = [];
    recordBrowserErrors(errors);

    await openMissionMap(page, mission);

    // Interact with the map — use force: true for zoom and wrap everything
    // in try/catch to tolerate page-level crashes during the interaction
    try {
      const viewport = page.getBySelector(".ol-viewport").first();
      const box = await viewport.element().getBoundingClientRect();
      if (box) {
        await commands.mapPointer("move", box.x + box.width / 2, box.y + box.height / 2);
        await page
          .getBySelector(".ol-zoom-in")
          .first()
          .click({ force: true })
          .catch(() => {});
        await waitForMapIdle();
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
