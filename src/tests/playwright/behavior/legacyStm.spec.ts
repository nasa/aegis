import { test, expect } from "../fixtures/behavioralTest";

const ids = {
  level1: "70000000-0000-4000-8000-000000000001",
  level2: "70000000-0000-4000-8000-000000000002",
  level3: "70000000-0000-4000-8000-000000000003",
  level3b: "70000000-0000-4000-8000-000000000004",
  actionB: "70000000-0000-4000-8000-000000000005",
  actionC: "70000000-0000-4000-8000-000000000006",
  actionD: "70000000-0000-4000-8000-000000000007",
  rexSkippedAction: "70000000-0000-4000-8000-000000000008",
};

test.describe("legacy STM v1", () => {
  test.use({ scenario: "execution" });

  test("admin hierarchy edits persist into the v1 viewer without exposing v2 rules", async ({
    page,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.actionSystemVersion = 1;
      doc.stmLevel1Enabled = true;
      doc.stmLevel1Name = "Objective";
      doc.stmLevel2Name = "Goal";
      doc.stmLevel3Name = "Investigation";
      doc.stmLevel1s[ids.level1] = {
        uuid: ids.level1,
        name: "Planetary science",
        numbering: "1",
        createdAt: 1,
        updatedAt: 1,
      };
      doc.stmLevel2s[ids.level2] = {
        uuid: ids.level2,
        name: "Surface samples",
        numbering: "a",
        level1Uuid: ids.level1,
        createdAt: 1,
        updatedAt: 1,
      };
      doc.stmLevel3s[ids.level3] = {
        uuid: ids.level3,
        name: "Identify regolith composition",
        numbering: "1",
        level2Uuid: ids.level2,
        createdAt: 1,
        updatedAt: 1,
      };
      doc.stmLevel3s[ids.level3b] = {
        uuid: ids.level3b,
        name: "Compare local strata",
        numbering: "2",
        level2Uuid: ids.level2,
        createdAt: 1,
        updatedAt: 1,
      };
    });

    await page.goto(`/admin/mission_stm/${mission.id}`);
    await expect(page.getByRole("heading", { name: "Mission STM", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit", exact: true }).first().click();
    await page.locator("#editLevel1Name").fill("Lunar science");
    await page.getByRole("button", { name: "Save", exact: true }).first().click();
    await expect
      .poll(async () => (await mission.read()).stmLevel1s[ids.level1].name)
      .toBe("Lunar science");

    await page.getByRole("button", { name: "Edit", exact: true }).nth(2).click();
    await page.locator("#editLevel1Numbering").fill("3");
    await page.locator("#editLevel1Name").fill("Confirm mineral makeup");
    await page.getByRole("button", { name: "Save", exact: true }).first().click();
    await expect
      .poll(async () => (await mission.read()).stmLevel3s[ids.level3])
      .toMatchObject({ numbering: "3", name: "Confirm mineral makeup", level2Uuid: ids.level2 });

    const persisted = await mission.read();
    expect(persisted.stmLevel1s[ids.level1]).toMatchObject({
      name: "Lunar science",
      numbering: "1",
    });
    expect(persisted.stmLevel2s[ids.level2]).toMatchObject({
      name: "Surface samples",
      numbering: "a",
    });
    expect(Object.keys(persisted.stmLevel3s).sort()).toEqual([ids.level3, ids.level3b].sort());
    expect(persisted.stmRules).toEqual({});

    await mission.open(page);
    await page.getByLabel("stmViewer Section", { exact: true }).click();
    await expect(page.getByText("Lunar science", { exact: true })).toBeVisible();
    await expect(page.getByText("Objectives", { exact: true })).toBeVisible();
    await expect(page.getByText("Goals", { exact: true })).toBeVisible();
    await expect(page.getByText("Investigations", { exact: true })).toBeVisible();
    await expect(page.getByText("Confirm mineral makeup", { exact: true })).toBeVisible();
    await expect(page.getByLabel("stmRules Section", { exact: true })).toHaveCount(0);
  });
});
