import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { enablePlanningEditMode } from "./planningHelpers";

const ids = {
  level1: "70000000-0000-4000-8000-000000000001",
  level2: "70000000-0000-4000-8000-000000000002",
  level3: "70000000-0000-4000-8000-000000000003",
  observe: "70000000-0000-4000-8000-000000000011",
  sample: "70000000-0000-4000-8000-000000000012",
  core: "70000000-0000-4000-8000-000000000013",
  pristine: "70000000-0000-4000-8000-000000000014",
};

async function openRules(page: Page): Promise<void> {
  await page.getByLabel("stmRules Section", { exact: true }).click();
  await page.getByText("Rules", { exact: true }).click();
  await expect(page.getByText("Satisfaction Rules", { exact: true })).toBeVisible();
}

async function selectRuleDefinition(
  row: Locator,
  category: "Verbs" | "Nouns" | "Adjectives",
  value: string
): Promise<void> {
  await row.getByText(`${category}...`, { exact: true }).click();
  await row.getByText(value, { exact: true }).click();
}

test("satisfaction rules create and edit independently, protect referenced definitions, honor delete cancellation, and persist after reload", async ({
  page,
  mission,
}) => {
  await mission.change((draft) => {
    draft.actionSystemVersion = 2;
    draft.actionDefinitions = {
      verbs: {
        [ids.observe]: { name: "Observe", abbr: "observe" },
        [ids.sample]: { name: "Sample", abbr: "sample" },
      },
      nouns: { [ids.core]: { name: "Core", abbr: "core" } },
      adjectives: { [ids.pristine]: { name: "Pristine", abbr: "pristine" } },
    };
    draft.stmLevel1s[ids.level1] = {
      uuid: ids.level1,
      name: "Mission Science",
      numbering: "1",
      createdAt: 1,
      updatedAt: 1,
    };
    draft.stmLevel2s[ids.level2] = {
      uuid: ids.level2,
      name: "Sampling",
      numbering: "a",
      level1Uuid: ids.level1,
      createdAt: 1,
      updatedAt: 1,
    };
    draft.stmLevel3s[ids.level3] = {
      uuid: ids.level3,
      name: "Collect pristine core",
      numbering: "1",
      level2Uuid: ids.level2,
      createdAt: 1,
      updatedAt: 1,
    };
  });

  const original = await mission.read();
  await mission.open(page);
  await enablePlanningEditMode(page);
  await openRules(page);

  const addRule = page.getByLabel("Add rule for 1A-1", { exact: true });
  await addRule.click();
  await expect.poll(async () => Object.keys((await mission.read()).stmRules).length).toBe(1);
  let ruleUuids = Object.keys((await mission.read()).stmRules);
  const firstRuleUuid = ruleUuids[0];
  const firstRuleRow = () => page.locator('[class*="stmRuleRowContainer"]').nth(0);
  await selectRuleDefinition(firstRuleRow(), "Verbs", "Observe");
  await selectRuleDefinition(firstRuleRow(), "Nouns", "Core");
  await selectRuleDefinition(firstRuleRow(), "Adjectives", "Pristine");
  await expect
    .poll(async () => (await mission.read()).stmRules[firstRuleUuid])
    .toMatchObject({
      verbUuids: [ids.observe],
      nounUuids: [ids.core],
      adjectiveUuids: [ids.pristine],
      count: 1,
    });
  const firstRow = firstRuleRow();
  await firstRow.locator('svg[data-icon="square-minus"]').click();
  await expect.poll(async () => (await mission.read()).stmRules[firstRuleUuid].count).toBe(1);
  await firstRow.locator('svg[data-icon="square-plus"]').click();
  await expect.poll(async () => (await mission.read()).stmRules[firstRuleUuid].count).toBe(2);
  await expect(firstRow.getByLabel("duplicateRule", { exact: true })).toHaveCount(0);

  await addRule.click();
  await expect.poll(async () => Object.keys((await mission.read()).stmRules).length).toBe(2);
  ruleUuids = Object.keys((await mission.read()).stmRules);
  const secondRuleUuid = ruleUuids.find((uuid) => uuid !== firstRuleUuid)!;
  const secondRuleRow = () => page.locator('[class*="stmRuleRowContainer"]').nth(1);
  await selectRuleDefinition(secondRuleRow(), "Verbs", "Sample");
  await expect
    .poll(async () => (await mission.read()).stmRules[secondRuleUuid].verbUuids)
    .toEqual([ids.sample]);
  expect((await mission.read()).stmRules[firstRuleUuid].verbUuids).toEqual([ids.observe]);
  expect((await mission.read()).stmRules[firstRuleUuid].count).toBe(2);

  await page.getByLabel("mission Section", { exact: true }).click();
  await page.getByLabel("actionDefinitions_panel", { exact: true }).click();
  const observeRow = page
    .getByLabel("actionDefs-item", { exact: true })
    .filter({ hasText: "Observe" });
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("alert");
    expect(dialog.message()).toContain("Rule in STM Item: 1a1");
    await dialog.accept();
  });
  await observeRow.getByLabel("deleteButton", { exact: true }).click();
  expect((await mission.read()).actionDefinitions.verbs[ids.observe]).toEqual({
    name: "Observe",
    abbr: "observe",
  });

  await openRules(page);
  const firstDelete = () => firstRuleRow().getByLabel("deleteRule", { exact: true });
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toBe("Are you sure you want to delete this rule?");
    await dialog.dismiss();
  });
  await firstDelete().click();
  expect((await mission.read()).stmRules[firstRuleUuid]).toBeDefined();

  page.once("dialog", async (dialog) => dialog.accept());
  await firstDelete().click();
  await expect
    .poll(async () => Object.hasOwn((await mission.read()).stmRules, firstRuleUuid))
    .toBe(false);
  await expect
    .poll(async () => Object.keys((await mission.read()).stmRules))
    .toEqual([secondRuleUuid]);

  await page.getByLabel("mission Section", { exact: true }).click();
  await page.getByLabel("actionDefinitions_panel", { exact: true }).click();
  const safeObserveRow = page
    .getByLabel("actionDefs-item", { exact: true })
    .filter({ hasText: "Observe" });
  await safeObserveRow.getByLabel("deleteButton", { exact: true }).click();
  await expect
    .poll(async () => Object.hasOwn((await mission.read()).actionDefinitions.verbs, ids.observe))
    .toBe(false);
  await mission.open(page);
  await enablePlanningEditMode(page);
  await openRules(page);
  await expect(page.locator('[class*="stmRuleRowContainer"]')).toHaveCount(1);
  await expect(page.getByText("Sample", { exact: true })).toBeVisible();
  const reloaded = await mission.read();
  expect(reloaded.stmRules[secondRuleUuid]).toMatchObject({
    stmUuid: ids.level3,
    verbUuids: [ids.sample],
    count: 1,
  });
  expect(reloaded.actions).toEqual(original.actions);
});

test("STM matching uses exact tuples and wildcards, excludes missing categories, and crosses the rule threshold at the boundary", async ({
  page,
  mission,
}) => {
  const actionIds = [
    "71000000-0000-4000-8000-000000000001",
    "71000000-0000-4000-8000-000000000002",
    "71000000-0000-4000-8000-000000000003",
    "71000000-0000-4000-8000-000000000004",
    "71000000-0000-4000-8000-000000000005",
  ];
  const exactRuleUuid = "71000000-0000-4000-8000-000000000021";
  const wildcardRuleUuid = "71000000-0000-4000-8000-000000000022";
  const sourceAction = (await mission.read()).actions[mission.ids.actionA];
  await mission.change((draft) => {
    draft.actionSystemVersion = 2;
    draft.actionDefinitions = {
      verbs: {
        [ids.observe]: { name: "Observe", abbr: "observe" },
        [ids.sample]: { name: "Sample", abbr: "sample" },
      },
      nouns: { [ids.core]: { name: "Core", abbr: "core" } },
      adjectives: { [ids.pristine]: { name: "Pristine", abbr: "pristine" } },
    };
    draft.stmLevel1s[ids.level1] = {
      uuid: ids.level1,
      name: "Mission Science",
      numbering: "1",
      createdAt: 1,
      updatedAt: 1,
    };
    draft.stmLevel2s[ids.level2] = {
      uuid: ids.level2,
      name: "Sampling",
      numbering: "a",
      level1Uuid: ids.level1,
      createdAt: 1,
      updatedAt: 1,
    };
    draft.stmLevel3s[ids.level3] = {
      uuid: ids.level3,
      name: "Collect pristine core",
      numbering: "1",
      level2Uuid: ids.level2,
      createdAt: 1,
      updatedAt: 1,
    };
    const makeAction = (
      uuid: string,
      verbUuid: string,
      adjectiveUuid: string | null,
      enabled: boolean,
      name: string
    ): Action => ({
      ...JSON.parse(JSON.stringify(sourceAction)),
      uuid,
      refUuid: uuid,
      name,
      poiUuid: null,
      stationUuid: mission.ids.stationA,
      stmAction: true,
      enabled,
      actionDefinition: {
        verbUuid,
        nounUuid: ids.core,
        ...(adjectiveUuid ? { adjectiveUuid } : {}),
      },
    });
    draft.actions[actionIds[0]] = makeAction(
      actionIds[0],
      ids.observe,
      ids.pristine,
      true,
      "Exact match A"
    );
    draft.actions[actionIds[1]] = makeAction(
      actionIds[1],
      ids.observe,
      ids.pristine,
      true,
      "Exact duplicate B"
    );
    // Duplicate disabled tuple is included in the rule-page action tally but is ineligible for EVA coverage.
    draft.actions[actionIds[2]] = makeAction(
      actionIds[2],
      ids.observe,
      ids.pristine,
      false,
      "Exact duplicate disabled"
    );
    draft.actions[actionIds[3]] = makeAction(
      actionIds[3],
      ids.sample,
      ids.pristine,
      true,
      "Wildcard verb match"
    );
    draft.actions[actionIds[4]] = makeAction(
      actionIds[4],
      ids.observe,
      null,
      true,
      "Missing adjective"
    );
    draft.stations[mission.ids.stationA].actionOrderUuids.push(...actionIds);
    draft.stmRules[exactRuleUuid] = {
      uuid: exactRuleUuid,
      stmUuid: ids.level3,
      count: 2,
      verbUuids: [ids.observe],
      nounUuids: [ids.core],
      adjectiveUuids: [ids.pristine],
      verbAny: false,
      nounAny: false,
      adjectiveAny: false,
      createdAt: 1,
      updatedAt: 1,
    };
    draft.stmRules[wildcardRuleUuid] = {
      uuid: wildcardRuleUuid,
      stmUuid: ids.level3,
      count: 3,
      verbUuids: [],
      nounUuids: [ids.core],
      adjectiveUuids: [],
      verbAny: true,
      nounAny: false,
      adjectiveAny: true,
      createdAt: 2,
      updatedAt: 2,
    };
  });

  await mission.open(page);
  await enablePlanningEditMode(page);
  await openRules(page);
  const stats = page.locator('[class*="matchingActionStats"]');
  await expect(stats.nth(0)).toContainText("3 Actions at 1");
  await expect(stats.nth(1)).toContainText("4 Actions at 1");
  const exactRuleRow = page.locator('[class*="stmRuleRowContainer"]').nth(0);
  await expect(exactRuleRow).toContainText("Observe");
  await expect(exactRuleRow).toContainText("Core");
  await expect(exactRuleRow).toContainText("Pristine");
  expect((await mission.read()).actions[actionIds[2]].enabled).toBe(false);
  expect((await mission.read()).stmRules[exactRuleUuid].count).toBe(2);

  await exactRuleRow.locator('svg[data-icon="square-plus"]').click();
  await expect.poll(async () => (await mission.read()).stmRules[exactRuleUuid].count).toBe(3);
  await page.getByLabel("reports Section", { exact: true }).click();
  await page.getByText("EVA STM Coverage", { exact: true }).click();
  const coverageCell = page.locator('[data-tooltip-html^="Survey Alpha:"]');
  await expect(coverageCell).toHaveAttribute(
    "data-tooltip-html",
    /Survey Alpha: 5 matching actions, 1\/2 rules satisfied \(partially satisfied\)/
  );

  await page.getByLabel("stmRules Section", { exact: true }).click();
  await page.getByText("Rules", { exact: true }).click();
  await page
    .locator('[class*="stmRuleRowContainer"]')
    .nth(0)
    .locator('svg[data-icon="square-minus"]')
    .click();
  await expect.poll(async () => (await mission.read()).stmRules[exactRuleUuid].count).toBe(2);
  await page.getByLabel("reports Section", { exact: true }).click();
  await page.getByText("EVA STM Coverage", { exact: true }).click();
  await expect(coverageCell).toHaveAttribute(
    "data-tooltip-html",
    /Survey Alpha: 5 matching actions, 2\/2 rules satisfied \(all rules satisfied\)/
  );

  await page.getByLabel("stmRules Section", { exact: true }).click();
  await page.getByText("Rules", { exact: true }).click();
  await page.getByLabel("Add rule for 1A-1", { exact: true }).click();
  await expect.poll(async () => Object.keys((await mission.read()).stmRules).length).toBe(3);
  const emptyExactRuleUuid = Object.keys((await mission.read()).stmRules).find(
    (uuid) => uuid !== exactRuleUuid && uuid !== wildcardRuleUuid
  )!;
  const emptyExactRuleRow = page.locator('[class*="stmRuleRowContainer"]').nth(2);
  await selectRuleDefinition(emptyExactRuleRow, "Nouns", "Core");
  await selectRuleDefinition(emptyExactRuleRow, "Adjectives", "Pristine");
  await expect
    .poll(async () => (await mission.read()).stmRules[emptyExactRuleUuid])
    .toMatchObject({
      verbUuids: [],
      nounUuids: [ids.core],
      adjectiveUuids: [ids.pristine],
      verbAny: false,
      count: 1,
    });
  await expect(emptyExactRuleRow.locator('[class*="matchingActionStats"]')).toHaveText("");
  await page.getByLabel("reports Section", { exact: true }).click();
  await page.getByText("EVA STM Coverage", { exact: true }).click();
  await expect(coverageCell).toHaveAttribute(
    "data-tooltip-html",
    /Survey Alpha: 5 matching actions, 2\/3 rules satisfied \(partially satisfied\)/
  );
});
