import { Page, expect } from "@playwright/test";

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
  topBanner: "",
  description: "",
  lat: "-3.645421873728663",
  lng: "-17.47186660766602",
  duration: "20",
  traverseRate: "2",
  walkbackRate: "2",
};

const testAttr: MissionAttributes = {
  missionName: "Test_14",
  topBanner: "Testing Testing 1 2 3",
  description: "Test description",
  lat: "-3.62222222222222",
  lng: "-17.50000000000000",
  duration: "30",
  traverseRate: "3",
  walkbackRate: "3",
};

export async function landerRadiiTest(page: Page): Promise<string> {
  await page.goto("http://aegis-local.fit.nasa.gov:4000/mission/1");
  //go to mission preferences
  await page.waitForTimeout(2000);
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
  await page.waitForTimeout(1000);
  await expect(page.getByLabel("saveButton")).toBeAttached();

  await page.getByLabel("Mission Name", { exact: true }).last().fill(testAttr.missionName);
  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.waitForTimeout(200);

  await expect(page.getByLabel("Mission Name", { exact: true })).toContainText(
    testAttr.missionName
  );
  await expect(page.getByLabel("missionNameHeader", { exact: true })).toContainText(
    testAttr.missionName
  );

  // modify and check mission top banner
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await page.waitForTimeout(1000);
  await expect(page.getByLabel("saveButton")).toBeAttached();

  await page.getByLabel("Mission Banner", { exact: true }).last().fill(testAttr.topBanner);
  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.waitForTimeout(200);

  await expect(page.getByLabel("Mission Banner", { exact: true })).toContainText(
    testAttr.topBanner
  );
  await expect(page.getByLabel("missionBannerText", { exact: true })).toContainText(
    testAttr.topBanner
  );

  // modify and check lander location
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await page.waitForTimeout(1000);
  await expect(page.getByLabel("saveButton")).toBeAttached();

  await page.getByLabel("Latitude", { exact: true }).last().fill(testAttr.lat);
  await page.getByLabel("Longitude", { exact: true }).last().fill(testAttr.lng);
  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.waitForTimeout(200);

  await expect(page.getByLabel("Latitude", { exact: true })).toContainText(testAttr.lat);
  await expect(page.getByLabel("Longitude", { exact: true })).toContainText(testAttr.lng);

  // check earth/moon direction button
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await page.waitForTimeout(1000);
  await expect(page.getByLabel("saveButton")).toBeAttached();

  await page.getByLabel("earthDirectionButton", { exact: true }).click();
  await expect(page.getByLabel("earthHeading", { exact: true })).toBeVisible();
  await page.getByLabel("moonDirectionButton", { exact: true }).click();
  await expect(page.getByLabel("moonHeading", { exact: true })).toBeVisible();
  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.waitForTimeout(200);

  // modify and check mission defaults
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await page.waitForTimeout(1000);
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
  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.waitForTimeout(200);

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
  await page.waitForTimeout(1000);
  await expect(page.getByLabel("saveButton")).toBeAttached();

  await page.getByLabel("Mission Name", { exact: true }).last().fill(baseAttr.missionName);
  await page.getByLabel("Mission Banner", { exact: true }).last().fill(baseAttr.topBanner);
  await page.getByLabel("Latitude", { exact: true }).last().fill(baseAttr.lat);
  await page.getByLabel("Longitude", { exact: true }).last().fill(baseAttr.lng);
  await page.getByLabel("Default EVA Duration", { exact: true }).last().fill(baseAttr.duration);
  await page
    .getByLabel("Average traverse rate", { exact: true })
    .last()
    .fill(baseAttr.traverseRate);
  await page
    .getByLabel("Default walkback rate", { exact: true })
    .last()
    .fill(baseAttr.walkbackRate);

  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.waitForTimeout(200);

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
  await expect(page.getByLabel("Latitude", { exact: true })).toContainText(baseAttr.lat);
  await expect(page.getByLabel("Longitude", { exact: true })).toContainText(baseAttr.lng);

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
