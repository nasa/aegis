import { exactText } from "./browserAssertions";
import { commands } from "vitest/browser";
import type { BrowserPage as Page } from "vitest/browser";
import { test as base, expect } from "./missionHarness";
import { readMapFeatures } from "./mapObserver";
import { expectMapLabel } from "./mapInteractions";

const test = base.extend({ scenario: "execution" as BehavioralScenario });

async function openDashboardVisibilityMenu(page: Page): Promise<void> {
  const dashboardMap = page.getBySelector('[data-map-mode="dashboard"]');
  await expect.element(dashboardMap.getBySelector(".ol-viewport")).toBeVisible();
  await commands.mapPointer("move", 0, 0);
  await dashboardMap.hover();
  // The dashboard has an inline eye menu that is revealed while the map is hovered.
  await dashboardMap.getBySelector('svg[data-icon="eye"]').first().click();
  await expect
    .element(dashboardMap.getByText("Map Item Visibility", { exact: true }))
    .toBeVisible();
}

async function expectScaleBars(page: Page, visible: boolean): Promise<void> {
  for (const mode of ["dashboard", "minimap"]) {
    const map = page.getBySelector(`[data-map-mode="${mode}"]`);
    await expect.element(map.getBySelector(".ol-viewport")).toBeVisible();
    await expect
      .poll(() => map.getByLabelText("scaleBar", { exact: true }).length)
      .toBe(visible ? 1 : 0);
    if (visible) {
      await expect.element(map.getByLabelText("scaleBar", { exact: true })).toBeVisible();
      await expect
        .element(map.getByLabelText("scaleBar", { exact: true }))
        .toHaveTextContent(/^\d+(\.\d+)? (m|km)$/);
    }
  }
}

test.describe("Dashboard and minimap display contracts", () => {
  test("dashboard scale-bar changes reach both maps and persist together after remount", async ({
    page,
    mission,
  }) => {
    await mission.openDashboard();
    await expect
      .element(page.getByTestId("dashboard-pet-clock"))
      .toHaveTextContent(exactText("+00:05:00"));
    await expectScaleBars(page, true);

    await openDashboardVisibilityMenu(page);
    await page
      .getBySelector('[data-map-mode="dashboard"]')
      .getByText("Scale Bar", { exact: true })
      .click();
    await expectScaleBars(page, false);

    await mission.openDashboard();
    await expect
      .element(page.getByTestId("dashboard-pet-clock"))
      .toHaveTextContent(exactText("+00:05:00"));
    await expectScaleBars(page, false);
    await openDashboardVisibilityMenu(page);
    await page
      .getBySelector('[data-map-mode="dashboard"]')
      .getByText("Scale Bar", { exact: true })
      .click();
    await expectScaleBars(page, true);

    await mission.openDashboard();
    await expect
      .element(page.getByTestId("dashboard-pet-clock"))
      .toHaveTextContent(exactText("+00:05:00"));
    await expectScaleBars(page, true);
  });

  test("minimap stations and dashboard position age belong solely to the active execution", async ({
    page,
    mission,
  }) => {
    const stationIds = async () =>
      (await readMapFeatures("minimap"))
        .filter((feature) => feature.layerZIndex === 14 && feature.visible)
        .map((feature) => feature.id)
        .sort();

    await mission.openDashboard();
    await expect
      .element(page.getByTestId("dashboard-pet-clock"))
      .toHaveTextContent(exactText("+00:05:00"));
    await expect.poll(stationIds).toEqual([mission.ids.rexStationB]);
    await expectMapLabel("+00:03:00 / 1 (C)", "dashboard");
    await expect
      .poll(async () =>
        (await readMapFeatures("dashboard"))
          .filter((feature) => feature.labelType === "pos" && feature.visible)
          .map((feature) => feature.id)
      )
      .toEqual([`pos-${mission.ids.posB}`]);

    await mission.openDashboard();
    await expect
      .element(page.getByTestId("dashboard-pet-clock"))
      .toHaveTextContent(exactText("+00:05:00"));
    await expect.poll(stationIds).toEqual([mission.ids.rexStationB]);
    await expectMapLabel("+00:03:00 / 1 (C)", "dashboard");
  });
});
