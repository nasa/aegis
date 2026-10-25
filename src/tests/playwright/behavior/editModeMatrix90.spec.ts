import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
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
  await page.getByLabel("prefs_panel", { exact: true }).click();
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toHaveText(
    "Mission Preferences"
  );
}

async function openPreset(page: Page) {
  await page.getByLabel("preset Section", { exact: true }).click();
  await page
    .getByLabel("mapPreset", { exact: true })
    .filter({ hasText: "Overview" })
    .getByText("Overview", { exact: true })
    .click();
  await expect(page.locator('div[aria-label="Preset Title"]')).toHaveText("Overview");
}

async function openComparison(page: Page) {
  await page.getByLabel("reports Section", { exact: true }).click();
  await page.getByText("EVA Comparison", { exact: true }).click();
}

test.use({ scenario: "execution" });

test("global Edit gates shared fields and menus across mission, entity, preset, report and position surfaces", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.actionSystemVersion = 2;
    doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
  });
  const before = await mission.read();
  await mission.open(page);
  const editToggle = page.getByLabel("globalEditToggle", { exact: true });
  await expect(editToggle).toHaveAttribute("data-tooltip-content", "Turn On Edit Mode");

  await openMissionPreferences(page);
  await planningField(page, "Mission Description").locator("..").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);

  await selectPlanningStation(page, "Alpha station");
  await page.getByLabel("info_panel", { exact: true }).click();
  await planningField(page, "Station").locator("..").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.getByLabel("addStation", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("deleteStation", { exact: true })).toHaveCount(0);

  await openPreset(page);
  await page.getByLabel("info_panel", { exact: true }).click();
  await planningField(page, "Preset Title").locator("..").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.getByText("Add", { exact: true })).toHaveCount(0);

  await openComparison(page);
  await page.getByText("Campaigns…", { exact: true }).click();
  const campaigns = page.locator("dialog[open]");
  const newCampaign = campaigns.getByText("New campaign", { exact: true });
  await expect(newCampaign.locator("..")).toHaveClass(/buttonDisabled/);
  await newCampaign.click();
  expect((await mission.read()).reportCampaigns ?? {}).toEqual({});
  await campaigns.getByLabel("Close campaigns", { exact: true }).click();

  await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
  await page.getByLabel("rex_positions_panel", { exact: true }).click();
  const originalPositionSources = (await mission.read()).rexes[mission.ids.rexB].posSources;
  await expect(page.getByLabel("Add Position Source", { exact: true })).toHaveCount(0);
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
  await descriptionDraft.getByLabel("Mission Description", { exact: true }).fill("Canceled edit");
  await descriptionDraft.getByText("Cancel", { exact: true }).click();
  expect((await mission.read()).description).toBe(before.description);
  const savedDescription = "Edit mode matrix description";
  const description = await openPlanningField(page, "Mission Description");
  await description.getByLabel("Mission Description", { exact: true }).fill(savedDescription);
  await description.getByText("Save", { exact: true }).click();
  await expect.poll(async () => (await mission.read()).description).toBe(savedDescription);

  await selectPlanningStation(page, "Alpha station");
  await page.getByLabel("info_panel", { exact: true }).click();
  await expect(page.getByLabel("addStation", { exact: true })).toBeVisible();
  const stationDraft = await openPlanningField(page, "Station");
  await stationDraft.getByLabel("Station", { exact: true }).fill("Canceled station edit");
  await stationDraft.getByText("Cancel", { exact: true }).click();
  expect((await mission.read()).stations[mission.ids.stationA].name).toBe("Alpha station");

  await openPreset(page);
  await page.getByLabel("azimuth_panel", { exact: true }).click();
  const presetDraft = await openPlanningField(page, "SunDegrees");
  await presetDraft.getByLabel("SunDegrees", { exact: true }).fill("75");
  await presetDraft.getByText("Cancel", { exact: true }).click();
  expect((await mission.read()).presets[mission.ids.presetA].sunAzimuth).toBe(
    before.presets[mission.ids.presetA].sunAzimuth
  );
  const presetEdit = await openPlanningField(page, "SunDegrees");
  await presetEdit.getByLabel("SunDegrees", { exact: true }).fill("42");
  await presetEdit.getByText("Save", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).presets[mission.ids.presetA].sunAzimuth)
    .toBe(42);

  await openComparison(page);
  await page.getByText("Campaigns…", { exact: true }).click();
  const editCampaigns = page.locator("dialog[open]");
  await expect(
    editCampaigns.getByText("New campaign", { exact: true }).locator("..")
  ).not.toHaveClass(/buttonDisabled/);
  await editCampaigns.getByText("New campaign", { exact: true }).click();
  await expect.poll(async () => Object.keys((await mission.read()).reportCampaigns).length).toBe(1);
  const campaign = editCampaigns.getByLabel("Campaign name", { exact: true });
  await campaign.fill("Editable campaign");
  await expect
    .poll(async () => Object.values((await mission.read()).reportCampaigns)[0]?.name)
    .toBe("Editable campaign");
  const membership = editCampaigns.getByRole("checkbox", { name: "Survey Alpha", exact: true });
  await membership.check();
  await expect
    .poll(async () => Object.values((await mission.read()).reportCampaigns)[0]?.memberEvaUuids)
    .toEqual([mission.ids.evaA]);
  await editCampaigns.getByLabel("Close campaigns", { exact: true }).click();

  await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
  await page.getByLabel("rex_positions_panel", { exact: true }).click();
  const addPositionSource = page.getByLabel("Add Position Source", { exact: true });
  await expect(addPositionSource).toBeVisible();
  await addPositionSource.click();
  await expect
    .poll(async () => (await mission.read()).rexes[mission.ids.rexB].posSources.length)
    .toBe(originalPositionSources.length + 1);
  expect((await mission.read()).stations[mission.ids.stationB]).toEqual(
    before.stations[mission.ids.stationB]
  );
});
