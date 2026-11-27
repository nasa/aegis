import type { Locator, BrowserPage as Page } from "vitest/browser";
import { test as base, expect } from "./missionHarness";
import { enablePlanningEditMode, planningField } from "./planningHelpers";
import { openExecutionInfo, selectExecution } from "./executionHelpers";

const test = base.extend({ scenario: "execution" as BehavioralScenario });

function policyControl(page: Page): Locator {
  return page.getByText("Execute Edit Mode:", { exact: true }).getBySelector("../..");
}

async function startAlpha(
  page: Page,
  mission: BrowserMission,
  mode: RexExecuteEditMode
): Promise<void> {
  await mission.change((doc) => {
    doc.rexes[mission.ids.rexB].isRunning = false;
  });
  await mission.open();
  await enablePlanningEditMode(page);
  await openExecutionInfo(page, "Survey Alpha", mission.ids.rexEvaA);
  await policyControl(page).getBySelector("select").selectOptions(mode);
  await page.getByLabelText("Execute EVA", { exact: true }).click();
  await expect.element(page.getByLabelText("Stop Execution", { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await mission.read()).rexes[mission.ids.rexA].isRunning)
    .toBe(true);
}

async function openAlphaActions(page: Page, mission: BrowserMission): Promise<Locator> {
  const row = await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);
  const toggle = page.getByLabelText("globalEditToggle", { exact: true });
  const editing =
    (await toggle.element().getAttribute("data-tooltip-content")) === "Turn Off Edit Mode";
  if (editing) await toggle.click();
  await row.getByText("Alpha station", { exact: true }).click();
  await page.getByLabelText("actions_panel", { exact: true }).click();
  if (editing) await enablePlanningEditMode(page);
  const action = page
    .getByRole("listitem")
    .filter({ has: planningField(page, "Action Name").filter({ hasText: "Sample regolith" }) });
  await expect.element(action).toBeVisible();
  return action;
}

test.describe("Execution policy contracts", () => {
  for (const [mode, label] of [
    ["none", "None"],
    ["limited", "Limited Editing"],
    ["unrestricted", "Unrestricted"],
  ] as const) {
    test(`first execution freezes ${mode} policy and its action baseline across stop, restart and remount`, async ({
      page,
      mission,
    }) => {
      await startAlpha(page, mission, mode);
      await expect.poll(() => policyControl(page).getBySelector("select").length).toBe(0);
      await expect.element(policyControl(page)).toMatchTextContent(label);
      const frozen = (await mission.read()).rexes[mission.ids.rexA].executeEditState;
      expect(frozen).toEqual({
        addedStationUuids: [],
        addedTraverseUuids: [],
        addedActionUuids: [],
        actionLetterOrderByParent: {
          [mission.ids.rexEgressA]: [],
          [mission.ids.rexTraverseOutbound]: [],
          [mission.ids.rexStationA]: [mission.ids.rexActionA],
          [mission.ids.rexTraverseA]: [],
          [mission.ids.rexStationABravo]: [],
          [mission.ids.rexTraverseReturn]: [],
          [mission.ids.rexIngressA]: [],
        },
      });
      if (mode !== "none") {
        await openAlphaActions(page, mission);
        await page.getByText("Add Action", { exact: true }).click();
        await expect
          .poll(
            async () =>
              (await mission.read()).stations[mission.ids.rexStationA].actionOrderUuids.length
          )
          .toBe(2);
      }
      const beforeRestart = (await mission.read()).rexes[mission.ids.rexA].executeEditState;
      await openExecutionInfo(page, "Survey Alpha", mission.ids.rexEvaA);
      await page.getByLabelText("Stop Execution", { exact: true }).click();
      await expect.poll(() => policyControl(page).getBySelector("select").length).toBe(0);
      await expect.element(policyControl(page)).toMatchTextContent(label);
      await page.getByLabelText("Execute EVA", { exact: true }).click();
      await expect
        .poll(async () => (await mission.read()).rexes[mission.ids.rexA])
        .toMatchObject({ executeEditMode: mode, isRunning: true, executeEditState: beforeRestart });
      await mission.open();
      await enablePlanningEditMode(page);
      await openExecutionInfo(page, "Survey Alpha", mission.ids.rexEvaA);
      await expect.poll(() => policyControl(page).getBySelector("select").length).toBe(0);
      await expect.element(policyControl(page)).toMatchTextContent(label);
      expect((await mission.read()).rexes[mission.ids.rexA].executeEditState).toEqual(
        beforeRestart
      );
      expect((await mission.read()).actions[mission.ids.actionA].name).toBe("Sample regolith");
    });
  }

  test("station, traverse and action statuses cycle without global Edit and preserve historical and planned data", async ({
    page,
    mission,
  }) => {
    await startAlpha(page, mission, "limited");
    const before = await mission.read();
    await page.getByLabelText("globalEditToggle", { exact: true }).click();
    const row = await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);
    for (const [name, key, uuid] of [
      ["Alpha station", "stationEntries", mission.ids.rexStationA],
      ["Alpha to Bravo", "traverseEntries", mission.ids.rexTraverseA],
    ] as const) {
      const status = row
        .getByText(name, { exact: true })
        .getBySelector("xpath=ancestor::div[./div[contains(@class,'rexStatusWrapper')]][1]")
        .getBySelector('[class*="rexStatusWrapper"]');
      for (const [command, value, tooltip] of [
        ["In-Progress", "in-progress", "In Progress"],
        ["Complete", "complete", "Complete"],
        ["Skipped", "skipped", "Skipped"],
        ["Pending", "pending", "Pending"],
      ]) {
        await status.click();
        await page.getBySelector("dialog[open]").getByText(command, { exact: true }).click();
        await expect.element(status).toHaveAttribute("data-tooltip-content", tooltip);
        await expect
          .poll(async () => (await mission.read()).rexes[mission.ids.rexA][key]?.[uuid]?.rexStatus)
          .toBe(value);
      }
    }
    for (const view of ["station", "eva"]) {
      if (view === "station") await openAlphaActions(page, mission);
      else {
        await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);
        await page.getByLabelText("actions_panel", { exact: true }).click();
      }
      const status = page
        .getByRole("listitem")
        .filter({ has: planningField(page, "Action Name").filter({ hasText: "Sample regolith" }) })
        .getBySelector('[class*="actionHeadingRexStatusWrapper"]');
      for (const [command, value, tooltip] of [
        ["In-Progress", "in-progress", "In Progress"],
        ["Complete", "complete", "Complete"],
        ["Skipped", "skipped", "Skipped"],
        ["Pending", "pending", "Pending"],
      ]) {
        await status.click();
        await page.getBySelector("dialog[open]").getByText(command, { exact: true }).click();
        await expect.element(status).toHaveAttribute("data-tooltip-content", tooltip);
        await expect
          .poll(
            async () =>
              (await mission.read()).rexes[mission.ids.rexA].actionEntries?.[mission.ids.rexActionA]
                ?.rexStatus
          )
          .toBe(value);
      }
    }
    const after = await mission.read();
    expect(after.rexes[mission.ids.rexB]).toEqual(before.rexes[mission.ids.rexB]);
    expect(after.stations).toEqual(before.stations);
    expect(after.traverses).toEqual(before.traverses);
    expect(after.actions).toEqual(before.actions);
    expect(after.evas).toEqual(before.evas);
    await mission.open();
    await openAlphaActions(page, mission);
    expect((await mission.read()).rexes[mission.ids.rexA]).toMatchObject({
      stationEntries: { [mission.ids.rexStationA]: { rexStatus: "pending" } },
      traverseEntries: { [mission.ids.rexTraverseA]: { rexStatus: "pending" } },
      actionEntries: { [mission.ids.rexActionA]: { rexStatus: "pending" } },
    });
  });

  test("limited execution permits crew and enabled changes but protects original action wording, duration and deletion", async ({
    page,
    mission,
  }) => {
    await startAlpha(page, mission, "limited");
    const before = await mission.read();
    const action = await openAlphaActions(page, mission);
    await planningField(page, "Action Name").click();
    await expect.poll(() => page.getBySelector("dialog[open]").length).toBe(0);
    await action.getBySelector('svg[data-icon="caret-right"]').click();
    await planningField(page, "Duration in minutes").click();
    await expect.poll(() => page.getBySelector("dialog[open]").length).toBe(0);
    await action.getByText("2", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.rexActionA].crewAssigned)
      .toEqual(["EV1", "EV2"]);
    await action.getBySelector('svg[data-icon="ellipsis-vertical"]').click();
    const menu = page.getBySelector("dialog[open]");
    await expect.poll(() => menu.getByText("Delete Action", { exact: true }).length).toBe(0);
    await expect.poll(() => menu.getByText("Duplicate Action", { exact: true }).length).toBe(0);
    await menu.getByText("Deactivate Action", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.rexActionA].enabled)
      .toBe(false);
    const saved = (await mission.read()).actions[mission.ids.rexActionA];
    expect(saved.name).toBe("Sample regolith");
    expect(saved.duration).toBe(6);
    expect((await mission.read()).actions[mission.ids.actionA]).toEqual(
      before.actions[mission.ids.actionA]
    );
    await mission.open();
    await openAlphaActions(page, mission);
    expect((await mission.read()).actions[mission.ids.rexActionA]).toEqual(saved);
  });
});
