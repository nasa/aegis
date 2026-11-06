import { exactText } from "./browserAssertions";
import { test as base, expect } from "./missionHarness";
import { readMapFeatures } from "./mapObserver";
import { selectExecution } from "./executionHelpers";

const test = base.extend({ scenario: "execution" as BehavioralScenario });

test("active execution selection renders the big map and minimap with their own station scopes", async ({
  page,
  mission,
}) => {
  await mission.open();
  await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);

  const expectActiveMaps = async () => {
    await expect
      .element(page.getByTestId("dashboard-pet-clock"))
      .toHaveTextContent(exactText("+00:05:00"));
    await expect
      .poll(() => page.getByText("No EVA is currently running.", { exact: true }).length)
      .toBe(0);
    await expect.poll(() => page.getBySelector(".ol-viewport").length).toBe(2);
    for (const mode of ["dashboard", "minimap"] as const) {
      const map = page.getBySelector(`[data-map-mode="${mode}"]`);
      await expect.element(map.getBySelector(".ol-viewport")).toBeVisible();
      await expect.element(map.getBySelector("canvas").first()).toBeVisible();
      await expect
        .poll(async () =>
          (await readMapFeatures(mode))
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
          (await readMapFeatures(mode))
            .filter((feature) => feature.layerZIndex === 23 && feature.visible)
            .map((feature) => feature.id)
        )
        .toEqual([mission.ids.posB]);
    }
  };

  await mission.openDashboard();
  await expectActiveMaps();
  await mission.openDashboard();
  await expectActiveMaps();
});
