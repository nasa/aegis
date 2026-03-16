import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

type MissionAttributes = {
  missionName: string;
  topBanner: string;
  description: string;
  lat: string;
  lng: string;
  duration: string;
  traverseRate: string;
  walkbackRate: string;
};

const baseAttr: MissionAttributes = {
  missionName: "Apollo_14",
  topBanner: " ",
  description: "",
  lat: "-3.645421873728663",
  lng: "-17.47186660766602",
  duration: "20",
  traverseRate: "2",
  walkbackRate: "2",
};

const nameBank: string[] = [
  "Test_14",
  "14_test",
  "Test 14",
  "14 Test",
  "Test Mission 14",
  "Mission 14 Test",
];

const bannerBank: string[] = [
  "This is a test mission",
  "This is the 14th test mission",
  "This mission is a test",
  "This is a sample banner",
  "This is a test banner for mission 14",
  "Banner time",
];

const descriptionBank: string[] = [
  "This is a test mission description",
  "This mission is for testing purposes",
  "This is the 14th test mission description",
  "Testing mission description",
  "Sample mission description for testing",
  "Mission 14 test description",
];

const latBank: string[] = [
  "-3.645421873728663",
  "-3.644315",
  "-3.643000",
  "-3.642000",
  "-3.641000",
  "-3.640000",
];

const lngBank: string[] = [
  "-17.47186660766602",
  "-17.50000000000000",
  "-17.52000000000000",
  "-17.54000000000000",
  "-17.56000000000000",
  "-17.58000000000000",
];

const durationBank: string[] = ["20", "30", "40", "50", "60", "70"];

const traverseRateBank: string[] = ["2", "3", "4", "5", "6", "7"];

const walkbackRateBank: string[] = ["2", "3", "4", "5", "6", "7"];

async function waitForSaveButton(page: Page, isActive: boolean) {
  const dataTooltipContent = isActive ? "Save Mission" : "Save Mission (nothing to save)";
  await page.keyboard.press("Tab");
  await page.getByLabel("saveButton").waitFor({ timeout: 1000 });
  await expect(page.getByLabel("saveButton")).toHaveAttribute(
    "data-tooltip-html",
    dataTooltipContent,
    {
      timeout: 1000,
    }
  );
}

async function saveAndWaitForDbUpdate(page: Page) {
  await page.getByLabel("saveButton", { exact: true }).click();
  await page
    .getByLabel("loading-overlay", { exact: true })
    .waitFor({ state: "hidden", timeout: 5000 });
  await page.getByLabel("Edit", { exact: true }).waitFor({ timeout: 5000 });
}

export async function missionConfigTest(page: Page): Promise<string> {
  const testAttr: MissionAttributes = {
    missionName: nameBank[Math.floor(Math.random() * nameBank.length)],
    topBanner: bannerBank[Math.floor(Math.random() * bannerBank.length)],
    description: descriptionBank[Math.floor(Math.random() * descriptionBank.length)],
    lat: latBank[Math.floor(Math.random() * latBank.length)],
    lng: lngBank[Math.floor(Math.random() * lngBank.length)],
    duration: durationBank[Math.floor(Math.random() * durationBank.length)],
    traverseRate: traverseRateBank[Math.floor(Math.random() * traverseRateBank.length)],
    walkbackRate: walkbackRateBank[Math.floor(Math.random() * walkbackRateBank.length)],
  };

  await page.goto("http://localhost:4000/mission/22");
  //go to mission preferences
  await page.waitForLoadState("networkidle");
  await page.getByLabel("mission Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText(
    "Mission Configuration"
  );
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toContainText(
    "Mission Preferences"
  );

  // modify and check mission name
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await waitForSaveButton(page, false);

  await page.getByLabel("Mission Name", { exact: true }).last().fill(testAttr.missionName);

  await waitForSaveButton(page, true);
  await saveAndWaitForDbUpdate(page);
  await page.getByLabel("Edit", { exact: true }).waitFor();

  await expect(page.getByLabel("Mission Name", { exact: true })).toContainText(
    testAttr.missionName
  );
  await expect(page.getByLabel("missionNameHeader", { exact: true })).toContainText(
    testAttr.missionName
  );

  // modify and check mission top banner
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await waitForSaveButton(page, false);
  await expect(page.getByLabel("saveButton")).toBeAttached();

  await page.getByLabel("Mission Banner", { exact: true }).last().fill(testAttr.topBanner);
  await waitForSaveButton(page, true);
  await saveAndWaitForDbUpdate(page);
  await page.getByLabel("Edit", { exact: true }).last().waitFor();

  await expect(page.getByLabel("Mission Banner", { exact: true })).toContainText(
    testAttr.topBanner
  );
  await expect(page.getByLabel("missionBannerText", { exact: true })).toContainText(
    testAttr.topBanner
  );

  // modify and check mission defaults
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await waitForSaveButton(page, false);

  await expect(page.getByLabel("saveButton")).toBeAttached();

  await page.getByLabel("Default EVA Duration", { exact: true }).last().fill(testAttr.duration);
  await page
    .getByLabel("Average traverse rate", { exact: true })
    .last()
    .fill(testAttr.traverseRate);
  await page
    .getByLabel("Default walkback rate", { exact: true })
    .last()
    .fill(testAttr.walkbackRate);
  await waitForSaveButton(page, true);
  await saveAndWaitForDbUpdate(page);
  await page.getByLabel("Edit", { exact: true }).last().waitFor();

  await expect(page.getByLabel("Default EVA Duration", { exact: true })).toContainText(
    testAttr.duration
  );
  await expect(page.getByLabel("Average traverse rate", { exact: true })).toContainText(
    testAttr.traverseRate
  );
  await expect(page.getByLabel("Default walkback rate", { exact: true })).toContainText(
    testAttr.walkbackRate
  );

  // Return to defaults
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await waitForSaveButton(page, false);
  await expect(page.getByLabel("saveButton")).toBeAttached();

  await page.getByLabel("Mission Name", { exact: true }).last().fill(baseAttr.missionName);
  await page.getByLabel("Mission Banner", { exact: true }).last().fill(baseAttr.topBanner);
  await page.getByLabel("Default EVA Duration", { exact: true }).last().fill(baseAttr.duration);

  await page
    .getByLabel("Average traverse rate", { exact: true })
    .last()
    .fill(baseAttr.traverseRate);
  await page
    .getByLabel("Default walkback rate", { exact: true })
    .last()
    .fill(baseAttr.walkbackRate);

  await waitForSaveButton(page, true);
  await saveAndWaitForDbUpdate(page);
  await page.getByLabel("Edit", { exact: true }).waitFor();

  await expect(page.getByLabel("Mission Name", { exact: true })).toContainText(
    baseAttr.missionName
  );
  await expect(page.getByLabel("missionNameHeader", { exact: true })).toContainText(
    baseAttr.missionName
  );
  await expect(page.getByLabel("Mission Banner", { exact: true })).toContainText(
    baseAttr.topBanner
  );
  await expect(page.getByLabel("missionBannerText", { exact: true })).toContainText(
    baseAttr.topBanner
  );

  await expect(page.getByLabel("Default EVA Duration", { exact: true })).toContainText(
    baseAttr.duration
  );
  await expect(page.getByLabel("Average traverse rate", { exact: true })).toContainText(
    baseAttr.traverseRate
  );
  await expect(page.getByLabel("Default walkback rate", { exact: true })).toContainText(
    baseAttr.walkbackRate
  );

  return "success";
}
