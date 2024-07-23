import { test } from "@playwright/test";
import actionTemplateTest from "./mission/actionTemplateTest";
import landerRadiiTest from "./mission/landerRadiiTest";

test.only("create edit cancel delete radii", async ({ page }) => {
  await landerRadiiTest(page);
});

test("create edit cancel delete actionTemplates", async ({ page }) => {
  await actionTemplateTest(page);
});
