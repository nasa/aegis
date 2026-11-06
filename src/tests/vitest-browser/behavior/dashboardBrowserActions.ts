import type { Locator } from "vitest/browser";
import { userEvent } from "vitest/browser";

export async function setChecked(locator: Locator, checked: boolean): Promise<void> {
  if ((locator.element() as HTMLInputElement).checked !== checked) await locator.click();
}

export async function pressKey(key: string): Promise<void> {
  const sequence =
    key === "Shift+Tab" ? "{Shift>}{Tab}{/Shift}" : `{${key === "Space" ? " " : key}}`;
  await userEvent.keyboard(sequence);
}
