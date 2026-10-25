import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import {
  cancelPlanningField,
  enablePlanningEditMode,
  openPlanningField,
  planningField,
  savePlanningField,
  selectPlanningStationActions,
} from "./planningHelpers";

function actionRow(page: Page, name: string): Locator {
  return page.getByRole("listitem").filter({
    has: page.locator('div[aria-label="Action Name"]').filter({ hasText: name }),
  });
}

async function actionMenu(page: Page, name: string, command: string): Promise<void> {
  await actionRow(page, name).locator('svg[data-icon="ellipsis-vertical"]').click();
  await page.locator("dialog[open]").getByText(command, { exact: true }).click();
}

async function expectCrewTime(page: Page, crew: "EV1" | "EV2", minutes: string): Promise<void> {
  await expect(
    page
      .getByText(`${crew} Action Time (mins):`, { exact: true })
      .locator("../..")
      .locator('[class*="displayFieldValue"]')
  ).toHaveText(minutes);
}

test.describe("Action planning contracts", () => {
  test("view mode protects action fields, crew assignments, and creation until editing is enabled", async ({
    page,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open(page);
    await selectPlanningStationActions(page, "Alpha station");
    const row = actionRow(page, "Sample regolith");
    await planningField(page, "Action Name").click();
    await row.getByText("2", { exact: true }).click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(page.getByText("Add Action", { exact: true })).toHaveCount(0);
    await expect(row.locator('svg[data-icon="ellipsis-vertical"]')).toHaveCount(0);
    expect((await mission.read()).actions).toEqual(before.actions);

    await enablePlanningEditMode(page);
    await expect(page.getByText("Add Action", { exact: true })).toBeVisible();
    await savePlanningField(page, "Action Name", "Collect core sample");
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].name)
      .toBe("Collect core sample");
    await mission.open(page);
    await selectPlanningStationActions(page, "Alpha station");
    await expect(planningField(page, "Action Name")).toHaveText("Collect core sample");
  });

  test("action name and duration validation and Cancel preserve the saved action and totals", async ({
    page,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStationActions(page, "Alpha station");
    await cancelPlanningField(page, "Action Name", "Discarded action");
    const nameDialog = await openPlanningField(page, "Action Name");
    await nameDialog.getByLabel("Action Name", { exact: true }).fill("");
    await expect(nameDialog.getByText("Required", { exact: true })).toBeVisible();
    await expect(nameDialog.getByText("Save", { exact: true })).toBeDisabled();
    await expect(nameDialog.getByLabel("Action Name", { exact: true })).toBeVisible();
    await nameDialog.getByText("Cancel", { exact: true }).click();

    await actionRow(page, "Sample regolith").locator('svg[data-icon="caret-right"]').click();
    await cancelPlanningField(page, "Duration in minutes", "19");
    const durationDialog = await openPlanningField(page, "Duration in minutes");
    await durationDialog.getByLabel("Duration in minutes", { exact: true }).fill("");
    await expect(durationDialog.getByText("Required", { exact: true })).toBeVisible();
    await expect(durationDialog.getByText("Save", { exact: true })).toBeDisabled();
    await expect(durationDialog.getByLabel("Duration in minutes", { exact: true })).toBeVisible();
    await durationDialog.getByText("Cancel", { exact: true }).click();
    await expectCrewTime(page, "EV1", "6");
    expect((await mission.read()).actions).toEqual(before.actions);
    await mission.open(page);
    await selectPlanningStationActions(page, "Alpha station");
    await expect(planningField(page, "Action Name")).toHaveText("Sample regolith");
    await expectCrewTime(page, "EV1", "6");
  });

  test("duration and crew edits recalculate totals, and deactivation excludes the action without deleting it", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStationActions(page, "Alpha station");
    const row = actionRow(page, "Sample regolith");
    await row.locator('svg[data-icon="caret-right"]').click();
    await savePlanningField(page, "Duration in minutes", "19");
    await expectCrewTime(page, "EV1", "19");
    await expectCrewTime(page, "EV2", "0");
    await row.getByText("2", { exact: true }).click();
    await expectCrewTime(page, "EV2", "19");
    await expect
      .poll(async () => {
        const action = (await mission.read()).actions[mission.ids.actionA];
        return { duration: action.duration, crew: action.crewAssigned };
      })
      .toEqual({ duration: 19, crew: ["EV1", "EV2"] });

    await actionMenu(page, "Sample regolith", "Deactivate Action");
    await expectCrewTime(page, "EV1", "0");
    await expectCrewTime(page, "EV2", "0");
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].enabled)
      .toBe(false);
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStationActions(page, "Alpha station");
    await expect(row).toBeVisible();
    await expectCrewTime(page, "EV1", "0");
    await actionMenu(page, "Sample regolith", "Activate Action");
    await expectCrewTime(page, "EV1", "19");
    await expectCrewTime(page, "EV2", "19");
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].enabled)
      .toBe(true);
    expect((await mission.read()).stations[mission.ids.stationA].actionOrderUuids).toEqual([
      mission.ids.actionA,
    ]);
  });

  test("duplicated actions own independent values and deletion honors Cancel and removes only the copy", async ({
    page,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStationActions(page, "Alpha station");
    await actionMenu(page, "Sample regolith", "Duplicate Action");
    await expect.poll(async () => Object.keys((await mission.read()).actions).length).toBe(2);
    const duplicated = await mission.read();
    const copyId = Object.keys(duplicated.actions).find((id) => id !== mission.ids.actionA);
    const copy = duplicated.actions[copyId];
    expect(copy.refUuid).not.toBe(before.actions[mission.ids.actionA].refUuid);
    expect(copy.stationUuid).toBe(mission.ids.stationA);
    expect(copy.poiUuid).toBe(mission.ids.poiA);
    expect(copy.duration).toBe(6);
    expect(copy.crewAssigned).toEqual(["EV1"]);
    expect(duplicated.stations[mission.ids.stationA].actionOrderUuids).toEqual([
      mission.ids.actionA,
      copyId,
    ]);
    await expectCrewTime(page, "EV1", "12");

    await actionRow(page, copy.name).last().locator('div[aria-label="Action Name"]').click();
    const dialog = page.locator("dialog[open]");
    await dialog.getByLabel("Action Name", { exact: true }).fill("Independent sample");
    await dialog.getByText("Save", { exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(async () => (await mission.read()).actions[copyId].name)
      .toBe("Independent sample");
    expect((await mission.read()).actions[mission.ids.actionA]).toEqual(
      before.actions[mission.ids.actionA]
    );

    page.once("dialog", (confirmation) => confirmation.dismiss());
    await actionMenu(page, "Independent sample", "Delete Action");
    await expect(actionRow(page, "Independent sample")).toBeVisible();
    expect((await mission.read()).stations[mission.ids.stationA].actionOrderUuids).toEqual([
      mission.ids.actionA,
      copyId,
    ]);
    page.once("dialog", async (confirmation) => {
      expect(confirmation.message()).toBe("Are you sure you want to delete this Action?");
      await confirmation.accept();
    });
    await actionMenu(page, "Independent sample", "Delete Action");
    await expect.poll(async () => (await mission.read()).actions[copyId]).toBeUndefined();
    const after = await mission.read();
    expect(after.actions).toEqual(before.actions);
    expect(after.stations[mission.ids.stationA].actionOrderUuids).toEqual([mission.ids.actionA]);
    expect(after.evas).toEqual(before.evas);
    await mission.open(page);
    await selectPlanningStationActions(page, "Alpha station");
    await expect(actionRow(page, "Independent sample")).toHaveCount(0);
    await expectCrewTime(page, "EV1", "6");
  });

  test("a new action belongs to the selected station and its name and crew survive reload", async ({
    page,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStationActions(page, "Bravo station");
    await page.getByText("Add Action", { exact: true }).click();
    await savePlanningField(page, "Action Name", "Photograph outcrop");
    await actionRow(page, "Photograph outcrop").getByText("2", { exact: true }).click();
    await expect
      .poll(
        async () =>
          Object.values((await mission.read()).actions).filter(
            (action) => action.name === "Photograph outcrop" && action.crewAssigned.includes("EV2")
          ).length
      )
      .toBe(1);
    const after = await mission.read();
    const created = Object.values(after.actions).find(
      (action) => action.name === "Photograph outcrop"
    );
    expect(created.stationUuid).toBe(mission.ids.stationB);
    expect(after.stations[mission.ids.stationB].actionOrderUuids).toEqual([created.uuid]);
    expect(after.stations[mission.ids.stationA]).toEqual(before.stations[mission.ids.stationA]);
    expect(after.actions[mission.ids.actionA]).toEqual(before.actions[mission.ids.actionA]);
    await mission.open(page);
    await selectPlanningStationActions(page, "Bravo station");
    await expect(planningField(page, "Action Name")).toHaveText("Photograph outcrop");
    expect((await mission.read()).actions[created.uuid].crewAssigned).toEqual(["EV2"]);
  });
});
