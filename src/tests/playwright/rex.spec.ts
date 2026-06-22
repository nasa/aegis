import { test, expect } from "@playwright/test";
import { toggleEditMode, displayField, editValidatedField } from "./helpers";

test("REX lifecycle", async ({ page }) => {
  // Use a unique suffix so re-runs don't collide with names left in the
  // automerge mission doc by previous failed runs.
  const suffix = Math.floor(Math.random() * 1_000_000).toString(36);
  const evaName = `Playwright Eva For Rex ${suffix}`;
  const rexName = `Playwright REX ${suffix}`;

  await page.goto("http://localhost:4000/mission/22");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("loading-overlay").waitFor({ state: "hidden", timeout: 30000 });

  // Turn on global edit mode (required for editing fields and showing the delete button).
  await toggleEditMode(page);

  // Go to EVA section.
  await page.getByLabel("evas Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText("EVAs");

  // Add an EVA.
  const startingNumEvas = await page.getByLabel("evaList-item", { exact: true }).count();
  await page.getByLabel("addEva", { exact: true }).click();
  await page.mouse.move(0, 0); // Dismiss any lingering tooltips
  await expect(page.getByLabel("evaList-item", { exact: true })).toHaveCount(startingNumEvas + 1);

  // Wait for the EVA Title field to render then rename the EVA.
  await displayField(page, "EVA Title").first().waitFor({ state: "attached", timeout: 5000 });
  await editValidatedField(page, "EVA Title", evaName);
  await page.mouse.move(0, 0);
  await expect(page.getByLabel("evaList-item").filter({ hasText: evaName })).toHaveCount(1);
  await expect(displayField(page, "EVA Title").first()).toContainText(evaName);

  // Add a REX inside that EVA.
  await page
    .getByLabel("evaList-item")
    .filter({ hasText: evaName })
    .getByLabel("Add REX", { exact: true })
    .click();
  await page.getByLabel("loading-overlay").waitFor({ state: "hidden", timeout: 10000 });

  // The right panel switches to the REX details, exposing the "REX Title" field.
  await displayField(page, "REX Title").first().waitFor({ timeout: 5000 });
  await expect(displayField(page, "REX Title").first()).toContainText("REX");

  // Edit the REX title via the dialog and Save.
  await editValidatedField(page, "REX Title", rexName);
  await page.mouse.move(0, 0);
  await expect(page.getByLabel("evaList-item").filter({ hasText: rexName })).toHaveCount(1);

  // Delete the REX. While the REX is selected, the `deleteEva` button deletes the REX
  // (see eva-right-eva.tsx: deleteEva dispatches thunkDeleteRex when isRexEva is true).
  const dialogPromiseDeleteRex = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("deleteEva", { exact: true }).click();
  await dialogPromiseDeleteRex;
  await page.getByLabel("loading-overlay").waitFor({ state: "hidden", timeout: 10000 });
  await expect(page.getByLabel("evaList-item").filter({ hasText: rexName })).toHaveCount(0);

  // Now delete the parent EVA. After deleting the REX, the as-planned EVA is
  // auto-selected in Redux, but the right pane may still be showing a child
  // (traverse) of that EVA from a prior interaction, and clicking the EVA
  // name again would just toggle deselection. Reload the page to reset the
  // UI state cleanly, re-enter edit mode, then click the EVA name fresh.
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("loading-overlay").waitFor({ state: "hidden", timeout: 30000 });
  await toggleEditMode(page);
  await page.getByLabel("evas Section", { exact: true }).click();
  await page.getByText(evaName, { exact: true }).first().click();
  await displayField(page, "EVA Title").first().waitFor({ state: "attached", timeout: 5000 });
  await page.getByLabel("deleteEva", { exact: true }).waitFor({ timeout: 5000 });

  const dialogPromiseDeleteEva = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("deleteEva", { exact: true }).click();
  await dialogPromiseDeleteEva; // Wait for the dialog to be accepted
  await page.getByLabel("loading-overlay").waitFor({ state: "hidden", timeout: 10000 });
  await expect(page.getByLabel("evaList-item").filter({ hasText: evaName })).toHaveCount(0);
});
