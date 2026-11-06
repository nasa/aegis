/**
 * Cross-section workflow tests for the OpenLayers map on Isolated mission.
 *
 * These tests exercise multi-step workflows that span across sections:
 * select an EVA → view its stations → switch back to stations section, etc.
 * They verify that state persists and the map doesn't crash through complex
 * user journeys.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { waitForPageReady } from "../helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function openMissionMap(page: Page, mission: BehavioralMission): Promise<void> {
  await page.goto(mission.url);
  await waitForPageReady(page);
  await page.locator(".ol-viewport").first().waitFor({ state: "visible", timeout: 15000 });
}

// ===========================================================================
// Edge Cases & Error Resilience
// ===========================================================================

test.describe("Isolated mission — Edge Cases", () => {
  test("loading mission page with a non-existent hash fragment does not crash", async ({
    page,
    mission,
  }) => {
    await page.goto(`${mission.url}#nonexistent`);
    await waitForPageReady(page);
    // The map should still load
    await page.locator(".ol-viewport").first().waitFor({ state: "visible", timeout: 15000 });
    await expect(page.locator(".ol-viewport canvas").first()).toBeVisible();
  });

  test("page reloads cleanly (no JS errors on hard reload)", async ({ page, mission }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await openMissionMap(page, mission);
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

test.describe("Isolated mission — Page Navigation", () => {
  test("navigating directly to a mission loads the map", async ({ page, mission }) => {
    await page.goto(mission.url);
    await waitForPageReady(page);
    await expect(page.locator(".ol-viewport").first()).toBeVisible({ timeout: 15000 });
  });

  test("navigating away and back restores the map", async ({ page, mission }) => {
    await page.goto(mission.url);
    await waitForPageReady(page);
    await page.locator(".ol-viewport").first().waitFor({ state: "visible", timeout: 15000 });

    // Navigate away to the mission listing
    await page.goto("http://localhost:4000/");
    await waitForPageReady(page);

    // Navigate back
    await page.goto(mission.url);
    await waitForPageReady(page);
    await expect(page.locator(".ol-viewport").first()).toBeVisible({ timeout: 15000 });
  });
});
