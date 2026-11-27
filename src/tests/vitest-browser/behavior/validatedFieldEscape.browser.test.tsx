import { exactText } from "./browserAssertions";
import { userEvent, type BrowserPage as Page } from "vitest/browser";
import { test, expect } from "./missionHarness";
import {
  enablePlanningEditMode,
  openPlanningField,
  openPlanningSection,
  planningField,
} from "./planningHelpers";

async function openMissionPreferences(page: Page) {
  await openPlanningSection(page, "mission");
  await page.getByLabelText("prefs_panel", { exact: true }).click();
  await expect
    .element(page.getByLabelText("rightBodyTitle", { exact: true }))
    .toMatchTextContent(exactText("Mission Preferences"));
}

test("Escape discards validated field drafts like Cancel", async ({ page, mission }) => {
  await mission.change((doc) => {
    doc.name = "Original name";
    doc.description = "Original description";
    doc.landerLocation = { lat: 0, lng: 0 };
  });
  const before = await mission.read();
  await mission.open();
  await enablePlanningEditMode(page);
  await openMissionPreferences(page);

  for (const label of ["Mission Name", "Mission Description"]) {
    const draft = await openPlanningField(page, label);
    await draft.getByLabelText(label, { exact: true }).fill("Escaped draft");
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => draft.length).toBe(0);

    const reopened = await openPlanningField(page, label);
    await expect
      .element(reopened.getByLabelText(label, { exact: true }))
      .toHaveValue(label === "Mission Name" ? before.name : before.description);
    await reopened.getByText("Cancel", { exact: true }).click();
    await expect.poll(() => reopened.length).toBe(0);
  }

  const location = await openPlanningField(page, "LatitudePref");
  await location.getByLabelText("LatitudePref", { exact: true }).fill("0.0005");
  await location.getByLabelText("LongitudePref", { exact: true }).fill("-0.0005");
  await userEvent.keyboard("{Escape}");
  await expect.poll(() => location.length).toBe(0);
  const reopenedLocation = await openPlanningField(page, "LatitudePref");
  await expect
    .element(reopenedLocation.getByLabelText("LatitudePref", { exact: true }))
    .toHaveValue("0");
  await expect
    .element(reopenedLocation.getByLabelText("LongitudePref", { exact: true }))
    .toHaveValue("0");
  await reopenedLocation.getByText("Cancel", { exact: true }).click();

  await expect
    .element(planningField(page, "Mission Name"))
    .toMatchTextContent(exactText(before.name));
  const after = await mission.read();
  expect(after.name).toBe(before.name);
  expect(after.description).toBe(before.description);
  expect(after.landerLocation).toEqual(before.landerLocation);
});
