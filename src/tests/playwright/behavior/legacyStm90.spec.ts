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

  test("legacy STM filters plan cells and keeps execution copies out of plan coverage", async ({
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
        name: "Known objective",
        numbering: "4",
        createdAt: 1,
        updatedAt: 1,
      };
      doc.stmLevel2s[ids.level2] = {
        uuid: ids.level2,
        name: "Known goal",
        numbering: "b",
        level1Uuid: ids.level1,
        createdAt: 1,
        updatedAt: 1,
      };
      doc.stmLevel3s[ids.level3] = {
        uuid: ids.level3,
        name: "Known sample target",
        numbering: "1",
        level2Uuid: ids.level2,
        createdAt: 1,
        updatedAt: 1,
      };
      doc.stmLevel3s[ids.level3b] = {
        uuid: ids.level3b,
        name: "Known photo target",
        numbering: "2",
        level2Uuid: ids.level2,
        createdAt: 1,
        updatedAt: 1,
      };

      const sample = doc.actions[mission.ids.actionA];
      sample.stmPriorities = { [ids.level3]: 1 };
      sample.enabled = true;
      const disabledSample = JSON.parse(JSON.stringify(sample)) as Action;
      disabledSample.uuid = ids.actionB;
      disabledSample.refUuid = "80000000-0000-4000-8000-000000000005";
      disabledSample.name = "Disabled sample";
      disabledSample.stmPriorities = { [ids.level3]: 3 };
      disabledSample.enabled = false;
      doc.actions[ids.actionB] = disabledSample;
      doc.stations[mission.ids.stationA].actionOrderUuids.push(ids.actionB);

      const photo = JSON.parse(JSON.stringify(sample)) as Action;
      photo.uuid = ids.actionC;
      photo.refUuid = "80000000-0000-4000-8000-000000000006";
      photo.name = "Known photo action";
      photo.stationUuid = mission.ids.stationB;
      photo.poiUuid = null;
      photo.type = "photo";
      photo.stmPriorities = { [ids.level3b]: 2 };
      doc.actions[ids.actionC] = photo;
      doc.stations[mission.ids.stationB].actionOrderUuids.push(ids.actionC);

      const disabledPhoto = JSON.parse(JSON.stringify(photo)) as Action;
      disabledPhoto.uuid = ids.actionD;
      disabledPhoto.refUuid = "80000000-0000-4000-8000-000000000007";
      disabledPhoto.name = "Disabled photo action";
      disabledPhoto.stmPriorities = { [ids.level3b]: 3 };
      disabledPhoto.enabled = false;
      doc.actions[ids.actionD] = disabledPhoto;
      doc.stations[mission.ids.stationB].actionOrderUuids.push(ids.actionD);

      const skippedRexAction = JSON.parse(JSON.stringify(photo)) as Action;
      skippedRexAction.uuid = ids.rexSkippedAction;
      skippedRexAction.refUuid = "80000000-0000-4000-8000-000000000008";
      skippedRexAction.name = "Skipped REX photo";
      skippedRexAction.stationUuid = mission.ids.rexStationB;
      skippedRexAction.poiUuid = null;
      skippedRexAction.stmPriorities = { [ids.level3b]: 1 };
      doc.actions[ids.rexSkippedAction] = skippedRexAction;
      doc.stations[mission.ids.rexStationB].actionOrderUuids.push(ids.rexSkippedAction);

      const rexAction = doc.actions[mission.ids.rexActionA];
      rexAction.stmPriorities = { [ids.level3]: 3 };
      doc.rexes[mission.ids.rexA].actionEntries = {
        [mission.ids.rexActionA]: { rexStatus: "complete" },
      };
      doc.rexes[mission.ids.rexA].stationEntries = {
        [mission.ids.rexStationA]: { rexStatus: "complete" },
      };
      doc.rexes[mission.ids.rexB].stationEntries = {
        [mission.ids.rexStationB]: { rexStatus: "skipped" },
      };
      doc.rexes[mission.ids.rexB].actionEntries = {
        [ids.rexSkippedAction]: { rexStatus: "skipped" },
      };
    });

    const before = await mission.read();
    expect(before.actions[mission.ids.actionA].stmPriorities).toEqual({ [ids.level3]: 1 });
    expect(before.actions[ids.actionB]).toMatchObject({
      enabled: false,
      stmPriorities: { [ids.level3]: 3 },
    });
    expect(before.actions[mission.ids.rexActionA].stmPriorities).toEqual({ [ids.level3]: 3 });
    expect(before.rexes[mission.ids.rexA].actionEntries?.[mission.ids.rexActionA].rexStatus).toBe(
      "complete"
    );
    expect(before.rexes[mission.ids.rexB].stationEntries?.[mission.ids.rexStationB].rexStatus).toBe(
      "skipped"
    );

    await mission.open(page);
    await page.getByLabel("stmViewer Section", { exact: true }).click();
    const target = page
      .locator("div[class*='gridCellLevel3Heading']")
      .filter({ hasText: "Known sample target" });
    await expect(target.locator("[data-tooltip-content]")).toHaveAttribute(
      "data-tooltip-content",
      "Known sample target (1 actions)"
    );
    const photoTarget = page
      .locator("div[class*='gridCellLevel3Heading']")
      .filter({ hasText: "Known photo target" });
    await expect(photoTarget.locator("[data-tooltip-content]")).toHaveAttribute(
      "data-tooltip-content",
      "Known photo target (1 actions)"
    );

    const sampleIndicators = target
      .locator("..")
      .locator("div[class*='indicatorGridCellIndicatorText']");
    await expect(sampleIndicators).toHaveText(["H"]);
    await expect(sampleIndicators.first().locator("..")).toHaveClass(/indicatorHigh/);
    const photoIndicators = photoTarget
      .locator("..")
      .locator("div[class*='indicatorGridCellIndicatorText']");
    await expect(photoIndicators).toHaveText(["M"]);
    await expect(photoIndicators.first().locator("..")).toHaveClass(/indicatorMedium/);

    const actionTypeFilter = page.getByText("Filter Action Types", { exact: true });
    await actionTypeFilter.click();
    await page.getByText("Sample", { exact: true }).last().click();
    await expect(target.locator("[data-tooltip-content]")).toHaveAttribute(
      "data-tooltip-content",
      "Known sample target (0 actions)"
    );
    await expect(photoTarget.locator("[data-tooltip-content]")).toHaveAttribute(
      "data-tooltip-content",
      "Known photo target (1 actions)"
    );
    await page.locator('svg[data-tooltip-content="Show all action types"]').click();
    await expect(target.locator("[data-tooltip-content]")).toHaveAttribute(
      "data-tooltip-content",
      "Known sample target (1 actions)"
    );

    await page.locator('[data-tooltip-content="Show/Hide Row/Column highlights"]').click();
    await page.locator('[data-tooltip-content="Show/Hide Row/Column highlights"]').click();
    await target.hover();
    await expect(target).toHaveAttribute("style", /background-color/);

    const evaFilter = page.getByText("Select As-Planned EVAs", { exact: true });
    await evaFilter.click();
    await page.getByText("Survey Alpha", { exact: true }).click();
    await expect(target.locator("[data-tooltip-content]")).toHaveAttribute(
      "data-tooltip-content",
      "Known sample target (1 actions)"
    );
    await expect(
      photoTarget.locator("..").locator("div[class*='indicatorGridCellIndicatorText']")
    ).toHaveText(["M"]);

    await mission.open(page);
    await page.getByLabel("evas Section", { exact: true }).click();
    const showAllEvas = page.getByLabel("Show All EVAs", { exact: true });
    if (await showAllEvas.isVisible()) await showAllEvas.click();
    const alphaEva = page
      .getByLabel("evaList-item", { exact: true })
      .filter({ hasText: "Survey Alpha" });
    await alphaEva.locator("select").selectOption(mission.ids.rexEvaA);
    await page.getByLabel("actions_panel", { exact: true }).click();
    await expect(page.getByText("All EVA Actions (Stopped Alpha)", { exact: true })).toBeVisible();
    const alphaRexCoverage = page.locator("div[class*='stmCoverage']");
    await expect(alphaRexCoverage.locator(`[data-stm-uuid="${ids.level3}"]`)).toHaveClass(
      /rexCompleted/
    );

    await page.getByLabel("evas Section", { exact: true }).click();
    const showAllEvasForBravo = page.getByLabel("Show All EVAs", { exact: true });
    if (await showAllEvasForBravo.isVisible()) await showAllEvasForBravo.click();
    const bravoEva = page
      .getByLabel("evaList-item", { exact: true })
      .filter({ hasText: "Survey Bravo" });
    await bravoEva.locator("select").selectOption(mission.ids.rexEvaB);
    await page.getByLabel("actions_panel", { exact: true }).click();
    await expect(page.getByText("All EVA Actions (Active Bravo)", { exact: true })).toBeVisible();
    const bravoRexCoverage = page.locator("div[class*='stmCoverage']");
    await expect(bravoRexCoverage.locator(`[data-stm-uuid="${ids.level3b}"]`)).not.toHaveClass(
      /rexCompleted|rexInProgress/
    );
    expect(await mission.read()).toEqual(before);
  });
});
