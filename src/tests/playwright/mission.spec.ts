import { test } from "@playwright/test";
import actionTemplateTest from "./mission/actionTemplateTest";
import { landerRadiiTest } from "./mission/landerRadiiTest";

test("edit mission preferences", async ({ page }) => {
  await actionTemplateTest(page);
});

test("create edit cancel delete radii", async ({ page }) => {
  await landerRadiiTest(page);
});

test("create edit duplicate cancel delete actionTemplates", async ({ page }) => {
  await actionTemplateTest(page);
});
