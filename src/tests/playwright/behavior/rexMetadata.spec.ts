import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import {
  cancelPlanningField,
  choosePlanningEvaAction,
  enablePlanningEditMode,
  openPlanningField,
  planningEvaRow,
  planningField,
  savePlanningField,
} from "./planningHelpers";

test.use({ scenario: "execution" });

async function selectRex(page: Page, family: string, evaUuid: string) {
  await page.getByLabel("evas Section", { exact: true }).click();
  const showAll = page.getByLabel("Show All EVAs", { exact: true });
  if (await showAll.isVisible()) await showAll.click();
  await planningEvaRow(page, family).locator("select").first().selectOption(evaUuid);
}

test("REX names are family-scoped and Maestro control persists without renaming the copied EVA", async ({
  page,
  context,
  mission,
}) => {
  const before = await mission.read();
  await mission.open(page);
  await enablePlanningEditMode(page);
  await selectRex(page, "Survey Alpha", mission.ids.evaA);
  await choosePlanningEvaAction(page, "Survey Alpha", "Add REX");
  await expect.poll(async () => Object.keys((await mission.read()).rexes).length).toBe(3);
  const arranged = await mission.read();
  const created = Object.values(arranged.rexes).find((rex) => !before.rexes[rex.uuid]);
  expect(created).toBeDefined();
  expect(arranged.evas[created.evaUuid].refUuid).toBe(before.evas[mission.ids.evaA].refUuid);
  await savePlanningField(page, "REX Title", "Second Alpha run");
  await cancelPlanningField(page, "REX Title", "Discarded run name");
  for (const [value, error] of [
    ["", "Required"],
    ["stopped ALPHA", "Name must be unique"],
  ]) {
    const dialog = await openPlanningField(page, "REX Title");
    await dialog.getByLabel("REX Title", { exact: true }).fill(value);
    await expect(dialog.getByText(error, { exact: true })).toBeVisible();
    await dialog.getByText("Save", { exact: true }).click();
    await expect(dialog.getByLabel("REX Title", { exact: true })).toBeVisible();
    expect((await mission.read()).rexes[created.uuid].name).toBe("Second Alpha run");
    await dialog.getByText("Cancel", { exact: true }).click();
  }
  // The same name in another planned EVA family is allowed.
  await savePlanningField(page, "REX Title", "Active Bravo");
  await selectRex(page, "Survey Alpha", mission.ids.rexEvaA);
  await savePlanningField(page, "REX Title", "First Alpha run");
  await selectRex(page, "Survey Alpha", created.evaUuid);
  await planningField(page, "EVA Title").locator("..").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.getByLabel("rex_info_panel", { exact: true }).click();
  await page.locator("input#maestroCheckbox").check();
  await expect
    .poll(async () => (await mission.read()).rexes[created.uuid].maestroControlled)
    .toBe(true);
  const peer = await context.newPage();
  await mission.open(peer);
  await selectRex(peer, "Survey Alpha", created.evaUuid);
  await expect(planningField(peer, "REX Title")).toHaveText("Active Bravo");
  await peer.getByLabel("rex_info_panel", { exact: true }).click();
  const maestroValue = peer.getByText("Maestro Controlled:", { exact: true }).locator("../..");
  await expect(maestroValue).toContainText("Yes");
  const after = await mission.read();
  expect(after.evas).toEqual(arranged.evas);
  expect(after.stations).toEqual(arranged.stations);
  expect(after.actions).toEqual(arranged.actions);
  expect(after.traverses).toEqual(arranged.traverses);
  expect(after.rexes[mission.ids.rexB]).toEqual(before.rexes[mission.ids.rexB]);
  expect(after.rexes[mission.ids.rexA]).toEqual({
    ...before.rexes[mission.ids.rexA],
    name: "First Alpha run",
    updatedAt: expect.any(Number),
  });
  for (const client of [page, peer]) {
    await mission.open(client);
    await selectRex(client, "Survey Alpha", created.evaUuid);
    await expect(planningField(client, "REX Title")).toHaveText("Active Bravo");
    await expect(planningField(client, "EVA Title")).toHaveText("Survey Alpha");
    await client.getByLabel("rex_info_panel", { exact: true }).click();
    await expect(
      client.getByText("Maestro Controlled:", { exact: true }).locator("../..")
    ).toContainText("Yes");
    await selectRex(client, "Survey Alpha", mission.ids.rexEvaA);
    await expect(planningField(client, "REX Title")).toHaveText("First Alpha run");
  }
});

for (const otherRunning of [false, true]) {
  test(`deleting a selected historical REX preserves its graph boundaries and clears stale controls with ${otherRunning ? "another REX active" : "no active REX"}`, async ({
    page,
    context,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.rexes[mission.ids.rexB].isRunning = otherRunning;
    });
    const before = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectRex(page, "Survey Alpha", mission.ids.rexEvaA);
    const peer = await context.newPage();
    await mission.open(peer);
    await selectRex(peer, "Survey Alpha", mission.ids.rexEvaA);
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByLabel("deleteEva", { exact: true }).click();
    expect(await mission.read()).toEqual(before);
    await expect(planningField(peer, "REX Title")).toHaveText("Stopped Alpha");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByLabel("deleteEva", { exact: true }).click();
    await expect.poll(async () => (await mission.read()).rexes[mission.ids.rexA]).toBeUndefined();
    const expected = structuredClone(before);
    delete expected.rexes[mission.ids.rexA];
    delete expected.evas[mission.ids.rexEvaA];
    const sequence = before.evas[mission.ids.rexEvaA].sequence;
    const stationIds = sequence
      .filter((entry) => entry.type === "station")
      .map((entry) => entry.uuid);
    const traverseIds = sequence
      .filter((entry) => entry.type === "traverse")
      .map((entry) => entry.uuid);
    for (const uuid of stationIds) delete expected.stations[uuid];
    for (const uuid of traverseIds) delete expected.traverses[uuid];
    for (const action of Object.values(before.actions)) {
      if (stationIds.includes(action.stationUuid) || traverseIds.includes(action.traverseUuid))
        delete expected.actions[action.uuid];
    }
    expect(await mission.read()).toEqual(expected);
    for (const client of [page, peer]) {
      await expect(planningField(client, "REX Title")).toHaveCount(0);
      await expect(client.getByLabel("rex_info_panel", { exact: true })).toHaveCount(0);
      await expect(
        planningEvaRow(client, "Survey Alpha").locator(
          'option[value="' + mission.ids.rexEvaA + '"]'
        )
      ).toHaveCount(0);
      // Live restoration of the plan selection is tracked separately in REX-027;
      // these assertions establish deletion boundaries and fresh-page recovery.
      await mission.open(client);
      await selectRex(client, "Survey Bravo", mission.ids.evaB);
      await expect(planningEvaRow(client, "Survey Alpha")).toBeVisible();
      await planningEvaRow(client, "Survey Alpha")
        .getByText("Survey Alpha", { exact: true })
        .click();
      await expect(planningField(client, "EVA Title")).toHaveText("Survey Alpha");
      await selectRex(client, "Survey Bravo", mission.ids.rexEvaB);
      await expect(planningField(client, "REX Title")).toHaveText("Active Bravo");
    }
    expect(await mission.read()).toEqual(expected);
  });
}
