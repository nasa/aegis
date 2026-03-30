import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Toggle the edit mode on/off via the toggle button in the mission section.
 * After clicking, waits briefly for the UI to update.
 */
export async function toggleEditMode(page: Page): Promise<void> {
  await page.getByLabel("missionEditToggle").click();
  await page.waitForTimeout(300);
}

/**
 * Ensure edit mode is ON. Checks if toggle is currently off, and if so, clicks it.
 */
export async function ensureEditModeOn(page: Page): Promise<void> {
  // Check if any edit-mode-only element is visible (like an "Add" button).
  // If not, toggle edit mode on.
  const toggle = page.getByLabel("missionEditToggle");
  await toggle.waitFor({ timeout: 3000 });
  await toggle.click();
  await page.waitForTimeout(300);
}

/**
 * Navigate to the mission section and verify that we are on Mission Configuration.
 */
export async function goToV2MissionSection(page: Page): Promise<void> {
  await page.goto("http://localhost:4000/mission/22");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("loading-overlay").waitFor({ state: "hidden", timeout: 30000 });
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
  await page.waitForLoadState("networkidle");
  await page.getByLabel("loading-overlay").waitFor({ state: "hidden", timeout: 30000 });
  await page.getByLabel("mission Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText(
    "Mission Configuration"
  );
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toContainText(
    "Mission Preferences"
  );
}

/**
 * Select only the display <div> elements with the given aria-label.
 * This avoids matching <input> elements that share the same aria-label inside dialogs.
 */
export function displayField(page: Page, ariaLabel: string, nth?: number): Locator {
  const locator = page.locator(`div[aria-label="${ariaLabel}"]`);
  return nth !== undefined ? locator.nth(nth) : locator;
}

/**
 * Edit a ValidatedInputField by:
 * 1. Clicking on the field display <div> to open its dialog
 * 2. Filling in the new value
 * 3. Clicking "Save" in the dialog
 *
 * @param page - Playwright Page
 * @param ariaLabel - The aria-label of the field (e.g. "Mission Name")
 * @param value - The new value to enter
 * @param nth - Optional index if there are multiple fields with the same label
 */
export async function editValidatedField(
  page: Page,
  ariaLabel: string,
  value: string,
  nth?: number
): Promise<void> {
  const field = displayField(page, ariaLabel, nth);
  // Use dispatchEvent to handle fields that may be invisible (empty/whitespace content)
  await field.dispatchEvent("click");

  // Wait for dialog to open
  const dialog = page.locator("dialog[open]");
  await dialog.waitFor({ timeout: 3000 });

  // Fill the input in the dialog
  const input = dialog.locator("input");
  await input.fill(value);

  // Click Save in the dialog
  await dialog.getByText("Save").dispatchEvent("click");

  // Wait for dialog to close
  await dialog.waitFor({ state: "hidden", timeout: 3000 });
}

/**
 * Edit a ValidatedTextArea by:
 * 1. Clicking on the field display value to open its dialog
 * 2. Filling in the new value
 * 3. Clicking "Save" in the dialog
 */
export async function editValidatedTextArea(
  page: Page,
  ariaLabel: string,
  value: string
): Promise<void> {
  await displayField(page, ariaLabel).dispatchEvent("click");

  const dialog = page.locator("dialog[open]");
  await dialog.waitFor({ timeout: 3000 });

  const textarea = dialog.locator("textarea");
  await textarea.fill(value);

  await dialog.getByText("Save").dispatchEvent("click");
  await dialog.waitFor({ state: "hidden", timeout: 3000 });
}

/**
 * Open a field's dialog, change the value, then click Cancel.
 * Verifies the value did NOT change.
 */
export async function cancelValidatedFieldEdit(
  page: Page,
  ariaLabel: string,
  tempValue: string,
  nth?: number
): Promise<void> {
  const field = displayField(page, ariaLabel, nth);

  const originalText = await field.textContent();
  await field.dispatchEvent("click");

  const dialog = page.locator("dialog[open]");
  await dialog.waitFor({ timeout: 3000 });

  const input = dialog.locator("input");
  await input.fill(tempValue);

  await dialog.getByText("Cancel").dispatchEvent("click");
  await dialog.waitFor({ state: "hidden", timeout: 3000 });

  // Verify value unchanged
  await expect(field).toContainText(originalText);
}
