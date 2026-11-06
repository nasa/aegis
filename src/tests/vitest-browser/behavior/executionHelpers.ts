import { isVisible } from "./browserAssertions";
import type { Locator, BrowserPage as Page } from "vitest/browser";
import { expect } from "./missionHarness";

export async function selectExecution(page: Page, plan: string, evaUuid: string): Promise<Locator> {
  await page.getByLabelText("evas Section", { exact: true }).click();
  const showAll = page.getByLabelText("Show All EVAs", { exact: true });
  await expect
    .element(showAll.or(page.getByLabelText("evaList-item", { exact: true })).first())
    .toBeVisible();
  if (await isVisible(showAll)) await showAll.click();
  const row = page.getByLabelText("evaList-item", { exact: true }).filter({ hasText: plan });
  await row.getBySelector("select").first().selectOptions(evaUuid);
  await expect.element(row.getBySelector("select").first()).toHaveValue(evaUuid);
  return row;
}

export async function openExecutionInfo(page: Page, plan: string, evaUuid: string): Promise<void> {
  await selectExecution(page, plan, evaUuid);
  await page.getByLabelText("rex_info_panel", { exact: true }).click();
  await expect.element(page.getByText("REX Information", { exact: true })).toBeVisible();
}
