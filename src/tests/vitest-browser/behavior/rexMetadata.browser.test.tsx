import { exactText, isVisible } from "./browserAssertions";
import type { BrowserPage as Page } from "vitest/browser";
import { test as base, expect } from "./missionHarness";
import {
  cancelPlanningField,
  choosePlanningEvaAction,
  enablePlanningEditMode,
  openPlanningField,
  planningEvaRow,
  planningField,
  savePlanningField,
} from "./planningHelpers";

const test = base.extend({ scenario: "execution" as BehavioralScenario });

async function selectRex(page: Page, family: string, evaUuid: string) {
  await page.getByLabelText("evas Section", { exact: true }).click();
  const showAll = page.getByLabelText("Show All EVAs", { exact: true });
  if (await isVisible(showAll)) await showAll.click();
  await planningEvaRow(page, family).getBySelector("select").first().selectOptions(evaUuid);
}

test("REX names are family-scoped and Maestro control survives remount without renaming the copied EVA", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.evas[mission.ids.evaA].description = "Keep planned EVA notes";
  });
  const before = await mission.read();
  await mission.open();
  await enablePlanningEditMode(page);
  await selectRex(page, "Survey Alpha", mission.ids.evaA);
  await choosePlanningEvaAction(page, "Survey Alpha", "Add REX");
  await expect.poll(async () => Object.keys((await mission.read()).rexes).length).toBe(3);
  const arranged = await mission.read();
  const created = Object.values(arranged.rexes).find((rex) => !before.rexes[rex.uuid]);
  expect(created).toBeDefined();
  expect(created).not.toHaveProperty("description");
  expect(arranged.evas[created.evaUuid].refUuid).toBe(before.evas[mission.ids.evaA].refUuid);
  expect(arranged.evas[created.evaUuid].description).toBe("Keep planned EVA notes");
  expect(arranged.evas[mission.ids.evaA]).toEqual(before.evas[mission.ids.evaA]);
  await savePlanningField(page, "REX Title", "Second Alpha run");
  await cancelPlanningField(page, "REX Title", "Discarded run name");
  for (const [value, error] of [
    ["", "Required"],
    ["stopped ALPHA", "Name must be unique"],
  ]) {
    const dialog = await openPlanningField(page, "REX Title");
    await dialog.getByLabelText("REX Title", { exact: true }).fill(value);
    await expect.element(dialog.getByText(error, { exact: true })).toBeVisible();
    await expect.element(dialog.getByText("Save", { exact: true })).toBeDisabled();
    await expect.element(dialog.getByLabelText("REX Title", { exact: true })).toBeVisible();
    expect((await mission.read()).rexes[created.uuid].name).toBe("Second Alpha run");
    await dialog.getByText("Cancel", { exact: true }).click();
  }
  // The same name in another planned EVA family is allowed.
  await savePlanningField(page, "REX Title", "Active Bravo");
  await selectRex(page, "Survey Alpha", mission.ids.rexEvaA);
  await savePlanningField(page, "REX Title", "First Alpha run");
  await selectRex(page, "Survey Alpha", created.evaUuid);
  await planningField(page, "EVA Title").getBySelector("..").click();
  await expect.poll(() => page.getBySelector("dialog[open]").length).toBe(0);
  await page.getByLabelText("rex_info_panel", { exact: true }).click();
  await page.getBySelector("input#maestroCheckbox").click();
  await expect
    .poll(async () => (await mission.read()).rexes[created.uuid].maestroControlled)
    .toBe(true);

  await mission.open();
  await selectRex(page, "Survey Alpha", created.evaUuid);
  await expect
    .element(planningField(page, "REX Title"))
    .toHaveTextContent(exactText("Active Bravo"));
  await page.getByLabelText("rex_info_panel", { exact: true }).click();
  const maestroValue = page
    .getByText("Maestro Controlled:", { exact: true })
    .getBySelector("../..");
  await expect.element(maestroValue).toHaveTextContent("Yes");
  const after = await mission.read();
  expect(after.evas).toEqual(arranged.evas);
  expect(after.rexes[created.uuid]).not.toHaveProperty("description");
  expect(after.stations).toEqual(arranged.stations);
  expect(after.actions).toEqual(arranged.actions);
  expect(after.traverses).toEqual(arranged.traverses);
  expect(after.rexes[mission.ids.rexB]).toEqual(before.rexes[mission.ids.rexB]);
  expect(after.rexes[mission.ids.rexA]).toEqual({
    ...before.rexes[mission.ids.rexA],
    name: "First Alpha run",
    updatedAt: expect.any(Number),
  });

  await mission.open();
  await selectRex(page, "Survey Alpha", created.evaUuid);
  await expect
    .element(planningField(page, "REX Title"))
    .toHaveTextContent(exactText("Active Bravo"));
  await expect
    .element(planningField(page, "EVA Title"))
    .toHaveTextContent(exactText("Survey Alpha"));
  await page.getByLabelText("rex_info_panel", { exact: true }).click();
  await expect
    .element(page.getByText("Maestro Controlled:", { exact: true }).getBySelector("../.."))
    .toHaveTextContent("Yes");
  await selectRex(page, "Survey Alpha", mission.ids.rexEvaA);
  await expect
    .element(planningField(page, "REX Title"))
    .toHaveTextContent(exactText("First Alpha run"));
});
