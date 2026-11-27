import { userEvent } from "vitest/browser";
import { exactText } from "./browserAssertions";
import type { Locator, BrowserPage as Page } from "vitest/browser";
import { test as base, expect } from "./missionHarness";
import { enablePlanningEditMode, planningField, savePlanningField } from "./planningHelpers";
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
  const editing = toggle.element().getAttribute("data-tooltip-content") === "Turn Off Edit Mode";
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
  test("executed mass and sample IDs preserve zero and signed deltas and respect Maestro ownership", async ({
    page,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.actions[mission.ids.rexActionA].mass = 500;
    });
    await startAlpha(page, mission, "limited");
    const before = await mission.read();
    let action = await openAlphaActions(page, mission);
    await action.getBySelector('svg[data-icon="caret-right"]').click();
    const total = (label: string) =>
      page
        .getByText(label, { exact: true })
        .getBySelector("../..")
        .getBySelector('[class*="displayFieldValue"]');
    await expect.element(total("Total Planned Mass (g):")).toMatchTextContent(exactText("500"));
    await expect.element(total("Total Executed Mass (g):")).toBeEmptyDOMElement();
    await savePlanningField(page, "Executed Sample Mass", "0");
    await expect.element(total("Total Executed Mass (g):")).toMatchTextContent(exactText("0"));
    await expect.element(total("Executed Delta Mass (g):")).toMatchTextContent(exactText("-500"));
    await savePlanningField(page, "Executed Sample Mass", "750");
    await expect.element(total("Executed Delta Mass (g):")).toMatchTextContent(exactText("+250"));
    await savePlanningField(page, "Sample Marker ID", "CORE-α");
    await savePlanningField(page, "Container ID", "BAG-1");
    await savePlanningField(page, "Secondary Container ID", "BOX-2");

    await action.getBySelector('[class*="actionHeadingRexStatusWrapper"]').click();
    await page.getBySelector("dialog[open]").getByText("Complete", { exact: true }).click();
    await expect
      .poll(
        async () =>
          (await mission.read()).rexes[mission.ids.rexA].actionEntries?.[mission.ids.rexActionA]
            ?.rexStatus
      )
      .toBe("complete");
    await expect
      .element(action.getBySelector('[class*="actionHeadingRexStatusWrapper"]'))
      .toHaveAttribute("data-tooltip-content", "Complete");
    await savePlanningField(page, "Executed Sample Mass", "800");
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
    await page.getBySelector("#maestroCheckbox").click();
    action = await openAlphaActions(page, mission);
    // Expansion is local and remains open while navigating between EVA tabs.
    await expect.element(planningField(page, "Sample Marker ID")).toBeVisible();
    await planningField(page, "Sample Marker ID").click();
    await expect.poll(() => page.getBySelector("dialog[open]").length).toBe(0);
    await action.getBySelector('[class*="actionHeadingRexStatusWrapper"]').click();
    await expect
      .element(
        page
          .getBySelector("dialog[open]")
          .getByText("Item status is controlled by Maestro", { exact: false })
      )
      .toBeVisible();
    await userEvent.keyboard("{Escape}");
    // Executed mass remains manually writable while collection IDs are Maestro-owned.
    await savePlanningField(page, "Executed Sample Mass", "900");
    await expect.element(total("Executed Delta Mass (g):")).toMatchTextContent(exactText("+400"));
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
    await mission.open();
    action = await openAlphaActions(page, mission);
    await action.getBySelector('svg[data-icon="caret-right"]').click();
    await expect
      .element(planningField(page, "Executed Sample Mass"))
      .toMatchTextContent(exactText("900"));
    await expect
      .element(planningField(page, "Sample Marker ID"))
      .toMatchTextContent(exactText("CORE-α"));
    await expect.element(total("Executed Delta Mass (g):")).toMatchTextContent(exactText("+400"));
  });
});
