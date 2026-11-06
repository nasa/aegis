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
  test("executed mass and sample IDs merge with live peer status changes and persist", async ({
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
    await savePlanningField(page, "Executed Sample Mass", "750");
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
    const after = await mission.read();
    expect(after.actions).toEqual(before.actions);
    expect(after.rexes[mission.ids.rexB]).toEqual(before.rexes[mission.ids.rexB]);
    await mission.open(page);
    action = await openAlphaActions(page, mission);
    await action.locator('svg[data-icon="caret-right"]').click();
    await expect(planningField(page, "Executed Sample Mass")).toHaveText("800");
    await expect(planningField(page, "Sample Marker ID")).toHaveText("CORE-α");
  });
});
