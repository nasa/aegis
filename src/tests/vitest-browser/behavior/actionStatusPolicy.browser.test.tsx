import { userEvent } from "vitest/browser";
import type { BrowserPage as Page } from "vitest/browser";
import { test as base, expect } from "./missionHarness";
import {
  enablePlanningEditMode,
  planningField,
  selectPlanningStationActions,
} from "./planningHelpers";
import { openExecutionInfo, selectExecution } from "./executionHelpers";

const test = base.extend({ scenario: "execution" as BehavioralScenario });

async function actionForExecution(page: Page, mission: BrowserMission) {
  const toggle = page.getByLabelText("globalEditToggle", { exact: true });
  if (
    toggle.length &&
    toggle.element().getAttribute("data-tooltip-content") === "Turn Off Edit Mode"
  )
    await toggle.click();
  const eva = await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);
  await eva.getByText("Alpha station", { exact: true }).click();
  await page.getByLabelText("actions_panel", { exact: true }).click();
  return page
    .getByRole("listitem")
    .filter({ has: planningField(page, "Action Name").filter({ hasText: "Sample regolith" }) });
}

test("execution action status permits Edit off and rejects disabled, Maestro-owned, stopped and planned writes", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.rexes[mission.ids.rexB].isRunning = false;
  });
  await mission.open();
  await enablePlanningEditMode(page);
  await openExecutionInfo(page, "Survey Alpha", mission.ids.rexEvaA);
  await page.getByLabelText("Execute EVA", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).rexes[mission.ids.rexA].isRunning)
    .toBe(true);
  let action = await actionForExecution(page, mission);
  const initial = await mission.read();
  await expect
    .element(page.getByLabelText("globalEditToggle", { exact: true }))
    .toHaveAttribute("data-tooltip-content", "Turn On Edit Mode");
  await action.getBySelector('[class*="actionHeadingRexStatusWrapper"]').click();
  await page.getBySelector("dialog[open]").getByText("Complete", { exact: true }).click();
  await expect
    .poll(
      async () =>
        (await mission.read()).rexes[mission.ids.rexA].actionEntries[mission.ids.rexActionA]
          .rexStatus
    )
    .toBe("complete");

  await enablePlanningEditMode(page);
  await action.getBySelector('svg[data-icon="ellipsis-vertical"]').click();
  await page.getBySelector("dialog[open]").getByText("Deactivate Action", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).actions[mission.ids.rexActionA].enabled)
    .toBe(false);
  await expect
    .poll(() => action.getBySelector('[class*="actionHeadingRexStatusWrapper"] svg').length)
    .toBe(0);
  await expect
    .element(action.getBySelector('[class*="actionHeadingRexStatusWrapper"]'))
    .not.toBeVisible();
  await expect.poll(() => page.getBySelector("dialog[open]").length).toBe(0);
  await action.getBySelector('svg[data-icon="ellipsis-vertical"]').click();
  await page.getBySelector("dialog[open]").getByText("Activate Action", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).actions[mission.ids.rexActionA].enabled)
    .toBe(true);

  await openExecutionInfo(page, "Survey Alpha", mission.ids.rexEvaA);
  await page.getBySelector("#maestroCheckbox").click();
  action = await actionForExecution(page, mission);
  await action.getBySelector('[class*="actionHeadingRexStatusWrapper"]').click();
  await expect
    .element(
      page
        .getBySelector("dialog[open]")
        .getByText("Item status is controlled by Maestro", { exact: false })
    )
    .toBeVisible();
  await userEvent.keyboard("{Escape}");
  expect(
    (await mission.read()).rexes[mission.ids.rexA].actionEntries[mission.ids.rexActionA].rexStatus
  ).toBe("complete");
  await enablePlanningEditMode(page);
  await openExecutionInfo(page, "Survey Alpha", mission.ids.rexEvaA);
  await page.getBySelector("#maestroCheckbox").click();
  await page.getByLabelText("Stop Execution", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).rexes[mission.ids.rexA].isRunning)
    .toBe(false);
  await mission.open();
  action = await actionForExecution(page, mission);
  await action.getBySelector('[class*="actionHeadingRexStatusWrapper"]').click();
  await expect.poll(() => page.getBySelector("dialog[open]").length).toBe(0);
  await selectPlanningStationActions(page, "Alpha station");
  await expect
    .poll(
      () =>
        page.getByRole("listitem").getBySelector('[class*="actionHeadingRexStatusWrapper"]').length
    )
    .toBe(0);
  const after = await mission.read();
  expect(after.rexes[mission.ids.rexA].actionEntries[mission.ids.rexActionA].rexStatus).toBe(
    "complete"
  );
  expect(after.actions).toEqual({
    ...initial.actions,
    [mission.ids.rexActionA]: {
      ...initial.actions[mission.ids.rexActionA],
      updatedAt: after.actions[mission.ids.rexActionA].updatedAt,
    },
  });
  expect(after.actions[mission.ids.rexActionA].updatedAt).toBeGreaterThanOrEqual(
    initial.actions[mission.ids.rexActionA].updatedAt
  );
  expect(after.rexes[mission.ids.rexB]).toEqual(initial.rexes[mission.ids.rexB]);
});
