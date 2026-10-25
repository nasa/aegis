import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";

const ids = {
  level1: "91000000-0000-4000-8000-000000000001",
  level2: "91000000-0000-4000-8000-000000000002",
  level3: "91000000-0000-4000-8000-000000000003",
  observe: "91000000-0000-4000-8000-000000000011",
  sample: "91000000-0000-4000-8000-000000000012",
  core: "91000000-0000-4000-8000-000000000013",
  strata: "91000000-0000-4000-8000-000000000014",
  ruleOld: "91000000-0000-4000-8000-000000000021",
  ruleNew: "91000000-0000-4000-8000-000000000022",
};

async function openRules(page: Page): Promise<void> {
  await page.getByLabel("stmRules Section", { exact: true }).click();
  await page.getByText("Rules", { exact: true }).click();
  await expect(page.getByText("Satisfaction Rules", { exact: true })).toBeVisible();
}

async function readColumnWidths(row: Locator): Promise<number[]> {
  return Promise.all(
    ["Verb", "Noun", "Adjective"].map(async (type) =>
      row
        .locator(`[class*="stmRuleSetContainer${type}"]`)
        .evaluate((element) => element.getBoundingClientRect().width)
    )
  );
}

test("v2 rule columns keep fixed order and auto-fit while tier layout stays local", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.actionSystemVersion = 2;
    doc.stmLevel1Enabled = true;
    doc.stmLevel1Name = "Objective";
    doc.stmLevel2Name = "Goal";
    doc.stmLevel3Name = "Investigation";
    doc.actionDefinitions = {
      verbs: {
        [ids.observe]: { name: "Observe Geological Strata", abbr: "observe" },
        [ids.sample]: { name: "Collect Microscopic Mineral Grains", abbr: "collect" },
      },
      nouns: {
        [ids.core]: { name: "Core", abbr: "core" },
        [ids.strata]: { name: "Layered volcanic deposits", abbr: "deposits" },
      },
      adjectives: {},
    };
    doc.stmLevel1s[ids.level1] = {
      uuid: ids.level1,
      name: "Lunar field science",
      numbering: "2",
      createdAt: 1,
      updatedAt: 1,
    };
    doc.stmLevel2s[ids.level2] = {
      uuid: ids.level2,
      name: "Regional geology",
      numbering: "c",
      level1Uuid: ids.level1,
      createdAt: 1,
      updatedAt: 1,
    };
    doc.stmLevel3s[ids.level3] = {
      uuid: ids.level3,
      name: "Compare basalt and regolith",
      numbering: "4",
      level2Uuid: ids.level2,
      createdAt: 1,
      updatedAt: 1,
    };
    doc.stmRules = {
      [ids.ruleOld]: {
        uuid: ids.ruleOld,
        stmUuid: ids.level3,
        count: 1,
        verbUuids: [ids.observe],
        nounUuids: [ids.core],
        adjectiveUuids: [],
        verbAny: false,
        nounAny: false,
        adjectiveAny: false,
        createdAt: 1,
        updatedAt: 1,
      },
      [ids.ruleNew]: {
        uuid: ids.ruleNew,
        stmUuid: ids.level3,
        count: 2,
        verbUuids: [ids.sample],
        nounUuids: [ids.strata],
        adjectiveUuids: [],
        verbAny: false,
        nounAny: false,
        adjectiveAny: false,
        createdAt: 2,
        updatedAt: 2,
      },
    };
  });

  const initialMission = await mission.read();
  const semanticSnapshot = {
    actionDefinitions: initialMission.actionDefinitions,
    stmLevel1s: initialMission.stmLevel1s,
    stmLevel2s: initialMission.stmLevel2s,
    stmLevel3s: initialMission.stmLevel3s,
    stmRules: initialMission.stmRules,
  };

  await mission.open(page);
  await openRules(page);
  await page.evaluate(() => document.fonts.ready);

  const rows = page.locator('[class*="stmRuleRowContainer"]');
  await expect(rows).toHaveCount(2);
  const firstRule = rows.nth(0);
  const secondRule = rows.nth(1);
  await expect(firstRule.getByText("Observe Geological Strata", { exact: true })).toBeVisible();
  await expect(firstRule.getByText("Core", { exact: true })).toBeVisible();
  await expect(
    secondRule.getByText("Collect Microscopic Mineral Grains", { exact: true })
  ).toBeVisible();
  await expect(secondRule.getByText("Layered volcanic deposits", { exact: true })).toBeVisible();

  const initialWidths = await readColumnWidths(firstRule);
  expect(initialWidths.every((width) => width > 0)).toBe(true);
  expect(await readColumnWidths(secondRule)).toEqual(initialWidths);
  const ruleColumnOrder = await firstRule
    .locator('[class*="stmRuleContainer"]')
    .evaluate((container) =>
      Array.from(container.children).map((child) => String(child.className))
    );
  const verbIndex = ruleColumnOrder.findIndex((className) =>
    className.includes("stmRuleSetContainerVerb")
  );
  const nounIndex = ruleColumnOrder.findIndex((className) =>
    className.includes("stmRuleSetContainerNoun")
  );
  const adjectiveIndex = ruleColumnOrder.findIndex((className) =>
    className.includes("stmRuleSetContainerAdjective")
  );
  expect(verbIndex).toBeGreaterThan(-1);
  expect(nounIndex).toBeGreaterThan(verbIndex);
  expect(adjectiveIndex).toBeGreaterThan(nounIndex);
  await expect(page.locator('[class*="stmRuleRowContainer"] [draggable="true"]')).toHaveCount(0);
  await expect(page.locator('[class*="stmRuleRowContainer"] [aria-label*="resize" i]')).toHaveCount(
    0
  );

  const verbColumn = firstRule.locator('[class*="stmRuleSetContainerVerb"]');
  const adjectiveColumn = firstRule.locator('[class*="stmRuleSetContainerAdjective"]');
  const verbBox = await verbColumn.boundingBox();
  expect(verbBox).not.toBeNull();
  await page.mouse.move(verbBox!.x + verbBox!.width, verbBox!.y + verbBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(verbBox!.x + verbBox!.width + 55, verbBox!.y + verbBox!.height / 2);
  await page.mouse.up();
  await verbColumn.dragTo(adjectiveColumn);

  expect(await readColumnWidths(firstRule)).toEqual(initialWidths);
  await expect(firstRule.getByText("Observe Geological Strata", { exact: true })).toBeVisible();
  await expect(
    secondRule.getByText("Collect Microscopic Mineral Grains", { exact: true })
  ).toBeVisible();

  await page.locator('[data-tooltip-html="Collapse Objective column"]').click();
  await page.locator('[data-tooltip-html="Collapse Goal column"]').click();
  await expect(page.locator('[data-tooltip-html="Expand Objective column"]')).toBeVisible();
  await expect(page.locator('[data-tooltip-html="Expand Goal column"]')).toBeVisible();
  await page.getByText("Rule Matches", { exact: true }).click();
  await expect(page.getByText("Rule Matches", { exact: true })).toHaveClass(/tabActive/);
  await page.getByText("Rules", { exact: true }).click();
  await expect(page.locator('[data-tooltip-html="Expand Objective column"]')).toBeVisible();
  await expect(page.locator('[data-tooltip-html="Expand Goal column"]')).toBeVisible();
  expect(await readColumnWidths(rows.first())).toEqual(initialWidths);

  await page.reload();
  await openRules(page);
  await expect(page.locator('[data-tooltip-html="Collapse Objective column"]')).toBeVisible();
  await expect(page.locator('[data-tooltip-html="Collapse Goal column"]')).toBeVisible();
  await expect(page.locator('[class*="stmRuleRowContainer"]')).toHaveCount(2);
  await expect(
    page
      .locator('[class*="stmRuleRowContainer"]')
      .nth(0)
      .getByText("Observe Geological Strata", { exact: true })
  ).toBeVisible();
  await expect(
    page
      .locator('[class*="stmRuleRowContainer"]')
      .nth(1)
      .getByText("Collect Microscopic Mineral Grains", { exact: true })
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(async () => readColumnWidths(page.locator('[class*="stmRuleRowContainer"]').first()))
    .toEqual(initialWidths);

  const afterReload = await mission.read();
  expect({
    actionDefinitions: afterReload.actionDefinitions,
    stmLevel1s: afterReload.stmLevel1s,
    stmLevel2s: afterReload.stmLevel2s,
    stmLevel3s: afterReload.stmLevel3s,
    stmRules: afterReload.stmRules,
  }).toEqual(semanticSnapshot);
});
