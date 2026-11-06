import { vi } from "vitest";
import { exactText } from "./browserAssertions";
import type { Locator, BrowserPage as Page } from "vitest/browser";
import { test, expect } from "./missionHarness";
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
  await page.getByLabelText("stmRules Section", { exact: true }).click();
  await page.getByText("Rules", { exact: true }).click();
  await expect.element(page.getByText("Satisfaction Rules", { exact: true })).toBeVisible();
}

async function selectRuleDefinition(
  row: Locator,
  category: "Verbs" | "Nouns" | "Adjectives",
  value: string
): Promise<void> {
  await row.getByText(`${category}...`, { exact: true }).click();
  await row.getByText(value, { exact: true }).click();
}

test("satisfaction rules create and edit independently, protect referenced definitions, honor delete cancellation, and persist after remount", async ({
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
  await mission.open();
  await enablePlanningEditMode(page);
  await openRules(page);

  const addRule = page.getByLabelText("Add rule for 1A-1", { exact: true });
  await addRule.click();
  await expect.poll(async () => Object.keys((await mission.read()).stmRules).length).toBe(1);
  let ruleUuids = Object.keys((await mission.read()).stmRules);
  const firstRuleUuid = ruleUuids[0];
  const firstRuleRow = () => page.getBySelector('[class*="stmRuleRowContainer"]').nth(0);
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
  await firstRow.getBySelector('svg[data-icon="square-minus"]').click();
  await expect.poll(async () => (await mission.read()).stmRules[firstRuleUuid].count).toBe(1);
  await firstRow.getBySelector('svg[data-icon="square-plus"]').click();
  await expect.poll(async () => (await mission.read()).stmRules[firstRuleUuid].count).toBe(2);
  await expect.poll(() => firstRow.getByLabelText("duplicateRule", { exact: true }).length).toBe(0);

  await addRule.click();
  await expect.poll(async () => Object.keys((await mission.read()).stmRules).length).toBe(2);
  ruleUuids = Object.keys((await mission.read()).stmRules);
  const secondRuleUuid = ruleUuids.find((uuid) => uuid !== firstRuleUuid)!;
  const secondRuleRow = () => page.getBySelector('[class*="stmRuleRowContainer"]').nth(1);
  await selectRuleDefinition(secondRuleRow(), "Verbs", "Sample");
  await expect
    .poll(async () => (await mission.read()).stmRules[secondRuleUuid].verbUuids)
    .toEqual([ids.sample]);
  expect((await mission.read()).stmRules[firstRuleUuid].verbUuids).toEqual([ids.observe]);
  expect((await mission.read()).stmRules[firstRuleUuid].count).toBe(2);

  await page.getByLabelText("mission Section", { exact: true }).click();
  await page.getByLabelText("actionDefinitions_panel", { exact: true }).click();
  const observeRow = page
    .getByLabelText("actionDefs-item", { exact: true })
    .filter({ hasText: "Observe" });
  vi.spyOn(window, "alert").mockImplementationOnce((message) => {
    expect(String(message)).toContain("Rule in STM Item: 1a1");

    return true;
  });
  await observeRow.getByLabelText("deleteButton", { exact: true }).click();
  expect((await mission.read()).actionDefinitions.verbs[ids.observe]).toEqual({
    name: "Observe",
    abbr: "observe",
  });

  await openRules(page);
  const firstDelete = () => firstRuleRow().getByLabelText("deleteRule", { exact: true });
  vi.spyOn(window, "confirm").mockImplementationOnce((message) => {
    expect(String(message)).toBe("Are you sure you want to delete this rule?");

    return false;
  });
  await firstDelete().click();
  expect((await mission.read()).stmRules[firstRuleUuid]).toBeDefined();

  vi.spyOn(window, "confirm").mockReturnValueOnce(true);
  await firstDelete().click();
  await expect
    .poll(async () => Object.hasOwn((await mission.read()).stmRules, firstRuleUuid))
    .toBe(false);
  await expect
    .poll(async () => Object.keys((await mission.read()).stmRules))
    .toEqual([secondRuleUuid]);

  await page.getByLabelText("mission Section", { exact: true }).click();
  await page.getByLabelText("actionDefinitions_panel", { exact: true }).click();
  const safeObserveRow = page
    .getByLabelText("actionDefs-item", { exact: true })
    .filter({ hasText: "Observe" });
  await safeObserveRow.getByLabelText("deleteButton", { exact: true }).click();
  await expect
    .poll(async () => Object.hasOwn((await mission.read()).actionDefinitions.verbs, ids.observe))
    .toBe(false);
  await mission.open();
  await enablePlanningEditMode(page);
  await openRules(page);
  await expect.poll(() => page.getBySelector('[class*="stmRuleRowContainer"]').length).toBe(1);
  await expect.element(page.getByText("Sample", { exact: true })).toBeVisible();
  const remounted = await mission.read();
  expect(remounted.stmRules[secondRuleUuid]).toMatchObject({
    stmUuid: ids.level3,
    verbUuids: [ids.sample],
    count: 1,
  });
  expect(remounted.actions).toEqual(original.actions);
});

test("STM matching uses exact tuples and wildcards, matches missing categories through Any, and crosses the rule threshold at the boundary", async ({
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

  await mission.open();
  await enablePlanningEditMode(page);
  await openRules(page);
  const stats = page.getBySelector('[class*="matchingActionStats"]');
  await expect.element(stats.nth(0)).toHaveTextContent("3 Actions at 1");
  await expect.element(stats.nth(1)).toHaveTextContent("5 Actions at 1");
  const exactRuleRow = page.getBySelector('[class*="stmRuleRowContainer"]').nth(0);
  await expect.element(exactRuleRow).toHaveTextContent("Observe");
  await expect.element(exactRuleRow).toHaveTextContent("Core");
  await expect.element(exactRuleRow).toHaveTextContent("Pristine");
  expect((await mission.read()).actions[actionIds[2]].enabled).toBe(false);
  expect((await mission.read()).stmRules[exactRuleUuid].count).toBe(2);

  await exactRuleRow.getBySelector('svg[data-icon="square-plus"]').click();
  await expect.poll(async () => (await mission.read()).stmRules[exactRuleUuid].count).toBe(3);
  await page.getByLabelText("reports Section", { exact: true }).click();
  await page.getByText("EVA STM Coverage", { exact: true }).click();
  const coverageCell = page.getBySelector('[data-tooltip-html^="Survey Alpha:"]');
  await expect
    .poll(() => coverageCell.element().getAttribute("data-tooltip-html"))
    .toMatch(/Survey Alpha: 6 matching actions, 1\/2 rules satisfied \(partially satisfied\)/);

  await page.getByLabelText("stmRules Section", { exact: true }).click();
  await page.getByText("Rules", { exact: true }).click();
  await page
    .getBySelector('[class*="stmRuleRowContainer"]')
    .nth(0)
    .getBySelector('svg[data-icon="square-minus"]')
    .click();
  await expect.poll(async () => (await mission.read()).stmRules[exactRuleUuid].count).toBe(2);
  await page.getByLabelText("reports Section", { exact: true }).click();
  await page.getByText("EVA STM Coverage", { exact: true }).click();
  await expect
    .poll(() => coverageCell.element().getAttribute("data-tooltip-html"))
    .toMatch(/Survey Alpha: 6 matching actions, 2\/2 rules satisfied \(all rules satisfied\)/);

  await page.getByLabelText("stmRules Section", { exact: true }).click();
  await page.getByText("Rules", { exact: true }).click();
  await page.getByLabelText("Add rule for 1A-1", { exact: true }).click();
  await expect.poll(async () => Object.keys((await mission.read()).stmRules).length).toBe(3);
  const emptyExactRuleUuid = Object.keys((await mission.read()).stmRules).find(
    (uuid) => uuid !== exactRuleUuid && uuid !== wildcardRuleUuid
  )!;
  const emptyExactRuleRow = page.getBySelector('[class*="stmRuleRowContainer"]').nth(2);
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
  await expect
    .element(emptyExactRuleRow.getBySelector('[class*="matchingActionStats"]'))
    .toHaveTextContent(exactText(""));
  await page.getByLabelText("reports Section", { exact: true }).click();
  await page.getByText("EVA STM Coverage", { exact: true }).click();
  await expect
    .poll(() => coverageCell.element().getAttribute("data-tooltip-html"))
    .toMatch(/Survey Alpha: 6 matching actions, 2\/3 rules satisfied \(partially satisfied\)/);
});
