import { test, expect } from "../fixtures/behavioralTest";
import { MISSION_NAMES } from "../fixtures/missionSeed";

test.describe("Core application contracts @smoke", () => {
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
});
