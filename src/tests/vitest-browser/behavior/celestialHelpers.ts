import { isVisible } from "./browserAssertions";
import type { BrowserPage as Page } from "vitest/browser";
import { expect } from "./missionHarness";

export async function showDirections(page: Page, lunar = true): Promise<void> {
  const source = page.getByRole("group", {
    name: `Sun/${lunar ? "Earth" : "Moon"} value source`,
    exact: true,
  });
  if (await isVisible(source)) return;
  await page.getByTestId("map-menu-launcher").click();
  const menu = page.getByTestId("map-menu-floating-panel");
  await menu.getByText(`Sun/${lunar ? "Earth" : "Moon"} Directions`, { exact: true }).click();
  await menu.getBySelector('svg[data-icon="xmark"]').click();
  await expect.element(source).toBeVisible();
}

export async function expectAngles(page: Page, sun: number, earth: number): Promise<void> {
  const normalize = (value: number) => ((value % 360) + 360) % 360;
  await expect
    .poll(() =>
      page
        .getBySelector('[data-map-mode="editor"] [class*="sunEarthIcon_"]')
        .elements()
        .map(
          (icon) =>
            ((Math.atan2(Number.parseFloat(icon.style.left), -Number.parseFloat(icon.style.top)) *
              180) /
              Math.PI +
              360) %
            360
        )
    )
    .toEqual([expect.closeTo(normalize(sun), 1), expect.closeTo(normalize(earth), 1)]);
  await expect
    .poll(() =>
      page
        .getBySelector('[data-map-mode="editor"] [class*="azimuthText_"]')
        .elements()
        .map((element) => element.textContent.trim().replace(/\s+/g, " "))
    )
    .toEqual([`${Math.round(normalize(sun)) % 360}°`, `${Math.round(normalize(earth)) % 360}°`]);
}
