import { test, expect } from "./missionHarness";
test("timeline slope legend preserves labels and distinct colorblind palettes", async ({
  page,
  mission,
}) => {
  await mission.open();
  await page.getByLabelText("evas Section", { exact: true }).click();
  await page
    .getByLabelText("evaList-item")
    .filter({ hasText: "Survey Alpha" })
    .getByText("Survey Alpha", { exact: true })
    .click();
  await page.getBySelector('[data-tooltip-content="Timeline"]').click();
  await page.getByRole("button", { name: "Key", exact: true }).click();
  const legend = page.getBySelector("dialog[open]");
  await expect.element(legend).toHaveAttribute("aria-labelledby");
  await expect
    .element(legend.getByText("Slope color = absolute degrees", { exact: true }))
    .toBeVisible();
  await expect.element(legend.getByText("Path Grade (top)", { exact: true })).toBeVisible();
  await expect.element(legend.getByText("Terrain Slope (bottom)", { exact: true })).toBeVisible();
  const standardColors = await legend
    .getByLabelText("Path Grade example", { exact: true })
    .getBySelector("span")
    .elements()
    .slice(0, 6)
    .map((swatch) => getComputedStyle(swatch).backgroundColor);
  await legend.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Colorblind", exact: true }).click();
  await expect
    .element(page.getByRole("button", { name: "Colorblind", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Key", exact: true }).click();
  const colorblindColors = await legend
    .getByLabelText("Path Grade example", { exact: true })
    .getBySelector("span")
    .elements()
    .slice(0, 6)
    .map((swatch) => getComputedStyle(swatch).backgroundColor);
  expect(colorblindColors).not.toEqual(standardColors);
  await expect.element(legend.getByText("Path Grade (top)", { exact: true })).toBeVisible();
  await expect.element(legend.getByText("Terrain Slope (bottom)", { exact: true })).toBeVisible();
  await legend.getByRole("button", { name: "Close", exact: true }).click();
});
