import { test } from "@playwright/test";
import { actionTemplatesTest } from "./mission/actionTemplateTest";
import { missionConfigTest } from "./mission/missionConfigurationTest";
import { landerRadiiTest } from "./mission/landerRadiiTest";
import { missionEquipmentTest } from "./mission/missionEquipmentTest";
import { geoUnitsTest } from "./mission/geoUnitsTest";
import { presetTest } from "./mission/presetTest";

test("edit mission preferences", async ({ page }) => {
  await missionConfigTest(page);
});

test("create edit cancel delete radii", async ({ page }) => {
  await landerRadiiTest(page);
});

test("create edit duplicate cancel delete actionTemplates", async ({ page }) => {
  await actionTemplatesTest(page);
});

test("create edit cancel delete equipment", async ({ page }) => {
  await missionEquipmentTest(page);
});

test("create edit cancel delete geo unit", async ({ page }) => {
  await geoUnitsTest(page);
});

// Preset test included here, as running preset test parallel to mission tests breaks the tests
test("create edit cancel delete preset", async ({ page }) => {
  await presetTest(page);
});
