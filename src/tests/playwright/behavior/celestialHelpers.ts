import type { Page } from "@playwright/test";
import { expect } from "../fixtures/behavioralTest";

export async function showDirections(page: Page, lunar = true): Promise<void> {
  const source = page.getByRole("group", {
    name: `Sun/${lunar ? "Earth" : "Moon"} value source`,
    exact: true,
  });
  if (await source.isVisible()) return;
  await page.getByTestId("map-menu-launcher").click();
  const menu = page.getByTestId("map-menu-floating-panel");
  await menu.getByText(`Sun/${lunar ? "Earth" : "Moon"} Directions`, { exact: true }).click();
  await menu.locator('svg[data-icon="xmark"]').click();
  await expect(source).toBeVisible();
}

export async function expectAngles(page: Page, sun: number, earth: number): Promise<void> {
  const normalize = (value: number) => ((value % 360) + 360) % 360;
  await expect
    .poll(() =>
      page
        .locator('[data-map-mode="editor"] [class*="sunEarthIcon_"]')
        .evaluateAll((icons: HTMLElement[]) =>
          icons.map(
            (icon) =>
              ((Math.atan2(Number.parseFloat(icon.style.left), -Number.parseFloat(icon.style.top)) *
                180) /
                Math.PI +
                360) %
              360
          )
        )
    )
    .toEqual([expect.closeTo(normalize(sun), 1), expect.closeTo(normalize(earth), 1)]);
  await expect(page.locator('[data-map-mode="editor"] [class*="azimuthText_"]')).toHaveText([
    `${Math.round(normalize(sun)) % 360}°`,
    `${Math.round(normalize(earth)) % 360}°`,
  ]);
}
