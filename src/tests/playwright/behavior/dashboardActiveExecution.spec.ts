import { test, expect } from "../fixtures/behavioralTest";
import { readMapFeatures } from "../fixtures/mapAssertions";
import { selectExecution } from "./executionHelpers";

test.use({ scenario: "execution" });

test("active execution selection renders the big map and minimap with their own station scopes", async ({
  page,
  mission,
}) => {
  await mission.open(page);
  await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);

  const expectActiveMaps = async () => {
    await expect(page.getByTestId("dashboard-pet-clock")).toHaveText("+00:05:00");
    await expect(page.getByText("No EVA is currently running.", { exact: true })).toHaveCount(0);
    await expect(page.locator(".ol-viewport")).toHaveCount(2);
    for (const mode of ["dashboard", "minimap"] as const) {
      const map = page.locator(`[data-map-mode="${mode}"]`);
      await expect(map.locator(".ol-viewport")).toBeVisible();
      await expect(map.locator("canvas").first()).toBeVisible();
      await expect
        .poll(async () =>
          (await readMapFeatures(page, mode))
            .filter((feature) => feature.layerZIndex === 14 && feature.visible)
            .map((feature) => feature.id)
            .sort()
        )
        .toEqual(
          (mode === "dashboard"
            ? [mission.ids.stationA, mission.ids.stationB, mission.ids.rexStationB]
            : [mission.ids.rexStationB]
          ).sort()
        );
      await expect
        .poll(async () =>
          (await readMapFeatures(page, mode))
            .filter((feature) => feature.layerZIndex === 23 && feature.visible)
            .map((feature) => feature.id)
        )
        .toEqual([mission.ids.posB]);
    }
  };

  await page.goto(mission.dashboardUrl);
  await expectActiveMaps();
  await page.reload();
  await expectActiveMaps();
});
