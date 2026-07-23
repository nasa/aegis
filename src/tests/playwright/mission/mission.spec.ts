import { test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

import { actionDefinitionsTest } from "./actionDefinitionsTest";
import { actionTemplatesTest } from "./actionTemplateTest";
import { circleDefinitionsTest } from "./circleDefinitionsTest";
import { exportTest } from "./exportTest";
import { geographicUnitsTest } from "./geographicUnitsTest";
import { missionConfigTest } from "./missionConfigurationTest";
import { missionEquipmentTest } from "./missionEquipmentTest";
import { presetTest } from "./presetTest";

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
