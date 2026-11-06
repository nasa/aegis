import { isVisible } from "./browserAssertions";
import { test as base, expect } from "./missionHarness";

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

const test = base.extend({ scenario: "execution" as BehavioralScenario });
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

  await mission.open();
  await page.getByLabelText("stmViewer Section", { exact: true }).click();
  const target = page
    .getBySelector("div[class*='gridCellLevel3Heading']")
    .filter({ hasText: "Known sample target" });
  await expect
    .element(target.getBySelector("[data-tooltip-content]"))
    .toHaveAttribute("data-tooltip-content", "Known sample target (1 actions)");
  const photoTarget = page
    .getBySelector("div[class*='gridCellLevel3Heading']")
    .filter({ hasText: "Known photo target" });
  await expect
    .element(photoTarget.getBySelector("[data-tooltip-content]"))
    .toHaveAttribute("data-tooltip-content", "Known photo target (1 actions)");

  const sampleIndicators = target
    .getBySelector("..")
    .getBySelector("div[class*='indicatorGridCellIndicatorText']");
  await expect
    .poll(() => sampleIndicators.elements().map((element) => element.textContent.trim()))
    .toEqual(["H"]);
  await expect.element(sampleIndicators.first().getBySelector("..")).toHaveClass(/indicatorHigh/);
  const photoIndicators = photoTarget
    .getBySelector("..")
    .getBySelector("div[class*='indicatorGridCellIndicatorText']");
  await expect
    .poll(() => photoIndicators.elements().map((element) => element.textContent.trim()))
    .toEqual(["M"]);
  await expect.element(photoIndicators.first().getBySelector("..")).toHaveClass(/indicatorMedium/);

  const actionTypeFilter = page.getByText("Filter Action Types", { exact: true });
  await actionTypeFilter.click();
  await page.getByText("Sample", { exact: true }).last().click();
  await expect
    .element(target.getBySelector("[data-tooltip-content]"))
    .toHaveAttribute("data-tooltip-content", "Known sample target (0 actions)");
  await expect
    .element(photoTarget.getBySelector("[data-tooltip-content]"))
    .toHaveAttribute("data-tooltip-content", "Known photo target (1 actions)");
  await page.getBySelector('svg[data-tooltip-content="Show all action types"]').click();
  await expect
    .element(target.getBySelector("[data-tooltip-content]"))
    .toHaveAttribute("data-tooltip-content", "Known sample target (1 actions)");

  await page.getBySelector('[data-tooltip-content="Show/Hide Row/Column highlights"]').click();
  await page.getBySelector('[data-tooltip-content="Show/Hide Row/Column highlights"]').click();
  await target.hover();
  await expect.poll(() => target.element().getAttribute("style")).toMatch(/background-color/);

  const evaFilter = page.getByText("Select As-Planned EVAs", { exact: true });
  await evaFilter.click();
  await page.getByText("Survey Alpha", { exact: true }).click();
  await expect
    .element(target.getBySelector("[data-tooltip-content]"))
    .toHaveAttribute("data-tooltip-content", "Known sample target (1 actions)");
  await expect
    .poll(() =>
      photoTarget
        .getBySelector("..")
        .getBySelector("div[class*='indicatorGridCellIndicatorText']")
        .elements()
        .map((element) => element.textContent.trim())
    )
    .toEqual(["M"]);

  await mission.open();
  await page.getByLabelText("evas Section", { exact: true }).click();
  const showAllEvas = page.getByLabelText("Show All EVAs", { exact: true });
  if (isVisible(showAllEvas)) await showAllEvas.click();
  const alphaEva = page
    .getByLabelText("evaList-item", { exact: true })
    .filter({ hasText: "Survey Alpha" });
  await alphaEva.getBySelector("select").selectOptions(mission.ids.rexEvaA);
  await page.getByLabelText("actions_panel", { exact: true }).click();
  await expect
    .element(page.getByText("All EVA Actions (Stopped Alpha)", { exact: true }))
    .toBeVisible();
  const alphaRexCoverage = page.getBySelector("div[class*='stmCoverage']");
  await expect
    .element(alphaRexCoverage.getBySelector(`[data-stm-uuid="${ids.level3}"]`))
    .toHaveClass(/rexCompleted/);

  await page.getByLabelText("evas Section", { exact: true }).click();
  const showAllEvasForBravo = page.getByLabelText("Show All EVAs", { exact: true });
  if (isVisible(showAllEvasForBravo)) await showAllEvasForBravo.click();
  const bravoEva = page
    .getByLabelText("evaList-item", { exact: true })
    .filter({ hasText: "Survey Bravo" });
  await bravoEva.getBySelector("select").selectOptions(mission.ids.rexEvaB);
  await page.getByLabelText("actions_panel", { exact: true }).click();
  await expect
    .element(page.getByText("All EVA Actions (Active Bravo)", { exact: true }))
    .toBeVisible();
  const bravoRexCoverage = page.getBySelector("div[class*='stmCoverage']");
  await expect
    .element(bravoRexCoverage.getBySelector(`[data-stm-uuid="${ids.level3b}"]`))
    .not.toHaveClass(/rexCompleted|rexInProgress/);
  expect(await mission.read()).toEqual(before);
});
