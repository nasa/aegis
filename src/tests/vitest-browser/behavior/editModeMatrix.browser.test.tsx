import { exactText } from "./browserAssertions";
import type { BrowserPage as Page } from "vitest/browser";
import { test as base, expect } from "./missionHarness";
import {
  enablePlanningEditMode,
  openPlanningField,
  openPlanningSection,
  planningField,
  selectPlanningStation,
} from "./planningHelpers";
import { selectExecution } from "./executionHelpers";

async function openMissionPreferences(page: Page) {
  await openPlanningSection(page, "mission");
  await page.getByLabelText("prefs_panel", { exact: true }).click();
  await expect
    .element(page.getByLabelText("rightBodyTitle", { exact: true }))
    .toMatchTextContent(exactText("Mission Preferences"));
}

async function openPreset(page: Page) {
  await page.getByLabelText("preset Section", { exact: true }).click();
  await page
    .getByLabelText("mapPreset", { exact: true })
    .filter({ hasText: "Overview" })
    .getByText("Overview", { exact: true })
    .click();
  await expect
    .element(page.getBySelector('div[aria-label="Preset Title"]'))
    .toMatchTextContent(exactText("Overview"));
}

async function openComparison(page: Page) {
  await page.getByLabelText("reports Section", { exact: true }).click();
  await page.getByText("EVA Comparison", { exact: true }).click();
}

const test = base.extend({ scenario: "execution" as BehavioralScenario });

test("global Edit gates shared fields and menus across mission, entity, preset, report and position surfaces", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.actionSystemVersion = 2;
    doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
  });
  const before = await mission.read();
  await mission.open();
  const editToggle = page.getByLabelText("globalEditToggle", { exact: true });
  await expect.element(editToggle).toHaveAttribute("data-tooltip-content", "Turn On Edit Mode");

  await openMissionPreferences(page);
  await planningField(page, "Mission Description").getBySelector("..").click();
  await expect.poll(() => page.getBySelector("dialog[open]").length).toBe(0);

  await selectPlanningStation(page, "Alpha station");
  await page.getByLabelText("info_panel", { exact: true }).click();
  await planningField(page, "Station").getBySelector("..").click();
  await expect.poll(() => page.getBySelector("dialog[open]").length).toBe(0);
  await expect.poll(() => page.getByLabelText("addStation", { exact: true }).length).toBe(0);
  await expect.poll(() => page.getByLabelText("deleteStation", { exact: true }).length).toBe(0);

  await openPreset(page);
  await page.getByLabelText("info_panel", { exact: true }).click();
  await planningField(page, "Preset Title").getBySelector("..").click();
  await expect.poll(() => page.getBySelector("dialog[open]").length).toBe(0);
  await expect.poll(() => page.getByText("Add", { exact: true }).length).toBe(0);

  await openComparison(page);
  await page.getByText("Campaigns…", { exact: true }).click();
  const campaigns = page.getBySelector("dialog[open]");
  const newCampaign = campaigns.getByText("New campaign", { exact: true });
  await expect.element(newCampaign.getBySelector("..")).toHaveClass(/buttonDisabled/);
  await newCampaign.click();
  expect((await mission.read()).reportCampaigns ?? {}).toEqual({});
  await campaigns.getByLabelText("Close campaigns", { exact: true }).click();

  await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
  await page.getByLabelText("rex_positions_panel", { exact: true }).click();
  const originalPositionSources = (await mission.read()).rexes[mission.ids.rexB].posSources;
  await expect
    .poll(() => page.getByLabelText("Add Position Source", { exact: true }).length)
    .toBe(0);
  expect((await mission.read()).rexes[mission.ids.rexB].posSources).toEqual(
    originalPositionSources
  );
  expect((await mission.read()).name).toBe(before.name);
  expect((await mission.read()).description).toBe(before.description);
  expect((await mission.read()).stations).toEqual(before.stations);
  expect((await mission.read()).presets).toEqual(before.presets);

  await enablePlanningEditMode(page);
  await openMissionPreferences(page);
  const descriptionDraft = await openPlanningField(page, "Mission Description");
  await descriptionDraft
    .getByLabelText("Mission Description", { exact: true })
    .fill("Canceled edit");
  await descriptionDraft.getByText("Cancel", { exact: true }).click();
  expect((await mission.read()).description).toBe(before.description);
  const savedDescription = "Edit mode matrix description";
  const description = await openPlanningField(page, "Mission Description");
  await description.getByLabelText("Mission Description", { exact: true }).fill(savedDescription);
  await description.getByText("Save", { exact: true }).click();
  await expect.poll(async () => (await mission.read()).description).toBe(savedDescription);

  await selectPlanningStation(page, "Alpha station");
  await page.getByLabelText("info_panel", { exact: true }).click();
  await expect.element(page.getByLabelText("addStation", { exact: true })).toBeVisible();
  const stationDraft = await openPlanningField(page, "Station");
  await stationDraft.getByLabelText("Station", { exact: true }).fill("Canceled station edit");
  await stationDraft.getByText("Cancel", { exact: true }).click();
  expect((await mission.read()).stations[mission.ids.stationA].name).toBe("Alpha station");

  await openPreset(page);
  await page.getByLabelText("info_panel", { exact: true }).click();
  const presetDraft = await openPlanningField(page, "Preset Description");
  await presetDraft.getByLabelText("Preset Description", { exact: true }).fill("Draft description");
  await presetDraft.getByText("Cancel", { exact: true }).click();
  expect((await mission.read()).presets[mission.ids.presetA].description).toBe(
    before.presets[mission.ids.presetA].description
  );
  const presetEdit = await openPlanningField(page, "Preset Description");
  await presetEdit.getByLabelText("Preset Description", { exact: true }).fill("Saved description");
  await presetEdit.getByText("Save", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).presets[mission.ids.presetA].description)
    .toBe("Saved description");

  await openComparison(page);
  await page.getByText("Campaigns…", { exact: true }).click();
  const editCampaigns = page.getBySelector("dialog[open]");
  await expect
    .element(editCampaigns.getByText("New campaign", { exact: true }).getBySelector(".."))
    .not.toHaveClass(/buttonDisabled/);
  await editCampaigns.getByText("New campaign", { exact: true }).click();
  await expect.poll(async () => Object.keys((await mission.read()).reportCampaigns).length).toBe(1);
  const campaign = editCampaigns.getByLabelText("Campaign name", { exact: true });
  await campaign.fill("Editable campaign");
  await expect
    .poll(async () => Object.values((await mission.read()).reportCampaigns)[0]?.name)
    .toBe("Editable campaign");
  const membership = editCampaigns.getByRole("checkbox", { name: "Survey Alpha", exact: true });
  await membership.click();
  await expect
    .poll(async () => Object.values((await mission.read()).reportCampaigns)[0]?.memberEvaUuids)
    .toEqual([mission.ids.evaA]);
  await editCampaigns.getByLabelText("Close campaigns", { exact: true }).click();

  await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
  await page.getByLabelText("rex_positions_panel", { exact: true }).click();
  const addPositionSource = page.getByLabelText("Add Position Source", { exact: true });
  await expect.element(addPositionSource).toBeVisible();
  await addPositionSource.click();
  await expect
    .poll(async () => (await mission.read()).rexes[mission.ids.rexB].posSources.length)
    .toBe(originalPositionSources.length + 1);
  expect((await mission.read()).stations[mission.ids.stationB]).toEqual(
    before.stations[mission.ids.stationB]
  );
});
