import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import {
  enablePlanningEditMode,
  openPlanningField,
  selectPlanningPoi,
  selectPlanningStationActions,
} from "./planningHelpers";

function actionRow(page: Page, name: string): Locator {
  return page.getByRole("listitem").filter({
    has: page.locator('div[aria-label="Action Name"]').filter({ hasText: name }),
  });
}

async function editTextField(
  page: Page,
  label: "Action Description" | "Task Description",
  value: string
): Promise<void> {
  // Click the visible label wrapper; the empty value itself can collapse to zero height.
  await page.locator(`div[aria-label="${label}"]`).locator("..").click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByLabel(label, { exact: true }).fill(value);
  await dialog.getByText("Save", { exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

function actionTotal(page: Page, label: "Total Action Time (mins):" | "Total Planned Mass (g):") {
  return page
    .getByText(label, { exact: true })
    .locator("../..")
    .locator('[class*="displayFieldValue"]');
}

async function saveNumericField(page: Page, label: string, value: string): Promise<void> {
  const dialog = await openPlanningField(page, label);
  await dialog.getByLabel(label, { exact: true }).fill(value);
  await dialog.getByText("Save", { exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

async function rejectNumericField(
  page: Page,
  label: string,
  value: string,
  validationMessage: string
): Promise<void> {
  const dialog = await openPlanningField(page, label);
  await dialog.getByLabel(label, { exact: true }).fill(value);
  await expect(dialog.getByText(validationMessage, { exact: true })).toBeVisible();
  await dialog.getByText("Save", { exact: true }).click();
  await expect(dialog.getByLabel(label, { exact: true })).toBeVisible();
  await dialog.getByText("Cancel", { exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test.describe("POI action adoption and action content", () => {
  test("copying a linked POI action creates an independent station action with source lineage", async ({
    page,
    mission,
  }) => {
    // Arrange an independent POI-owned source action; all tested copying and edits use the UI.
    await mission.change((draft) => {
      const source = draft.actions[mission.ids.actionA];
      source.stationUuid = null;
      source.parentActionUuid = null;
      source.parentCopyDate = null;
      draft.stations[mission.ids.stationA].actionOrderUuids = [];
      draft.stations[mission.ids.stationA].poiUuids = [];
      draft.pois[mission.ids.poiA].actionOrderUuids = [mission.ids.actionA];
    });
    const before = await mission.read();
    const sourceBefore = before.actions[mission.ids.actionA];

    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStationActions(page, "Alpha station");
    await page.getByLabel("poi_panel", { exact: true }).click();
    await page.locator(`input[id="${mission.ids.poiA}"]`).check();
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].poiUuids)
      .toEqual([mission.ids.poiA]);
    await page.getByLabel("actions_panel", { exact: true }).click();
    await page.getByText("Associated POI Actions", { exact: true }).click();
    await expect(page.getByText("Sample regolith", { exact: true })).toBeVisible();
    // The POI source is visible through the link but is not silently inserted into the station.
    expect((await mission.read()).actions).toEqual(before.actions);
    expect((await mission.read()).stations[mission.ids.stationA].actionOrderUuids).toEqual([]);

    await page.locator('[data-tooltip-content="Copy this action to station"]').click();
    await expect.poll(async () => Object.keys((await mission.read()).actions).length).toBe(2);
    const copiedMission = await mission.read();
    const copy = Object.values(copiedMission.actions).find(
      (action) => action.uuid !== mission.ids.actionA
    );
    expect(copy).toBeDefined();
    expect(copy.stationUuid).toBe(mission.ids.stationA);
    expect(copy.poiUuid).toBeNull();
    expect(copy.parentActionUuid).toBe(mission.ids.actionA);
    expect(copy.parentCopyDate).toEqual(expect.any(Number));
    expect(copy.uuid).not.toBe(sourceBefore.uuid);
    expect(copy.refUuid).not.toBe(sourceBefore.refUuid);
    expect({
      ...copy,
      uuid: sourceBefore.uuid,
      refUuid: sourceBefore.refUuid,
      stationUuid: sourceBefore.stationUuid,
      poiUuid: sourceBefore.poiUuid,
      parentActionUuid: sourceBefore.parentActionUuid,
      parentCopyDate: sourceBefore.parentCopyDate,
      createdAt: sourceBefore.createdAt,
      updatedAt: sourceBefore.updatedAt,
    }).toEqual(sourceBefore);
    expect(copiedMission.pois[mission.ids.poiA].actionOrderUuids).toEqual([mission.ids.actionA]);
    expect(copiedMission.stations[mission.ids.stationA].actionOrderUuids).toEqual([copy.uuid]);
    expect(copiedMission.stations[mission.ids.stationB]).toEqual(
      before.stations[mission.ids.stationB]
    );
    expect(copiedMission.evas).toEqual(before.evas);
    expect(copiedMission.traverses).toEqual(before.traverses);

    await actionRow(page, copy.name).locator('div[aria-label="Action Name"]').click();
    const nameDialog = page.locator("dialog[open]");
    await nameDialog.getByLabel("Action Name", { exact: true }).fill("Station-only sample");
    await nameDialog.getByText("Save", { exact: true }).click();
    await expect(nameDialog).toHaveCount(0);
    await expect
      .poll(async () => (await mission.read()).actions[copy.uuid].name)
      .toBe("Station-only sample");
    expect((await mission.read()).actions[mission.ids.actionA]).toEqual(sourceBefore);

    await selectPlanningPoi(page, "Reference POI");
    await page.getByLabel("actions_panel", { exact: true }).click();
    await expect(actionRow(page, sourceBefore.name)).toBeVisible();
    await actionRow(page, sourceBefore.name).locator('div[aria-label="Action Name"]').click();
    const sourceNameDialog = page.locator("dialog[open]");
    await sourceNameDialog.getByLabel("Action Name", { exact: true }).fill("Updated POI source");
    await sourceNameDialog.getByText("Save", { exact: true }).click();
    await expect(sourceNameDialog).toHaveCount(0);
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].name)
      .toBe("Updated POI source");
    const afterIndependentEdits = await mission.read();
    expect(afterIndependentEdits.actions[copy.uuid].name).toBe("Station-only sample");
    expect(afterIndependentEdits.pois[mission.ids.poiA].actionOrderUuids).toEqual([
      mission.ids.actionA,
    ]);
    expect(afterIndependentEdits.stations[mission.ids.stationA].actionOrderUuids).toEqual([
      copy.uuid,
    ]);
    expect(afterIndependentEdits.evas).toEqual(before.evas);
    expect(afterIndependentEdits.traverses).toEqual(before.traverses);

    const peer = await page.context().newPage();
    await peer.goto(mission.url);
    await expect(peer.getByLabel("missionNameHeader", { exact: true })).toHaveText(
      (await mission.read()).name
    );
    await selectPlanningStationActions(peer, "Alpha station");
    await expect(actionRow(peer, "Station-only sample")).toBeVisible();
    await peer.getByText("Associated POI Actions", { exact: true }).click();
    await expect(peer.locator('[data-tooltip-content="Action copied to station"]')).toHaveCount(1);
    await peer.reload();
    await expect(peer.getByLabel("missionNameHeader", { exact: true })).toHaveText(
      (await mission.read()).name
    );
    await selectPlanningPoi(peer, "Reference POI");
    await peer.getByLabel("actions_panel", { exact: true }).click();
    await expect(actionRow(peer, "Updated POI source")).toBeVisible();
    expect((await mission.read()).actions[copy.uuid].parentActionUuid).toBe(mission.ids.actionA);
  });

  test("action and task descriptions save independently, Cancel preserves text, and saved text survives reload", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStationActions(page, "Alpha station");
    const row = actionRow(page, "Sample regolith");
    await row.locator('svg[data-icon="caret-right"]').click();

    const actionDescription = "Document the glassy rind.\nKeep the sample sealed.";
    const taskDescription = "Crew task: photograph the contact before sampling.";
    await editTextField(page, "Action Description", actionDescription);
    await editTextField(page, "Task Description", taskDescription);
    await page.locator('div[aria-label="Task Description"]').locator("..").click();
    const cancelDialog = page.locator("dialog[open]");
    await cancelDialog.getByLabel("Task Description", { exact: true }).fill("Discard this draft");
    await cancelDialog.getByText("Cancel", { exact: true }).click();
    await expect(cancelDialog).toHaveCount(0);
    await expect
      .poll(async () => {
        const action = (await mission.read()).actions[mission.ids.actionA];
        return { description: action.description, task: action.descriptionTask };
      })
      .toEqual({ description: actionDescription, task: taskDescription });

    await mission.open(page);
    await selectPlanningStationActions(page, "Alpha station");
    await actionRow(page, "Sample regolith").locator('svg[data-icon="caret-right"]').click();
    const persisted = (await mission.read()).actions[mission.ids.actionA];
    await expect(page.locator('div[aria-label="Action Description"]')).toContainText(
      actionDescription
    );
    await expect(page.locator('div[aria-label="Task Description"]')).toContainText(taskDescription);
    expect(persisted.description).toBe(actionDescription);
    expect(persisted.descriptionTask).toBe(taskDescription);
  });

  test("duration and planned mass boundaries preserve unset versus zero and match parent totals", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStationActions(page, "Alpha station");
    const row = actionRow(page, "Sample regolith");
    await row.locator('svg[data-icon="caret-right"]').click();

    await expect(actionTotal(page, "Total Action Time (mins):")).toHaveText("6");
    await expect(actionTotal(page, "Total Planned Mass (g):")).toHaveText("0");
    await rejectNumericField(page, "Duration in minutes", "", "Required");
    expect((await mission.read()).actions[mission.ids.actionA].duration).toBe(6);

    const fractionalDuration = await openPlanningField(page, "Duration in minutes");
    const durationInput = fractionalDuration.getByLabel("Duration in minutes", { exact: true });
    await durationInput.fill("1.5");
    await expect(durationInput).toHaveValue("15");
    await fractionalDuration.getByText("Save", { exact: true }).click();
    await expect(fractionalDuration).toHaveCount(0);
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].duration)
      .toBe(15);
    await expect(actionTotal(page, "Total Action Time (mins):")).toHaveText("15");

    await saveNumericField(page, "Duration in minutes", "0");
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].duration)
      .toBe(0);
    await expect(actionTotal(page, "Total Action Time (mins):")).toHaveText("0");
    await saveNumericField(page, "Duration in minutes", "9999");
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].duration)
      .toBe(9999);
    await expect(actionTotal(page, "Total Action Time (mins):")).toHaveText("9999");
    await rejectNumericField(
      page,
      "Duration in minutes",
      "10000",
      "Must be at no more than 4 characters"
    );
    expect((await mission.read()).actions[mission.ids.actionA].duration).toBe(9999);
    await saveNumericField(page, "Duration in minutes", "-1");
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].duration)
      .toBe(-1);
    await expect(actionTotal(page, "Total Action Time (mins):")).toHaveText("-1");

    await saveNumericField(page, "Planned Sample Mass", "");
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].mass)
      .toBeNull();
    await expect(actionTotal(page, "Total Planned Mass (g):")).toHaveText("0");
    await saveNumericField(page, "Planned Sample Mass", "0");
    await expect.poll(async () => (await mission.read()).actions[mission.ids.actionA].mass).toBe(0);
    await expect(actionTotal(page, "Total Planned Mass (g):")).toHaveText("0");

    const fractionalMass = await openPlanningField(page, "Planned Sample Mass");
    const massInput = fractionalMass.getByLabel("Planned Sample Mass", { exact: true });
    await massInput.fill("1.2");
    await expect(massInput).toHaveValue("12");
    await fractionalMass.getByText("Save", { exact: true }).click();
    await expect(fractionalMass).toHaveCount(0);
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].mass)
      .toBe(12);
    await expect(actionTotal(page, "Total Planned Mass (g):")).toHaveText("12");

    await saveNumericField(page, "Planned Sample Mass", "9999");
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].mass)
      .toBe(9999);
    await expect(actionTotal(page, "Total Planned Mass (g):")).toHaveText("9999");
    await rejectNumericField(
      page,
      "Planned Sample Mass",
      "10000",
      "Must be at no more than 4 characters"
    );
    expect((await mission.read()).actions[mission.ids.actionA].mass).toBe(9999);
    await saveNumericField(page, "Planned Sample Mass", "-1");
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].mass)
      .toBe(-1);
    await expect(actionTotal(page, "Total Planned Mass (g):")).toHaveText("-1");

    await mission.open(page);
    await selectPlanningStationActions(page, "Alpha station");
    const persisted = (await mission.read()).actions[mission.ids.actionA];
    expect(persisted.duration).toBe(-1);
    expect(persisted.mass).toBe(-1);
  });
});
