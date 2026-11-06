import { exactText, isVisible } from "./browserAssertions";
import type { BrowserPage as Page } from "vitest/browser";
import { test as base, expect } from "./missionHarness";
import {
  cancelPlanningField,
  enablePlanningEditMode,
  openPlanningField,
  planningEvaRow,
  planningField,
  savePlanningField,
} from "./planningHelpers";

const test = base.extend({ scenario: "execution" as BehavioralScenario });

async function selectPlannedEva(page: Page, name: string, plannedEvaUuid: string): Promise<void> {
  await page.getByLabelText("evas Section", { exact: true }).click();
  const showAll = page.getByLabelText("Show All EVAs", { exact: true });
  if (isVisible(showAll)) await showAll.click();
  const row = planningEvaRow(page, name);
  const dropdown = row.getBySelector("select").first();
  if ((dropdown.element() as HTMLSelectElement).value !== plannedEvaUuid) {
    await dropdown.selectOptions(plannedEvaUuid);
  }
  const title = planningField(page, "EVA Title");
  if (!isVisible(title) || title.element().textContent !== name) {
    await row.getByText(name, { exact: true }).first().click();
  }
  await expect.element(planningField(page, "EVA Title")).toHaveTextContent(exactText(name));
}

async function selectRex(page: Page, family: string, rexEvaUuid: string): Promise<void> {
  await page.getByLabelText("evas Section", { exact: true }).click();
  const showAll = page.getByLabelText("Show All EVAs", { exact: true });
  if (isVisible(showAll)) await showAll.click();
  await planningEvaRow(page, family).getBySelector("select").first().selectOptions(rexEvaUuid);
}

test.describe("EVA metadata lifecycle", () => {
  test("UTC fields combine an initially empty date and time only after explicit saves and preserve canceled edits", async ({
    page,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.evas[mission.ids.evaA].datetime = null;
    });
    await mission.open();
    await enablePlanningEditMode(page);
    await selectPlannedEva(page, "Survey Alpha", mission.ids.evaA);
    await page.getByLabelText("info_panel", { exact: true }).click();
    await savePlanningField(page, "evaDate", "2026-10-25");
    expect((await mission.read()).evas[mission.ids.evaA].datetime).toBeNull();
    await savePlanningField(page, "evaTime", "12:34:56");
    await expect
      .poll(async () => (await mission.read()).evas[mission.ids.evaA].datetime)
      .toBe(Date.parse("2026-10-25T12:34:56Z"));
    await expect.element(planningField(page, "evaDate")).toHaveTextContent(exactText("2026-10-25"));
    await expect.element(planningField(page, "evaTime")).toHaveTextContent(exactText("12:34:56"));
    await cancelPlanningField(page, "evaDate", "2030-01-01");
    await cancelPlanningField(page, "evaTime", "00:00:00");
    expect((await mission.read()).evas[mission.ids.evaA].datetime).toBe(
      Date.parse("2026-10-25T12:34:56Z")
    );
    await mission.open();
    await selectPlannedEva(page, "Survey Alpha", mission.ids.evaA);
    await page.getByLabelText("info_panel", { exact: true }).click();
    await expect.element(planningField(page, "evaDate")).toHaveTextContent(exactText("2026-10-25"));
    await expect.element(planningField(page, "evaTime")).toHaveTextContent(exactText("12:34:56"));
  });

  test("validates plan metadata while REX names stay family-scoped across remount", async ({
    page,
    mission,
  }) => {
    // A valid starting UTC value ensures the local date/time editor has completed
    // its initial selected-EVA synchronization before either component is edited.
    await mission.change((doc) => {
      doc.evas[mission.ids.evaA].datetime = Date.parse("2024-01-02T01:02:03Z");
    });
    const before = await mission.read();
    await mission.open();
    await enablePlanningEditMode(page);
    await selectPlannedEva(page, "Survey Alpha", mission.ids.evaA);
    await page.getByLabelText("info_panel", { exact: true }).click();

    await cancelPlanningField(page, "EVA Title", "Discard this name");
    for (const [value, error] of [
      ["", "Required"],
      ["survey bravo", "Name must be unique"],
    ]) {
      const dialog = await openPlanningField(page, "EVA Title");
      await dialog.getByLabelText("EVA Title", { exact: true }).fill(value);
      await expect.element(dialog.getByText(error, { exact: true })).toBeVisible();
      await expect.element(dialog.getByText("Save", { exact: true })).toBeDisabled();
      await expect.element(dialog.getByLabelText("EVA Title", { exact: true })).toBeVisible();
      expect((await mission.read()).evas[mission.ids.evaA].name).toBe("Survey Alpha");
      await dialog.getByText("Cancel", { exact: true }).click();
    }

    const title = "Survey Alpha — north ridge";
    await savePlanningField(page, "EVA Title", title);
    await expect.element(planningEvaRow(page, title)).toBeVisible();
    const description = 'Primary transect α & <ice>\nSecond line: "north"';
    await cancelPlanningField(page, "EVA Description", "Discarded EVA description");
    await savePlanningField(page, "EVA Description", description);
    await expect
      .element(planningField(page, "EVA Description"))
      .toHaveTextContent(exactText(description));
    await cancelPlanningField(page, "EVA Description", "Discard after commit");

    const colorControl = page.getBySelector('[class*="propertyPathColor"]');
    await colorControl.click();
    const colorSwatch = page.getBySelector('[class*="colorPickerPopover"] [title="#009CE0"]');
    await expect.element(colorSwatch).toBeVisible();
    await colorSwatch.click();
    await expect
      .poll(async () => (await mission.read()).evas[mission.ids.evaA].traverseColor)
      .toBe("#009ce0");
    await page.getBySelector('[class*="colorPickerCover"]').click();

    for (const [label, value, error] of [
      ["Duration", "100000", "Must be at no more than 5 characters"],
      ["Average Traverse Rate", "1.2.3", "Not a valid number/float"],
      ["Average Traverse Rate", "10000", "Must be at no more than 4 characters"],
    ]) {
      const dialog = await openPlanningField(page, label);
      await dialog.getByLabelText(label, { exact: true }).fill(value);
      await expect.element(dialog.getByText(error, { exact: true })).toBeVisible();
      await expect.element(dialog.getByText("Save", { exact: true })).toBeDisabled();
      await expect.element(dialog.getByLabelText(label, { exact: true })).toBeVisible();
      await dialog.getByText("Cancel", { exact: true }).click();
    }
    await savePlanningField(page, "Duration", "360");
    await savePlanningField(page, "Average Traverse Rate", "3.5");
    await cancelPlanningField(page, "Average Traverse Rate", "discarded rate");

    // A plan and a REX can share a title because their uniqueness scopes are separate.
    await selectRex(page, title, mission.ids.rexEvaA);
    await savePlanningField(page, "REX Title", title);
    await expect.element(planningField(page, "EVA Title")).toHaveTextContent(exactText(title));
    await expect.element(planningField(page, "REX Title")).toHaveTextContent(exactText(title));
    await selectPlannedEva(page, title, mission.ids.evaA);
    await page.getByLabelText("info_panel", { exact: true }).click();

    const date = "2025-02-20";
    const time = "11:22:33";
    const invalidDate = await openPlanningField(page, "evaDate");
    await invalidDate.getByLabelText("evaDate", { exact: true }).fill("2025/02/20");
    await expect
      .element(invalidDate.getByText("Must be in YYYY-MM-DD format", { exact: true }))
      .toBeVisible();
    await expect.element(invalidDate.getByText("Save", { exact: true })).toBeDisabled();
    await expect.element(invalidDate.getByLabelText("evaDate", { exact: true })).toBeVisible();
    await invalidDate.getByText("Cancel", { exact: true }).click();
    await savePlanningField(page, "evaDate", date);
    await savePlanningField(page, "evaTime", time);
    await expect
      .poll(async () => (await mission.read()).evas[mission.ids.evaA].datetime)
      .toBe(Date.parse(`${date}T${time}Z`));

    await expect
      .element(planningField(page, "EVA Description"))
      .toHaveTextContent(exactText(description));
    await expect.element(planningField(page, "Duration")).toHaveTextContent(exactText("360"));
    await expect
      .element(planningField(page, "Average Traverse Rate"))
      .toHaveTextContent(exactText("3.5"));
    await expect.element(planningField(page, "evaDate")).toHaveTextContent(exactText(date));
    await expect.element(planningField(page, "evaTime")).toHaveTextContent(exactText(time));

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

    await mission.open();
    await enablePlanningEditMode(page);
    await selectPlannedEva(page, title, mission.ids.evaA);
    await page.getByLabelText("info_panel", { exact: true }).click();
    await expect
      .element(planningField(page, "EVA Description"))
      .toHaveTextContent(exactText(description));
    await expect.element(planningField(page, "Duration")).toHaveTextContent(exactText("360"));
    await expect
      .element(planningField(page, "Average Traverse Rate"))
      .toHaveTextContent(exactText("3.5"));
    await expect.element(planningField(page, "evaDate")).toHaveTextContent(exactText(date));
    await expect.element(planningField(page, "evaTime")).toHaveTextContent(exactText(time));
    await selectRex(page, title, mission.ids.rexEvaA);
    await expect.element(planningField(page, "REX Title")).toHaveTextContent(exactText(title));
    await expect.element(planningField(page, "EVA Title")).toHaveTextContent(exactText(title));
  });
});
