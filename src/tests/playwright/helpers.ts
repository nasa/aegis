import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Toggle the global Edit mode on/off via the toggle button in the header.
 * After clicking, waits briefly for the UI to update.
 */
export async function toggleEditMode(page: Page): Promise<void> {
  await page.getByLabel("globalEditToggle").click();
  await page.waitForTimeout(300);
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
 * @param ariaLabel - The aria-label of the field (e.g. "POI")
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

  // Wait for dialog to open. The <dialog> element itself is styled transparent
  // (border: none, background: transparent) so Playwright's default visibility
  // check fails; wait for it to be attached with the `open` attribute.
  const dialog = page.locator("dialog[open]");
  await dialog.waitFor({ state: "attached", timeout: 3000 });

  // Fill the input in the dialog
  const input = dialog.locator("input");
  await input.fill(value);

  // Click Save in the dialog
  await dialog.getByText("Save").dispatchEvent("click");

  // Wait for dialog to close (detached or open attribute removed)
  await dialog.waitFor({ state: "detached", timeout: 3000 });
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
  value: string,
  nth?: number
): Promise<void> {
  await displayField(page, ariaLabel, nth).dispatchEvent("click");

  const dialog = page.locator("dialog[open]");
  await dialog.waitFor({ state: "attached", timeout: 3000 });

  const textarea = dialog.locator("textarea");
  await textarea.fill(value);

  await dialog.getByText("Save").dispatchEvent("click");
  await dialog.waitFor({ state: "detached", timeout: 3000 });
}

/**
 * Open a field's dialog, change the value, then click Cancel.
 * Verifies the value did NOT change (matches the original text).
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
  await dialog.waitFor({ state: "attached", timeout: 3000 });

  const input = dialog.locator("input");
  await input.fill(tempValue);

  await dialog.getByText("Cancel").dispatchEvent("click");
  await dialog.waitFor({ state: "detached", timeout: 3000 });

  // Verify value unchanged
  await expect(field).toContainText(originalText ?? "");
}

/**
 * Edit a ValidatedLatLngField (two inputs in one dialog):
 * 1. Click the lat/lng display container to open dialog
 * 2. Fill the Lat input (matched by aria-label on input)
 * 3. Fill the Lng input (matched by aria-label on input)
 * 4. Click Save
 */
export async function editValidatedLatLng(
  page: Page,
  latInputAriaLabel: string,
  lngInputAriaLabel: string,
  lat: string,
  lng: string
): Promise<void> {
  // The display container has no aria-label; click via the parent of one of the inner display fields.
  // Find the dialog parent by clicking on the lat-row label OR by opening via the dialog container class.
  // The lat input is unique in the DOM; locate its dialog via the input's parent dialog container.
  // Strategy: click on the field's display row "Lat:" label to open the dialog.
  // The display structure renders "Lat:" and "Lng:" rows; click on the Lat: text's parent container.
  // To keep this robust, we click the container that wraps both Lat:/Lng: display values.
  // We locate it as: the closest .dialogContainerEditable ancestor of the Lat: label that is NOT a dialog content.
  const latDisplay = page.locator("text=Lat:").first();
  await latDisplay.scrollIntoViewIfNeeded();
  await latDisplay.click();

  const dialog = page.locator("dialog[open]");
  await dialog.waitFor({ state: "attached", timeout: 3000 });

  await dialog.locator(`input[aria-label="${latInputAriaLabel}"]`).fill(lat);
  await dialog.locator(`input[aria-label="${lngInputAriaLabel}"]`).fill(lng);

  await dialog.getByText("Save").dispatchEvent("click");
  await dialog.waitFor({ state: "detached", timeout: 3000 });
}
