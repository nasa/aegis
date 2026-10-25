import type { Locator, Page } from "@playwright/test";
import { expect } from "../fixtures/behavioralTest";

export async function selectExecution(page: Page, plan: string, evaUuid: string): Promise<Locator> {
  await page.getByLabel("evas Section", { exact: true }).click();
  const showAll = page.getByLabel("Show All EVAs", { exact: true });
  await expect(showAll.or(page.getByLabel("evaList-item", { exact: true })).first()).toBeVisible();
  if (await showAll.isVisible()) await showAll.click();
  const row = page.getByLabel("evaList-item", { exact: true }).filter({ hasText: plan });
  await row.locator("select").first().selectOption(evaUuid);
  await expect(row.locator("select").first()).toHaveValue(evaUuid);
  return row;
}

export async function openExecutionInfo(page: Page, plan: string, evaUuid: string): Promise<void> {
  await selectExecution(page, plan, evaUuid);
  await page.getByLabel("rex_info_panel", { exact: true }).click();
  await expect(page.getByText("REX Information", { exact: true })).toBeVisible();
}
