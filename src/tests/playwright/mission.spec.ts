import { test } from "@playwright/test";
import { actionTemplatesTest } from "./mission/actionTemplateTest.spec";
import { missionConfigTest } from "./mission/missionConfigurationTest.spec";
import { circleDefinitionsTest } from "./mission/circleDefinitionsTest.spec";
import { missionEquipmentTest } from "./mission/missionEquipmentTest.spec";
import { presetTest } from "./mission/presetTest.spec";

test("edit mission preferences", async ({ page }) => {
  await missionConfigTest(page);
});

test("create edit cancel delete circle definitions", async ({ page }) => {
  await circleDefinitionsTest(page);
});

test("create edit duplicate cancel delete actionTemplates", async ({ page }) => {
  await actionTemplatesTest(page);
});

test("create edit cancel delete equipment", async ({ page }) => {
  await missionEquipmentTest(page);
});

// Preset test included here, as running preset test parallel to mission tests breaks the tests
test("create edit cancel delete preset", async ({ page }) => {
  await presetTest(page);
});
