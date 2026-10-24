import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import {
  enablePlanningEditMode,
  openPlanningField,
  planningField,
  savePlanningField,
} from "./planningHelpers";
import { openExecutionInfo, selectExecution } from "./executionHelpers";

test.use({ scenario: "execution" });

function policyControl(page: Page): Locator {
  return page.getByText("Execute Edit Mode:", { exact: true }).locator("../..");
}

async function startAlpha(
  page: Page,
  mission: BehavioralMission,
  mode: RexExecuteEditMode
): Promise<void> {
  await mission.change((doc) => {
    doc.rexes[mission.ids.rexB].isRunning = false;
  });
  await mission.open(page);
  await enablePlanningEditMode(page);
  await openExecutionInfo(page, "Survey Alpha", mission.ids.rexEvaA);
  await policyControl(page).locator("select").selectOption(mode);
  await page.getByLabel("Execute EVA", { exact: true }).click();
  await expect(page.getByLabel("Stop Execution", { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await mission.read()).rexes[mission.ids.rexA].isRunning)
    .toBe(true);
}

async function openAlphaActions(page: Page, mission: BehavioralMission): Promise<Locator> {
  const row = await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);
  const toggle = page.getByLabel("globalEditToggle", { exact: true });
  const editing = (await toggle.getAttribute("data-tooltip-content")) === "Turn Off Edit Mode";
  if (editing) await toggle.click();
  await row.getByText("Alpha station", { exact: true }).click();
  await page.getByLabel("actions_panel", { exact: true }).click();
  if (editing) await enablePlanningEditMode(page);
  const action = page
    .getByRole("listitem")
    .filter({ has: planningField(page, "Action Name").filter({ hasText: "Sample regolith" }) });
  await expect(action).toBeVisible();
  return action;
}

test.describe("Execution policy contracts", () => {
  test("executed mass and sample IDs merge with peer status changes and respect Maestro ownership", async ({
    page,
    context,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.actions[mission.ids.rexActionA].mass = 500;
    });
    await startAlpha(page, mission, "limited");
    const before = await mission.read();
    let action = await openAlphaActions(page, mission);
    await action.locator('svg[data-icon="caret-right"]').click();
    const total = (label: string) =>
      page
        .getByText(label, { exact: true })
        .locator("../..")
        .locator('[class*="displayFieldValue"]');
    await expect(total("Total Planned Mass (g):")).toHaveText("500");
    await expect(total("Total Executed Mass (g):")).toBeEmpty();
    await savePlanningField(page, "Executed Sample Mass", "0");
    await expect(total("Total Executed Mass (g):")).toHaveText("0");
    await expect(total("Executed Delta Mass (g):")).toHaveText("-500");
    await savePlanningField(page, "Executed Sample Mass", "750");
    await expect(total("Executed Delta Mass (g):")).toHaveText("+250");
    await savePlanningField(page, "Sample Marker ID", "CORE-α");
    await savePlanningField(page, "Container ID", "BAG-1");
    await savePlanningField(page, "Secondary Container ID", "BOX-2");

    const peer = await context.newPage();
    await mission.open(peer);
    const peerAction = await openAlphaActions(peer, mission);
    const draft = await openPlanningField(page, "Executed Sample Mass");
    await draft.getByLabel("Executed Sample Mass", { exact: true }).fill("800");
    await peerAction.locator('[class*="actionHeadingRexStatusWrapper"]').click();
    await peer.locator("dialog[open]").getByText("Complete", { exact: true }).click();
    await expect
      .poll(
        async () =>
          (await mission.read()).rexes[mission.ids.rexA].actionEntries?.[mission.ids.rexActionA]
            ?.rexStatus
      )
      .toBe("complete");
    await expect(action.locator('[class*="actionHeadingRexStatusWrapper"]')).toHaveAttribute(
      "data-tooltip-content",
      "Complete"
    );
    await draft.getByText("Save", { exact: true }).click();
    await expect
      .poll(
        async () =>
          (await mission.read()).rexes[mission.ids.rexA].actionEntries?.[mission.ids.rexActionA]
      )
      .toEqual({
        mass: 800,
        markerId: "CORE-α",
        containerId: "BAG-1",
        secondaryContainerId: "BOX-2",
        rexStatus: "complete",
      });
    await openExecutionInfo(page, "Survey Alpha", mission.ids.rexEvaA);
    await page.locator("#maestroCheckbox").check();
    action = await openAlphaActions(page, mission);
    // Expansion is local and remains open while navigating between EVA tabs.
    await expect(planningField(page, "Sample Marker ID")).toBeVisible();
    await planningField(page, "Sample Marker ID").click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await action.locator('[class*="actionHeadingRexStatusWrapper"]').click();
    await expect(
      page
        .locator("dialog[open]")
        .getByText("Item status is controlled by Maestro", { exact: false })
    ).toBeVisible();
    await page.keyboard.press("Escape");
    // Executed mass remains manually writable while collection IDs are Maestro-owned.
    await savePlanningField(page, "Executed Sample Mass", "900");
    await expect(total("Executed Delta Mass (g):")).toHaveText("+400");
    const after = await mission.read();
    expect(after.rexes[mission.ids.rexA].actionEntries[mission.ids.rexActionA]).toEqual({
      mass: 900,
      markerId: "CORE-α",
      containerId: "BAG-1",
      secondaryContainerId: "BOX-2",
      rexStatus: "complete",
    });
    expect(after.actions).toEqual(before.actions);
    expect(after.rexes[mission.ids.rexB]).toEqual(before.rexes[mission.ids.rexB]);
    await mission.open(page);
    action = await openAlphaActions(page, mission);
    await action.locator('svg[data-icon="caret-right"]').click();
    await expect(planningField(page, "Executed Sample Mass")).toHaveText("900");
    await expect(planningField(page, "Sample Marker ID")).toHaveText("CORE-α");
    await expect(total("Executed Delta Mass (g):")).toHaveText("+400");
  });

  for (const [mode, label] of [
    ["none", "None"],
    ["limited", "Limited Editing"],
    ["unrestricted", "Unrestricted"],
  ] as const) {
    test(`first execution freezes ${mode} policy and its action baseline across stop, restart and reload`, async ({
      page,
      mission,
    }) => {
      await startAlpha(page, mission, mode);
      await expect(policyControl(page).locator("select")).toHaveCount(0);
      await expect(policyControl(page)).toContainText(label);
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
      await page.getByLabel("Stop Execution", { exact: true }).click();
      await expect(policyControl(page).locator("select")).toHaveCount(0);
      await expect(policyControl(page)).toContainText(label);
      await page.getByLabel("Execute EVA", { exact: true }).click();
      await expect
        .poll(async () => (await mission.read()).rexes[mission.ids.rexA])
        .toMatchObject({ executeEditMode: mode, isRunning: true, executeEditState: beforeRestart });
      await mission.open(page);
      await enablePlanningEditMode(page);
      await openExecutionInfo(page, "Survey Alpha", mission.ids.rexEvaA);
      await expect(policyControl(page).locator("select")).toHaveCount(0);
      await expect(policyControl(page)).toContainText(label);
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
    await page.getByLabel("globalEditToggle", { exact: true }).click();
    const row = await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);
    for (const [name, key, uuid] of [
      ["Alpha station", "stationEntries", mission.ids.rexStationA],
      ["Alpha to Bravo", "traverseEntries", mission.ids.rexTraverseA],
    ] as const) {
      const status = row
        .getByText(name, { exact: true })
        .locator("xpath=ancestor::div[./div[contains(@class,'rexStatusWrapper')]][1]")
        .locator('[class*="rexStatusWrapper"]');
      for (const [command, value, tooltip] of [
        ["In-Progress", "in-progress", "In Progress"],
        ["Complete", "complete", "Complete"],
        ["Skipped", "skipped", "Skipped"],
        ["Pending", "pending", "Pending"],
      ]) {
        await status.click();
        await page.locator("dialog[open]").getByText(command, { exact: true }).click();
        await expect(status).toHaveAttribute("data-tooltip-content", tooltip);
        await expect
          .poll(async () => (await mission.read()).rexes[mission.ids.rexA][key]?.[uuid]?.rexStatus)
          .toBe(value);
      }
    }
    for (const view of ["station", "eva"]) {
      if (view === "station") await openAlphaActions(page, mission);
      else {
        await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);
        await page.getByLabel("actions_panel", { exact: true }).click();
      }
      const status = page
        .getByRole("listitem")
        .filter({ has: planningField(page, "Action Name").filter({ hasText: "Sample regolith" }) })
        .locator('[class*="actionHeadingRexStatusWrapper"]');
      for (const [command, value, tooltip] of [
        ["In-Progress", "in-progress", "In Progress"],
        ["Complete", "complete", "Complete"],
        ["Skipped", "skipped", "Skipped"],
        ["Pending", "pending", "Pending"],
      ]) {
        await status.click();
        await page.locator("dialog[open]").getByText(command, { exact: true }).click();
        await expect(status).toHaveAttribute("data-tooltip-content", tooltip);
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
    await mission.open(page);
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
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await action.locator('svg[data-icon="caret-right"]').click();
    await planningField(page, "Duration in minutes").click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await action.getByText("2", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.rexActionA].crewAssigned)
      .toEqual(["EV1", "EV2"]);
    await action.locator('svg[data-icon="ellipsis-vertical"]').click();
    const menu = page.locator("dialog[open]");
    await expect(menu.getByText("Delete Action", { exact: true })).toHaveCount(0);
    await expect(menu.getByText("Duplicate Action", { exact: true })).toHaveCount(0);
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
    await mission.open(page);
    await openAlphaActions(page, mission);
    expect((await mission.read()).actions[mission.ids.rexActionA]).toEqual(saved);
  });
});
