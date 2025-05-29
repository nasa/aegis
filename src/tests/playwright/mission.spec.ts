import { test } from "@playwright/test";
import { actionTemplatesTest } from "./mission/actionTemplateTest";
import { missionConfigTest } from "./mission/missionConfigurationTest";
import { circleDefinitionsTest } from "./mission/circleDefinitionsTest";
import { missionEquipmentTest } from "./mission/missionEquipmentTest";
import { presetTest } from "./mission/presetTest";

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
