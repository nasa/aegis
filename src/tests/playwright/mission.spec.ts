import { test } from "@playwright/test";
import { actionTemplatesTest } from "./mission/actionTemplateTest";
import { missionConfigTest } from "./mission/missionConfigurationTest";
import { circleDefinitionsTest } from "./mission/circleDefinitionsTest";
import { missionEquipmentTest } from "./mission/missionEquipmentTest";
import { presetTest } from "./mission/presetTest";
import { geographicUnitsTest } from "./mission/geographicUnitsTest";
import { actionDefinitionsTest } from "./mission/actionDefinitionsTest";
import { exportTest } from "./mission/exportTest";

test("CRUD mission preferences", async ({ page }) => {
  await missionConfigTest(page);
});

test("CRUD circle definitions", async ({ page }) => {
  await circleDefinitionsTest(page);
});

test("CRUD actionTemplates", async ({ page }) => {
  await actionTemplatesTest(page);
});

test("CRUD equipment", async ({ page }) => {
  await missionEquipmentTest(page);
});

test("CRUD geographic units", async ({ page }) => {
  await geographicUnitsTest(page);
});

test("CRUD action definitions", async ({ page }) => {
  await actionDefinitionsTest(page);
});

test("Export data", async ({ page }) => {
  await exportTest(page);
});

// Preset test included here, as running preset test parallel to mission tests breaks the tests
test("CRUD preset", async ({ page }) => {
  await presetTest(page);
});
