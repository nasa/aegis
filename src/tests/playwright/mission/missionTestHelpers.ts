import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { waitForPageReady } from "../helpers";

// Re-export shared helpers so existing mission test imports keep working.
export {
  toggleEditMode,
  displayField,
  editValidatedField,
  editValidatedTextArea,
  cancelValidatedFieldEdit,
  editValidatedLatLng,
} from "../helpers";

// Backwards-compatible alias.
export { toggleEditMode as ensureEditModeOn } from "../helpers";

/**
 * Navigate to the mission section and verify that we are on Mission Configuration.
 */
export async function goToV2MissionSection(page: Page): Promise<void> {
  await page.goto("http://localhost:4000/mission/22");
  await waitForPageReady(page);
  await page.getByLabel("mission Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText(
    "Mission Configuration"
  );
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toContainText(
    "Mission Preferences"
  );
}

/**
 * Navigate to the v1 mission section and verify that we are on Mission Configuration.
 */
export async function goToV1MissionSection(page: Page): Promise<void> {
  await page.goto("http://localhost:4000/mission/47");
  await waitForPageReady(page);
  await page.getByLabel("mission Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText(
    "Mission Configuration"
  );
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toContainText(
    "Mission Preferences"
  );
}
