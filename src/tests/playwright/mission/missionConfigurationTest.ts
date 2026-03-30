import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import {
  goToV2MissionSection,
  toggleEditMode,
  editValidatedField,
  cancelValidatedFieldEdit,
  displayField,
} from "./missionTestHelpers";

export async function missionConfigTest(page: Page): Promise<string> {
  const testValues = {
    missionName: `_TEST MISSION ${Math.floor(Math.random() * 1000)}`,
    topBanner: `Top Banner Test  ${Math.floor(Math.random() * 1000)}`,
    description: `Description Test  ${Math.floor(Math.random() * 1000)}`,
    duration: (Math.floor(Math.random() * (120 - 60 + 1)) + 60).toString(), // random between 60-120 as string
    traverseRate: parseFloat((Math.random() * (5 - 1) + 1).toFixed(2)).toString(), // random double between 1-5 as string
    walkbackRate: parseFloat((Math.random() * (5 - 1) + 1).toFixed(2)).toString(), // random double between 1-5 as string
  };

  // Navigate to mission section
  await goToV2MissionSection(page);

  // Turn on edit mode
  await toggleEditMode(page);

  // Modify and check mission name
  await editValidatedField(page, "Mission Name", testValues.missionName);
  await expect(displayField(page, "Mission Name")).toContainText(testValues.missionName);
  await expect(page.getByLabel("missionNameHeader", { exact: true })).toContainText(
    testValues.missionName
  );

  // Modify and check mission top banner
  await editValidatedField(page, "Mission Banner", testValues.topBanner);
  await expect(displayField(page, "Mission Banner")).toContainText(testValues.topBanner);
  await expect(page.getByLabel("missionBannerText", { exact: true })).toContainText(
    testValues.topBanner
  );

  // Modify and check mission defaults
  await editValidatedField(page, "Default EVA Duration", testValues.duration);
  await expect(displayField(page, "Default EVA Duration")).toContainText(testValues.duration);

  await editValidatedField(page, "Average traverse rate", testValues.traverseRate);
  await expect(displayField(page, "Average traverse rate")).toContainText(testValues.traverseRate);

  await editValidatedField(page, "Default walkback rate", testValues.walkbackRate);
  await expect(displayField(page, "Default walkback rate")).toContainText(testValues.walkbackRate);

  // Test cancel on a field (verify value unchanged after cancel)
  await cancelValidatedFieldEdit(page, "Mission Name", "CANCEL_TEST_VALUE");

  // Turn off edit mode
  await toggleEditMode(page);

  return "success";
}
