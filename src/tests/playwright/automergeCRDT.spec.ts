import { test } from "@playwright/test";
import { waitForPageReady } from "./helpers";

/**
 * For use in local dev only to simulate concurrent edits and other Conflict-Free Replicated Data Type (CRDT) tests
 * Open up as many terminals as you want and run this test in each one
 *
 * How to use this test:
 * 1. Comment out the "testIgnore" line in the playwright.config.ts file
 * 2. In a terminal run "npm run dev"
 * 3. In another terminal run the following command below. Open as many terminals as you want
 * npx playwright test src/tests/playwright/automergeCRDT.spec.ts --headed --project=chromium --config=./src/tests/playwright/playwright.config.ts --timeout=0
 */

test("Continuous automerge edits", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });

  const page = await context.newPage();

  await page.goto("http://localhost:4000/mission/1");
  await waitForPageReady(page);
  await page.getByLabel("mission Section").locator("path").click();
  await page.getByLabel("Edit").click();

  let loopNumber = 0;
  // Keep running until process is killed
  while (true) {
    try {
      // Edit banner and description
      // await page.getByLabel("Mission Banner").click();
      // await page.getByLabel("Mission Banner").fill(`${loopNumber} - (Mission Banner)`);
      // await page.getByLabel("Mission Description").click();
      // await page.getByLabel("Mission Description").fill(`${loopNumber} - (Description)`);
      // await page.getByLabel("Mission Banner").click();
      // await page.getByLabel("Mission Banner").fill(`${loopNumber} - (Mission Banner Again)`);
      // await page.getByLabel("Mission Description").click();
      // await page.getByLabel("Mission Description").fill(`${loopNumber} - (Description Again)`);

      // Edit items in the Mission Equipment Panel
      // await page.getByLabel("equipment_panel").click();
      // const equipmentItems = page.getByLabel("equipmentList-item");
      // const itemCount = await equipmentItems.count();
      // const randomIndex = Math.floor(Math.random() * itemCount);
      // const randomEquipmentCheckbox = equipmentItems.nth(randomIndex).getByRole("checkbox");
      // await randomEquipmentCheckbox.click();
      // await page.waitForTimeout(100);
      // await randomEquipmentCheckbox.click();

      // Edit items in the Action Templates panel
      await page.getByLabel("actionTemplate_panel").click();
      const templateItems = page.getByLabel("templateList-item");
      const randomTemplate = templateItems.first();

      // Check if template is already expanded by checking for visible checkboxes
      const expandButton = randomTemplate.getByLabel("Expand Button");
      let equipmentCheckboxes = randomTemplate.getByRole("checkbox");
      let checkboxCount = await equipmentCheckboxes.count();

      // If no checkboxes visible, expand the template
      if (checkboxCount === 0) {
        await expandButton.click();
        await page.waitForTimeout(300);
        equipmentCheckboxes = randomTemplate.getByRole("checkbox");
        checkboxCount = await equipmentCheckboxes.count();
      }

      if (checkboxCount > 0) {
        const randomCheckboxIndex = Math.floor(Math.random() * checkboxCount);
        const randomCheckbox = equipmentCheckboxes.nth(randomCheckboxIndex);
        await randomCheckbox.click();
        await page.waitForTimeout(100);
        await randomCheckbox.click();
      }

      // Wait a bit before next iteration
      console.log("Completed loop number:", loopNumber);
      await page.waitForTimeout(100);
      loopNumber++;
    } catch (error) {
      console.error("Loop iteration failed:", error);
      // exit while loop
      break;
    }
  }
});
