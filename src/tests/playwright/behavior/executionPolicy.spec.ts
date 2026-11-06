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
});
