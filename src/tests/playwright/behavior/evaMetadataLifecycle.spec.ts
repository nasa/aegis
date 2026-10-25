import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import {
  cancelPlanningField,
  enablePlanningEditMode,
  openPlanningField,
  planningEvaRow,
  planningField,
  savePlanningField,
} from "./planningHelpers";

async function selectPlannedEva(page: Page, name: string, plannedEvaUuid: string): Promise<void> {
  await page.getByLabel("evas Section", { exact: true }).click();
  const showAll = page.getByLabel("Show All EVAs", { exact: true });
  if (await showAll.isVisible()) await showAll.click();
  const row = planningEvaRow(page, name);
  const dropdown = row.locator("select").first();
  if ((await dropdown.inputValue()) !== plannedEvaUuid) {
    await dropdown.selectOption(plannedEvaUuid);
  }
  const title = planningField(page, "EVA Title");
  if (!(await title.isVisible()) || (await title.textContent()) !== name) {
    await row.getByText(name, { exact: true }).first().click();
  }
  await expect(planningField(page, "EVA Title")).toHaveText(name);
}

async function selectRex(page: Page, family: string, rexEvaUuid: string): Promise<void> {
  await page.getByLabel("evas Section", { exact: true }).click();
  const showAll = page.getByLabel("Show All EVAs", { exact: true });
  if (await showAll.isVisible()) await showAll.click();
  await planningEvaRow(page, family).locator("select").first().selectOption(rexEvaUuid);
}

test.describe("EVA metadata lifecycle", () => {
  test.use({ scenario: "execution" });

  test("UTC fields combine an initially empty date and time only after explicit saves and preserve canceled edits", async ({
    page,
    context,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.evas[mission.ids.evaA].datetime = null;
    });
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlannedEva(page, "Survey Alpha", mission.ids.evaA);
    await page.getByLabel("info_panel", { exact: true }).click();
    const peer = await context.newPage();
    await mission.open(peer);
    await enablePlanningEditMode(peer);
    await selectPlannedEva(peer, "Survey Alpha", mission.ids.evaA);
    await peer.getByLabel("info_panel", { exact: true }).click();
    await savePlanningField(page, "evaDate", "2026-10-25");
    expect((await mission.read()).evas[mission.ids.evaA].datetime).toBeNull();
    await savePlanningField(page, "evaTime", "12:34:56");
    await expect
      .poll(async () => (await mission.read()).evas[mission.ids.evaA].datetime)
      .toBe(Date.parse("2026-10-25T12:34:56Z"));
    await expect(planningField(peer, "evaDate")).toHaveText("2026-10-25");
    await expect(planningField(peer, "evaTime")).toHaveText("12:34:56");
    await cancelPlanningField(peer, "evaDate", "2030-01-01");
    await cancelPlanningField(peer, "evaTime", "00:00:00");
    expect((await mission.read()).evas[mission.ids.evaA].datetime).toBe(
      Date.parse("2026-10-25T12:34:56Z")
    );
    await mission.open(page);
    await selectPlannedEva(page, "Survey Alpha", mission.ids.evaA);
    await page.getByLabel("info_panel", { exact: true }).click();
    await expect(planningField(page, "evaDate")).toHaveText("2026-10-25");
    await expect(planningField(page, "evaTime")).toHaveText("12:34:56");
  });

  test("validates plan metadata with two editors while REX names stay family-scoped", async ({
    page,
    context,
    mission,
  }) => {
    // A valid starting UTC value ensures the local date/time editor has completed
    // its initial selected-EVA synchronization before either component is edited.
    await mission.change((doc) => {
      doc.evas[mission.ids.evaA].datetime = Date.parse("2024-01-02T01:02:03Z");
    });
    const before = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlannedEva(page, "Survey Alpha", mission.ids.evaA);
    await page.getByLabel("info_panel", { exact: true }).click();
    const peer = await context.newPage();
    await mission.open(peer);
    await enablePlanningEditMode(peer);
    await selectPlannedEva(peer, "Survey Alpha", mission.ids.evaA);
    await peer.getByLabel("info_panel", { exact: true }).click();

    await cancelPlanningField(page, "EVA Title", "Discard this name");
    for (const [value, error] of [
      ["", "Required"],
      ["survey bravo", "Name must be unique"],
    ]) {
      const dialog = await openPlanningField(page, "EVA Title");
      await dialog.getByLabel("EVA Title", { exact: true }).fill(value);
      await expect(dialog.getByText(error, { exact: true })).toBeVisible();
      await expect(dialog.getByText("Save", { exact: true })).toBeDisabled();
      await expect(dialog.getByLabel("EVA Title", { exact: true })).toBeVisible();
      expect((await mission.read()).evas[mission.ids.evaA].name).toBe("Survey Alpha");
      await dialog.getByText("Cancel", { exact: true }).click();
    }

    const title = "Survey Alpha — north ridge";
    await savePlanningField(page, "EVA Title", title);
    await expect(planningEvaRow(peer, title)).toBeVisible();
    const description = 'Primary transect α & <ice>\nSecond line: "north"';
    await cancelPlanningField(page, "EVA Description", "Discarded EVA description");
    await savePlanningField(page, "EVA Description", description);
    await expect(planningField(peer, "EVA Description")).toHaveText(description);
    await cancelPlanningField(page, "EVA Description", "Discard after commit");

    const colorControl = page.locator('[class*="propertyPathColor"]');
    await colorControl.click();
    const colorSwatch = page.locator('[class*="colorPickerPopover"] [title="#009CE0"]');
    await expect(colorSwatch).toBeVisible();
    await colorSwatch.click();
    await expect
      .poll(async () => (await mission.read()).evas[mission.ids.evaA].traverseColor)
      .toBe("#009ce0");
    await page.locator('[class*="colorPickerCover"]').click();

    for (const [label, value, error] of [
      ["Duration", "100000", "Must be at no more than 5 characters"],
      ["Average Traverse Rate", "1.2.3", "Not a valid number/float"],
      ["Average Traverse Rate", "10000", "Must be at no more than 4 characters"],
    ]) {
      const dialog = await openPlanningField(page, label);
      await dialog.getByLabel(label, { exact: true }).fill(value);
      await expect(dialog.getByText(error, { exact: true })).toBeVisible();
      await expect(dialog.getByText("Save", { exact: true })).toBeDisabled();
      await expect(dialog.getByLabel(label, { exact: true })).toBeVisible();
      await dialog.getByText("Cancel", { exact: true }).click();
    }
    await savePlanningField(page, "Duration", "360");
    await savePlanningField(page, "Average Traverse Rate", "3.5");
    await cancelPlanningField(page, "Average Traverse Rate", "discarded rate");

    // A plan and a REX can share a title because their uniqueness scopes are separate.
    await selectRex(page, title, mission.ids.rexEvaA);
    await savePlanningField(page, "REX Title", title);
    await expect(planningField(page, "EVA Title")).toHaveText(title);
    await expect(planningField(page, "REX Title")).toHaveText(title);
    await selectPlannedEva(page, title, mission.ids.evaA);
    await page.getByLabel("info_panel", { exact: true }).click();

    const date = "2025-02-20";
    const time = "11:22:33";
    const invalidDate = await openPlanningField(page, "evaDate");
    await invalidDate.getByLabel("evaDate", { exact: true }).fill("2025/02/20");
    await expect(
      invalidDate.getByText("Must be in YYYY-MM-DD format", { exact: true })
    ).toBeVisible();
    await expect(invalidDate.getByText("Save", { exact: true })).toBeDisabled();
    await expect(invalidDate.getByLabel("evaDate", { exact: true })).toBeVisible();
    await invalidDate.getByText("Cancel", { exact: true }).click();
    await savePlanningField(page, "evaDate", date);
    await savePlanningField(page, "evaTime", time);
    await expect
      .poll(async () => (await mission.read()).evas[mission.ids.evaA].datetime)
      .toBe(Date.parse(`${date}T${time}Z`));
    for (const client of [page, peer]) {
      await expect(planningField(client, "EVA Description")).toHaveText(description);
      await expect(planningField(client, "Duration")).toHaveText("360");
      await expect(planningField(client, "Average Traverse Rate")).toHaveText("3.5");
      await expect(planningField(client, "evaDate")).toHaveText(date);
      await expect(planningField(client, "evaTime")).toHaveText(time);
    }

    const after = await mission.read();
    expect(after.evas[mission.ids.evaA]).toEqual({
      ...before.evas[mission.ids.evaA],
      name: title,
      description,
      traverseColor: "#009ce0",
      duration: 360,
      traverseRate: 3.5,
      datetime: Date.parse(`${date}T${time}Z`),
      updatedAt: expect.any(Number),
    });
    expect(after.evas[mission.ids.rexEvaA]).toEqual(before.evas[mission.ids.rexEvaA]);
    expect(after.stations).toEqual(before.stations);
    expect(after.traverses).toEqual(before.traverses);
    expect(after.actions).toEqual(before.actions);
    expect(after.folders).toEqual(before.folders);
    expect(after.rexes[mission.ids.rexA]).toEqual({
      ...before.rexes[mission.ids.rexA],
      name: title,
      updatedAt: expect.any(Number),
    });
    expect(after.rexes[mission.ids.rexB]).toEqual(before.rexes[mission.ids.rexB]);

    const freshPage = await context.newPage();
    await mission.open(freshPage);
    await enablePlanningEditMode(freshPage);
    await selectPlannedEva(freshPage, title, mission.ids.evaA);
    await freshPage.getByLabel("info_panel", { exact: true }).click();
    await expect(planningField(freshPage, "EVA Description")).toHaveText(description);
    await expect(planningField(freshPage, "Duration")).toHaveText("360");
    await expect(planningField(freshPage, "Average Traverse Rate")).toHaveText("3.5");
    await expect(planningField(freshPage, "evaDate")).toHaveText(date);
    await expect(planningField(freshPage, "evaTime")).toHaveText(time);
    await selectRex(freshPage, title, mission.ids.rexEvaA);
    await expect(planningField(freshPage, "REX Title")).toHaveText(title);
    await expect(planningField(freshPage, "EVA Title")).toHaveText(title);
  });
});
