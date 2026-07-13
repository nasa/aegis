import { test } from "@playwright/test";
import { actionTemplatesTest } from "./mission/actionTemplateTest";
import { missionConfigTest } from "./mission/missionConfigurationTest";
import { circleDefinitionsTest } from "./mission/circleDefinitionsTest";
import { missionEquipmentTest } from "./mission/missionEquipmentTest";
import { presetTest } from "./mission/presetTest";
import { geographicUnitsTest } from "./mission/geographicUnitsTest";
import { actionDefinitionsTest } from "./mission/actionDefinitionsTest";
import { exportTest } from "./mission/exportTest";

test("Mission preferences", async ({ page }) => {
  await missionConfigTest(page);
});

test("Circle definitions", async ({ page }) => {
  await circleDefinitionsTest(page);
});

test("Action templates", async ({ page }) => {
  await actionTemplatesTest(page);
});

test("Equipment", async ({ page }) => {
  await missionEquipmentTest(page);
});

test("Geographic units", async ({ page }) => {
  await geographicUnitsTest(page);
});

test("Action definitions", async ({ page }) => {
  await actionDefinitionsTest(page);
});

test("Export data", async ({ page }) => {
  await exportTest(page);
});

// Preset test included here, as running preset test parallel to mission tests breaks the tests
test("Preset", async ({ page }) => {
  await presetTest(page);
});
