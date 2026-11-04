import { test } from "../fixtures/behavioralTest";

test.describe.configure({ mode: "serial" });

import { actionDefinitionsTest } from "./actionDefinitionsTest";
import { actionTemplatesTest } from "./actionTemplateTest";
import { circleDefinitionsTest } from "./circleDefinitionsTest";
import { exportTest } from "./exportTest";
import { geographicUnitsTest } from "./geographicUnitsTest";
import { missionConfigTest } from "./missionConfigurationTest";
import { missionEquipmentTest } from "./missionEquipmentTest";
import { presetTest } from "./presetTest";

test.beforeEach(async ({ mission }, testInfo) => {
  await mission.change((doc) => {
    doc.actionSystemVersion = testInfo.title === "Geographic units" ? 1 : 2;
    doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
  });
});

test("Mission preferences", async ({ page, mission }) => {
  await missionConfigTest(page, mission);
});

test("Circle definitions", async ({ page, mission }) => {
  await circleDefinitionsTest(page, mission);
});

test("Action templates", async ({ page, mission }) => {
  await actionTemplatesTest(page, mission);
});

test("Equipment", async ({ page, mission }) => {
  await missionEquipmentTest(page, mission);
});

test("Geographic units", async ({ page, mission }) => {
  await geographicUnitsTest(page, mission);
});

test("Action definitions", async ({ page, mission }) => {
  await actionDefinitionsTest(page, mission);
});

test("Export data", async ({ page, mission }) => {
  await exportTest(page, mission);
});

// Preset test included here, as running preset test parallel to mission tests breaks the tests
test("Preset", async ({ page, mission }) => {
  await presetTest(page, mission);
});
