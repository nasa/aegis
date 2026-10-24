import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { expectMapLabel, readMapFeatures } from "../fixtures/mapAssertions";

test.use({ scenario: "execution" });

async function openDashboardVisibilityMenu(page: Page): Promise<void> {
  const dashboardMap = page.locator('[data-map-mode="dashboard"]');
  await expect(dashboardMap.locator(".ol-viewport")).toBeVisible();
  await dashboardMap.hover();
  // The dashboard has an inline eye menu that is revealed while the map is hovered.
  await dashboardMap.locator('svg[data-icon="eye"]').first().click();
  await expect(dashboardMap.getByText("Map Item Visibility", { exact: true })).toBeVisible();
}

async function expectScaleBars(page: Page, visible: boolean): Promise<void> {
  for (const mode of ["dashboard", "minimap"]) {
    const map = page.locator(`[data-map-mode="${mode}"]`);
    await expect(map.locator(".ol-viewport")).toBeVisible();
    await expect(map.getByLabel("scaleBar", { exact: true })).toHaveCount(visible ? 1 : 0);
    if (visible) {
      await expect(map.getByLabel("scaleBar", { exact: true })).toBeVisible();
      await expect(map.getByLabel("scaleBar", { exact: true })).toHaveText(/^\d+(\.\d+)? (m|km)$/);
    }
  }
}

test.describe("Dashboard and minimap display contracts", () => {
  test("dashboard scale-bar changes reach both maps and persist together after reload", async ({
    page,
    mission,
  }) => {
    await page.goto(mission.dashboardUrl);
    await expect(page.getByTestId("dashboard-pet-clock")).toHaveText("+00:05:00");
    await expectScaleBars(page, true);

    await openDashboardVisibilityMenu(page);
    await page
      .locator('[data-map-mode="dashboard"]')
      .getByText("Scale Bar", { exact: true })
      .click();
    await expectScaleBars(page, false);

    await page.reload();
    await expect(page.getByTestId("dashboard-pet-clock")).toHaveText("+00:05:00");
    await expectScaleBars(page, false);
    await openDashboardVisibilityMenu(page);
    await page
      .locator('[data-map-mode="dashboard"]')
      .getByText("Scale Bar", { exact: true })
      .click();
    await expectScaleBars(page, true);

    await page.reload();
    await expect(page.getByTestId("dashboard-pet-clock")).toHaveText("+00:05:00");
    await expectScaleBars(page, true);
  });

  test("minimap stations and dashboard position age belong solely to the active execution", async ({
    page,
    mission,
  }) => {
    const stationIds = async () =>
      (await readMapFeatures(page, "minimap"))
        .filter((feature) => feature.layerZIndex === 14 && feature.visible)
        .map((feature) => feature.id)
        .sort();

    await page.goto(mission.dashboardUrl);
    await expect(page.getByTestId("dashboard-pet-clock")).toHaveText("+00:05:00");
    await expect.poll(stationIds).toEqual([mission.ids.rexStationB]);
    await expectMapLabel(page, "+00:03:00 / 1 (C)", "dashboard");
    await expect
      .poll(async () =>
        (await readMapFeatures(page, "dashboard"))
          .filter((feature) => feature.labelType === "pos" && feature.visible)
          .map((feature) => feature.id)
      )
      .toEqual([`pos-${mission.ids.posB}`]);

    await page.reload();
    await expect(page.getByTestId("dashboard-pet-clock")).toHaveText("+00:05:00");
    await expect.poll(stationIds).toEqual([mission.ids.rexStationB]);
    await expectMapLabel(page, "+00:03:00 / 1 (C)", "dashboard");
  });
});
