import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { openExecutionInfo, selectExecution } from "./executionHelpers";
import { enablePlanningEditMode, planningField, savePlanningField } from "./planningHelpers";

test.use({ scenario: "execution" });

function policyControl(page: Page): Locator {
  return page.getByText("Execute Edit Mode:", { exact: true }).locator("../..");
}

async function startAlpha(
  page: Page,
  mission: BehavioralMission,
  mode: "none" | "unrestricted" | "limited"
) {
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
  const action = page.getByRole("listitem").filter({
    has: planningField(page, "Action Name").filter({ hasText: "Sample regolith" }),
  });
  await expect(action).toBeVisible();
  return action;
}

async function actionRow(page: Page, name: string): Promise<Locator> {
  const row = page.getByRole("listitem").filter({
    has: planningField(page, "Action Name").filter({ hasText: name }),
  });
  await expect(row).toBeVisible();
  return row;
}

function actionItems(page: Page): Locator {
  return page.locator('ul[class*="actionlist"] > li');
}

async function lettersByName(page: Page, names: string[]): Promise<Record<string, string>> {
  const rows = await actionItems(page).evaluateAll((items) =>
    items.map((item) => ({
      text: item.textContent ?? "",
      ordinal: item.firstElementChild?.textContent?.trim() ?? "",
    }))
  );
  return Object.fromEntries(
    names.map((name) => [name, rows.find((row) => row.text.includes(name))?.ordinal ?? ""])
  );
}

test("None blocks original and added REX action edits", async ({ page, mission }) => {
  await startAlpha(page, mission, "none");
  const addedUuid = randomUUID();
  const originalAction = (await mission.read()).actions[mission.ids.rexActionA];
  await mission.change((doc) => {
    doc.actions[addedUuid] = {
      ...originalAction,
      uuid: addedUuid,
      refUuid: randomUUID(),
      name: "None added action",
      stationUuid: mission.ids.rexStationA,
    };
    doc.stations[mission.ids.rexStationA].actionOrderUuids.push(addedUuid);
  });
  await openAlphaActions(page, mission);
  await expect(page.getByText("Add Action", { exact: true })).toHaveCount(0);

  const noneBefore = await mission.read();
  for (const [name, uuid] of [
    ["Sample regolith", mission.ids.rexActionA],
    ["None added action", addedUuid],
  ]) {
    const row = await actionRow(page, name);
    await planningField(page, "Action Name").filter({ hasText: name }).click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await row.locator('svg[data-icon="caret-right"]').click();
    await row.locator('div[aria-label="Duration in minutes"]').click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(row.locator('svg[data-icon="ellipsis-vertical"]')).toHaveCount(0);
    expect((await mission.read()).actions[uuid].enabled).toBe(noneBefore.actions[uuid].enabled);
  }
  expect((await mission.read()).actions).toEqual(noneBefore.actions);
  await mission.open(page);
  await openAlphaActions(page, mission);
  expect((await mission.read()).actions).toEqual(noneBefore.actions);
  expect((await mission.read()).rexes[mission.ids.rexA].executeEditState).toEqual(
    noneBefore.rexes[mission.ids.rexA].executeEditState
  );
});

test("Unrestricted mode edits and duplicates/deletes a protected original action", async ({
  page,
  mission,
}) => {
  await startAlpha(page, mission, "unrestricted");
  await openAlphaActions(page, mission);
  await savePlanningField(page, "Action Name", "Unrestricted action wording");
  let unrestrictedAction = await actionRow(page, "Unrestricted action wording");
  await unrestrictedAction.locator('svg[data-icon="caret-right"]').click();
  await savePlanningField(page, "Duration in minutes", "19");
  unrestrictedAction = await actionRow(page, "Unrestricted action wording");
  await unrestrictedAction.locator('svg[data-icon="ellipsis-vertical"]').click();
  const menu = page.locator("dialog[open]");
  await expect(menu.getByText("Duplicate Action", { exact: true })).toBeVisible();
  await expect(menu.getByText("Delete Action", { exact: true })).toBeVisible();
  const beforeDuplicate = await mission.read();
  await menu.getByText("Duplicate Action", { exact: true }).click();
  await expect
    .poll(async () => Object.keys((await mission.read()).actions).length)
    .toBe(Object.keys(beforeDuplicate.actions).length + 1);
  const duplicate = Object.values((await mission.read()).actions).find(
    (action) => !beforeDuplicate.actions[action.uuid]
  )!;
  expect(duplicate.stationUuid).toBe(mission.ids.rexStationA);
  const duplicateCard = page
    .getByRole("listitem")
    .filter({ has: planningField(page, "Action Name").filter({ hasText: duplicate.name }) })
    .last();
  await duplicateCard.locator('svg[data-icon="ellipsis-vertical"]').click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("dialog[open]").getByText("Delete Action", { exact: true }).click();
  await expect.poll(async () => (await mission.read()).actions[duplicate.uuid]).toBeUndefined();
  const saved = await mission.read();
  expect(saved.actions[mission.ids.rexActionA]).toMatchObject({
    name: "Unrestricted action wording",
    duration: 19,
  });
  await mission.open(page);
  expect((await mission.read()).actions[mission.ids.rexActionA]).toMatchObject({
    name: "Unrestricted action wording",
    duration: 19,
  });
});

test("limited action letters follow identity across reorder, removal, new parent, restart and reload", async ({
  page,
  mission,
}) => {
  const initial = await mission.read();
  const originalIds = [mission.ids.rexActionA, randomUUID(), randomUUID()];
  await mission.change((doc) => {
    doc.stations[mission.ids.rexStationA].actionOrderUuids = originalIds;
    originalIds.slice(1).forEach((uuid, index) => {
      doc.actions[uuid] = {
        ...initial.actions[mission.ids.rexActionA],
        uuid,
        refUuid: randomUUID(),
        name: `Letter original ${index + 2}`,
        stationUuid: mission.ids.rexStationA,
      };
    });
  });
  await startAlpha(page, mission, "limited");
  await openAlphaActions(page, mission);
  await expect(actionItems(page)).toHaveCount(3);
  expect(
    await lettersByName(page, ["Sample regolith", "Letter original 2", "Letter original 3"])
  ).toEqual({
    "Sample regolith": "A",
    "Letter original 2": "B",
    "Letter original 3": "C",
  });

  const addedOriginalParent: string[] = [];
  for (const label of ["Letter added original parent 1", "Letter added original parent 2"]) {
    const previous = await mission.read();
    await page.getByText("Add Action", { exact: true }).click();
    await expect
      .poll(
        async () =>
          Object.keys((await mission.read()).actions).filter((uuid) => !previous.actions[uuid])
            .length
      )
      .toBe(1);
    const newUuid = Object.keys((await mission.read()).actions).find(
      (uuid) => !previous.actions[uuid]
    )!;
    const created = (await mission.read()).actions[newUuid];
    await (await actionRow(page, created.name)).locator('div[aria-label="Action Name"]').click();
    await page.locator("dialog[open]").getByLabel("Action Name", { exact: true }).fill(label);
    await page.locator("dialog[open]").getByText("Save", { exact: true }).click();
    addedOriginalParent.push(newUuid);
  }
  const current = await mission.read();
  const addedFromOriginal = current.rexes[mission.ids.rexA].executeEditState!.addedActionUuids;
  expect(addedFromOriginal).toContain(addedOriginalParent[0]);
  expect(addedFromOriginal).toContain(addedOriginalParent[1]);
  expect(
    Object.values(
      await lettersByName(page, [
        "Sample regolith",
        "Letter original 2",
        "Letter original 3",
        "Letter added original parent 1",
        "Letter added original parent 2",
      ])
    )
  ).toEqual(["A", "B", "C", "D", "E"]);

  const addedStationUuid = randomUUID();
  const addedParentActions = [randomUUID(), randomUUID()];
  const stationTemplate = (await mission.read()).stations[mission.ids.rexStationA];
  const actionTemplate = (await mission.read()).actions[mission.ids.rexActionA];
  await mission.change((doc) => {
    const state = doc.rexes[mission.ids.rexA].executeEditState!;
    doc.stations[addedStationUuid] = {
      ...stationTemplate,
      uuid: addedStationUuid,
      name: "Letter added parent",
      actionOrderUuids: addedParentActions,
    };
    state.addedStationUuids.push(addedStationUuid);
    addedParentActions.forEach((uuid, index) => {
      doc.actions[uuid] = {
        ...actionTemplate,
        uuid,
        refUuid: randomUUID(),
        name: `Letter new parent ${index + 1}`,
        stationUuid: addedStationUuid,
      };
      state.addedActionUuids.push(uuid);
    });
    doc.evas[mission.ids.rexEvaA].sequence.push({ type: "station", uuid: addedStationUuid });
  });
  const executionRow = await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);
  await expect(executionRow.getByText("Letter added parent", { exact: true })).toBeVisible();
  await executionRow.getByText("Letter added parent", { exact: true }).click();
  await page.getByLabel("actions_panel", { exact: true }).click();
  await expect(actionItems(page)).toHaveCount(2);
  expect(await lettersByName(page, ["Letter new parent 1", "Letter new parent 2"])).toEqual({
    "Letter new parent 1": "0+A",
    "Letter new parent 2": "0+B",
  });
  const addedParentRows = actionItems(page);
  await addedParentRows
    .nth(0)
    .locator('svg[data-icon="grip-vertical"]')
    .locator("..")
    .dragTo(addedParentRows.nth(1));
  await expect
    .poll(async () => lettersByName(page, ["Letter new parent 1", "Letter new parent 2"]))
    .toEqual({
      "Letter new parent 2": "0+A",
      "Letter new parent 1": "0+B",
    });
  const parentActionRow = await actionRow(page, "Letter new parent 2");
  await parentActionRow.locator('svg[data-icon="ellipsis-vertical"]').click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("dialog[open]").getByText("Delete Action", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).actions[addedParentActions[1]])
    .toBeUndefined();
  await expect(actionItems(page)).toHaveCount(1);
  expect(await lettersByName(page, ["Letter new parent 1"])).toEqual({
    "Letter new parent 1": "0+A",
  });

  const beforeRemove = await mission.read();
  await mission.change((doc) => {
    doc.stations[mission.ids.rexStationA].actionOrderUuids = originalIds
      .filter((uuid) => uuid !== originalIds[1])
      .concat(addedOriginalParent);
  });
  await executionRow.getByText("Alpha station", { exact: true }).click();
  await page.getByLabel("actions_panel", { exact: true }).click();
  await expect(actionItems(page)).toHaveCount(4);
  await expect
    .poll(async () =>
      lettersByName(page, [
        "Sample regolith",
        "Letter original 3",
        "Letter added original parent 1",
        "Letter added original parent 2",
      ])
    )
    .toEqual({
      "Sample regolith": "A",
      "Letter original 3": "C",
      "Letter added original parent 1": "D",
      "Letter added original parent 2": "E",
    });
  const reordered = actionItems(page);
  await reordered
    .nth(0)
    .locator('svg[data-icon="grip-vertical"]')
    .locator("..")
    .dragTo(reordered.nth(3));
  await expect
    .poll(async () =>
      lettersByName(page, [
        "Sample regolith",
        "Letter original 3",
        "Letter added original parent 1",
        "Letter added original parent 2",
      ])
    )
    .toEqual({
      "Letter original 3": "C",
      "Letter added original parent 1": "D",
      "Letter added original parent 2": "E",
      "Sample regolith": "A",
    });

  await openExecutionInfo(page, "Survey Alpha", mission.ids.rexEvaA);
  if ((await mission.read()).rexes[mission.ids.rexA].isRunning) {
    await page.getByLabel("Stop Execution", { exact: true }).click();
  }
  await expect(page.getByLabel("Execute EVA", { exact: true })).toBeVisible();
  await page.getByLabel("Execute EVA", { exact: true }).click();
  await expect(page.getByLabel("Stop Execution", { exact: true })).toBeVisible();
  await mission.open(page);
  const afterReload = await mission.read();
  expect(afterReload.rexes[mission.ids.rexA].executeEditMode).toBe("limited");
  expect(afterReload.rexes[mission.ids.rexA].executeEditState).toEqual(
    beforeRemove.rexes[mission.ids.rexA].executeEditState
  );
  expect(afterReload.stations[mission.ids.rexStationA].actionOrderUuids).toEqual([
    originalIds[2],
    addedOriginalParent[0],
    addedOriginalParent[1],
    originalIds[0],
  ]);
  const reloadedExecutionRow = await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);
  await reloadedExecutionRow.getByText("Alpha station", { exact: true }).click();
  await page.getByLabel("actions_panel", { exact: true }).click();
  await expect
    .poll(async () =>
      lettersByName(page, [
        "Sample regolith",
        "Letter original 3",
        "Letter added original parent 1",
        "Letter added original parent 2",
      ])
    )
    .toEqual({
      "Letter original 3": "C",
      "Letter added original parent 1": "D",
      "Letter added original parent 2": "E",
      "Sample regolith": "A",
    });
  expect((await mission.read()).actions[addedParentActions[0]]).toBeDefined();
});
