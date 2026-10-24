import { test, expect } from "../fixtures/behavioralTest";
import { MISSION_NAMES } from "../fixtures/missionSeed";
import { expectMapLabel } from "../fixtures/mapAssertions";

test.describe("Core application contracts @smoke", () => {
  test("an isolated mission exposes its planned EVAs, stations, POIs and map", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    await page.getByLabel("evas Section", { exact: true }).click();
    await expect(page.getByLabel("evaList-item")).toHaveCount(2);
    await expect(
      page.getByLabel("evaList-item").filter({ hasText: MISSION_NAMES.evaA })
    ).toBeVisible();
    await expect(
      page.getByLabel("evaList-item").filter({ hasText: MISSION_NAMES.evaB })
    ).toBeVisible();

    await page.getByLabel("station Section", { exact: true }).click();
    await expect(
      page.getByLabel("stationList-item").filter({ hasText: MISSION_NAMES.stationA })
    ).toBeVisible();
    await expect(
      page.getByLabel("stationList-item").filter({ hasText: MISSION_NAMES.stationB })
    ).toBeVisible();
    await page.getByLabel("poi Section", { exact: true }).click();
    await expect(
      page.getByLabel("poiList-item").filter({ hasText: MISSION_NAMES.poiA })
    ).toBeVisible();
    await expect(page.locator('[data-map-mode="editor"] canvas').first()).toBeVisible();
  });

  test("mission identity and fixture relationships survive a fresh browser load", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    await page.reload();
    await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(mission.name);
    await page.getByLabel("evas Section", { exact: true }).click();
    await page
      .getByLabel("evaList-item")
      .filter({ hasText: MISSION_NAMES.evaA })
      .getByText(MISSION_NAMES.evaA, { exact: true })
      .click();
    await expect(page.getByText(MISSION_NAMES.traverseA, { exact: true }).first()).toBeVisible();
    const doc = await mission.read();
    expect(doc.evas[mission.ids.evaA].sequence.map((item) => item.uuid)).toContain(
      mission.ids.stationA
    );
    expect(doc.actions[mission.ids.actionA].stationUuid).toBe(mission.ids.stationA);
  });

  test("the dashboard explicitly reports that no execution is running", async ({
    page,
    mission,
  }) => {
    await page.goto(mission.dashboardUrl);
    await expect(page.getByText("No EVA is currently running.", { exact: true })).toBeVisible();
    await expect(page.locator('[data-map-mode="dashboard"]')).toHaveCount(0);
    await expect(page.getByTestId("dashboard-pet-clock")).toHaveCount(0);
  });
});

test.describe("Active dashboard contracts @smoke", () => {
  test.use({ scenario: "execution" });

  test("dashboard clock and both maps belong to the active execution", async ({
    page,
    mission,
  }) => {
    await page.goto(mission.dashboardUrl);
    await expect(page.getByTestId("dashboard-pet-clock")).toHaveText("+00:05:00");
    await expect(page.locator('[data-map-mode="dashboard"] .ol-viewport')).toHaveCount(1);
    await expect(page.locator('[data-map-mode="minimap"] .ol-viewport')).toHaveCount(1);
    await expectMapLabel(page, "+00:03:00 / 1 (C)", "dashboard");
  });
});
