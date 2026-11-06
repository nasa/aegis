import { exactText } from "./browserAssertions";

import type { BrowserPage as Page } from "vitest/browser";
import { test as base, expect } from "./missionHarness";
import { seedAction } from "tests/playwright/fixtures/entitySeeds";
import {
  enablePlanningEditMode,
  selectPlanningPoi,
  openPlanningSection,
  savePlanningField,
  openPlanningField,
} from "./planningHelpers";
import { selectExecution } from "./executionHelpers";
const test = base;

const extra = "83000000-0000-4000-8000-000000000001";
const disabled = "83000000-0000-4000-8000-000000000002";
const level1 = "83000000-0000-4000-8000-000000000011";
const level2 = "83000000-0000-4000-8000-000000000012";
const level3 = "83000000-0000-4000-8000-000000000013";

function total(page: Page, label: string) {
  return page
    .getByText(label, { exact: true })
    .getBySelector("../..")
    .getBySelector('[class*="displayFieldValue"]');
}
function actionRow(page: Page, name: string) {
  return page
    .getByRole("listitem")
    .filter({ has: page.getBySelector('div[aria-label="Action Name"]').filter({ hasText: name }) });
}

test("POI totals and science coverage distinguish missing values, disabled work and complete actions and remove warnings only for enabled work", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.actionSystemVersion = 1;
    doc.stmLevel1Enabled = true;
    doc.stmLevel1s[level1] = {
      uuid: level1,
      name: "Science",
      numbering: "1",
      createdAt: 1,
      updatedAt: 1,
    };
    doc.stmLevel2s[level2] = {
      uuid: level2,
      name: "Samples",
      numbering: "a",
      level1Uuid: level1,
      createdAt: 1,
      updatedAt: 1,
    };
    doc.stmLevel3s[level3] = {
      uuid: level3,
      name: "Core",
      numbering: "1",
      level2Uuid: level2,
      createdAt: 1,
      updatedAt: 1,
    };
    doc.actions[mission.ids.actionA].poiUuid = null;
    doc.actions[extra] = seedAction({
      uuid: extra,
      refUuid: extra,
      name: "Specified sample",
      poiUuid: mission.ids.poiA,
      duration: 3,
      mass: 1250,
      stmPriorities: { [level3]: 3 },
    });
    doc.actions[disabled] = seedAction({
      uuid: disabled,
      refUuid: disabled,
      name: "Disabled sample",
      poiUuid: mission.ids.poiA,
      duration: 99,
      mass: 9999,
      enabled: false,
      stmPriorities: { [level3]: 1 },
    });
    doc.pois[mission.ids.poiA].actionOrderUuids = [extra, disabled];
  });
  await mission.open();
  await enablePlanningEditMode(page);
  await selectPlanningPoi(page, "Reference POI");
  await page.getByLabelText("info_panel", { exact: true }).click();
  await expect.element(total(page, "Number of Actions:")).toHaveTextContent(exactText("1"));
  await expect.element(total(page, "Total Mass (g):")).toHaveTextContent(exactText("1250"));
  await expect.element(total(page, "Total Action Time (mins):")).toHaveTextContent(exactText("3"));
  await page.getByLabelText("report_panel", { exact: true }).click();
  await expect.element(page.getByText("No report items", { exact: true })).toBeVisible();
  await page.getByLabelText("actions_panel", { exact: true }).click();
  const strip = page
    .getBySelector('[class*="stmCoverage"]')
    .first()
    .getBySelector(`[data-stm-uuid="${level3}"]`);
  await expect.element(strip).toHaveClass(/highlight/);
  await actionRow(page, "Specified sample")
    .getBySelector('svg[data-icon="ellipsis-vertical"]')
    .click();
  await page.getBySelector("dialog[open]").getByText("Deactivate Action", { exact: true }).click();
  await expect.element(total(page, "Total Planned Mass (g):")).toHaveTextContent(exactText("0"));
  await expect.element(strip).not.toHaveClass(/highlight/);
  await page.getByLabelText("report_panel", { exact: true }).click();
  const warning = page.getByText("POI has no actions", { exact: true });
  await expect.element(warning).toBeVisible();
  await expect
    .element(warning.getBySelector("..").getBySelector('[class*="reportItemIcon"]'))
    .toHaveClass(/warning/);
  await page.getByLabelText("actions_panel", { exact: true }).click();
  await page.getByText("Add Action", { exact: true }).click();
  await page.getBySelector('div[aria-label="Action Name"]').last().getBySelector("..").click();
  const nameDialog = page.getBySelector("dialog[open]");
  await nameDialog.getByLabelText("Action Name", { exact: true }).fill("Missing mass and science");
  await nameDialog.getByText("Save", { exact: true }).click();
  await expect.element(total(page, "Number of Actions:")).toHaveTextContent(exactText("1"));
  await expect.element(total(page, "Total Planned Mass (g):")).toHaveTextContent(exactText("0"));
  await expect.element(strip).not.toHaveClass(/highlight/);
  await page.getByLabelText("report_panel", { exact: true }).click();
  await expect.element(page.getByText("No report items", { exact: true })).toBeVisible();
  await mission.open();
  await selectPlanningPoi(page, "Reference POI");
  await page.getByLabelText("info_panel", { exact: true }).click();
  await expect.element(total(page, "Total Mass (g):")).toHaveTextContent(exactText("0"));
  const saved = await mission.read();
  expect(saved.actions[extra].enabled).toBe(false);
  expect(saved.actions[disabled].enabled).toBe(false);
  expect(
    Object.values(saved.actions).find((action) => action.name === "Missing mass and science")
  ).toMatchObject({ mass: null, stmPriorities: null, poiUuid: mission.ids.poiA });
});

test.describe("Executed mass boundaries", () => {
  const test = base.extend({ scenario: "execution" as BehavioralScenario });
  test("planned grams, absent mass, entered zero and nonzero execution mass retain their units and signed deltas in cards and comparison", async ({
    page,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.actionSystemVersion = 2;
      doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
      doc.actions[mission.ids.rexActionA].mass = 1500;
      doc.rexes[mission.ids.rexB].isRunning = false;
      doc.rexes[mission.ids.rexA].isRunning = true;
      doc.rexes[mission.ids.rexA].executeEditMode = "unrestricted";
      doc.rexes[mission.ids.rexA].actionEntries = {};
    });
    await mission.open();
    await enablePlanningEditMode(page);
    const openActions = async () => {
      const row = await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);
      await page.getByLabelText("globalEditToggle", { exact: true }).click();
      await row.getByText("Alpha station", { exact: true }).click();
      await page.getByLabelText("actions_panel", { exact: true }).click();
      await enablePlanningEditMode(page);
      const action = actionRow(page, "Sample regolith");
      if (await action.getBySelector('svg[data-icon="caret-right"]').length)
        await action.getBySelector('svg[data-icon="caret-right"]').click();
    };
    const comparisonMass = async (expected: string) => {
      await page.getByLabelText("reports Section", { exact: true }).click();
      await page.getByText("EVA Comparison", { exact: true }).click();
      await page
        .getBySelector(
          '[data-tooltip-content="Column that other columns are compared against"] select'
        )
        .selectOptions(mission.ids.rexA);
      const cells = (label: string) =>
        page
          .getBySelector(`div[data-tooltip-html="${label}"]`)
          .getBySelector("..")
          .getBySelector('[class*="tableRowCells"] > [data-tooltip-id="aegis-tooltip"]');
      await expect.element(cells("Planned sample mass").nth(1)).toHaveTextContent(exactText("1.5"));
      await expect
        .element(cells("Actual sample mass").nth(1))
        .toHaveTextContent(exactText(expected));
    };
    await openActions();
    await expect
      .element(total(page, "Total Planned Mass (g):"))
      .toHaveTextContent(exactText("1500"));
    await expect.element(total(page, "Total Executed Mass (g):")).toBeEmptyDOMElement();
    await expect.element(total(page, "Executed Delta Mass (g):")).toBeEmptyDOMElement();
    await comparisonMass("");
    for (const fixture of [
      { value: "0", delta: "-1500", kg: "0" },
      { value: "1750", delta: "+250", kg: "1.8" },
    ]) {
      await openActions();
      await savePlanningField(page, "Executed Sample Mass", fixture.value);
      await expect
        .element(total(page, "Total Executed Mass (g):"))
        .toHaveTextContent(exactText(fixture.value));
      await expect
        .element(total(page, "Executed Delta Mass (g):"))
        .toHaveTextContent(exactText(fixture.delta));
      await expect
        .poll(
          async () =>
            (await mission.read()).rexes[mission.ids.rexA].actionEntries[mission.ids.rexActionA]
              .mass
        )
        .toBe(Number(fixture.value));
      await comparisonMass(fixture.kg);
    }
    await openActions();
    const dialog = await openPlanningField(page, "Executed Sample Mass");
    await dialog.getByLabelText("Executed Sample Mass", { exact: true }).fill("");
    await dialog.getByText("Save", { exact: true }).click();
    await expect.element(total(page, "Total Executed Mass (g):")).toBeEmptyDOMElement();
    await expect.element(total(page, "Executed Delta Mass (g):")).toBeEmptyDOMElement();
    await comparisonMass("");
    await openPlanningSection(page, "mission");
    await page.getByLabelText("export_panel", { exact: true }).click();
    await page.getBySelector("#export-rexes").click();
    const download = await mission.captureDownload(() =>
      page.getByLabelText("Export JSON File", { exact: true }).click()
    );
    const exported: { rexes: ExportRex[] } = JSON.parse(await download.text());
    expect(
      exported.rexes.find((rex) => rex.uuid === mission.ids.rexA).actionEntries[
        mission.ids.rexActionA
      ].mass
    ).toBeNull();
    await mission.open();
    await enablePlanningEditMode(page);
    await openActions();
    await expect.element(total(page, "Total Executed Mass (g):")).toBeEmptyDOMElement();
  });
});
