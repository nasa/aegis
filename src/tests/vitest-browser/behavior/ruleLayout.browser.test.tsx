import { commands } from "vitest/browser";
import type { Locator, BrowserPage } from "vitest/browser";
import { test, expect } from "./missionHarness";

async function openRules(page: BrowserPage) {
  await page.getByLabelText("stmRules Section", { exact: true }).click();
  await page.getByText("Rules", { exact: true }).click();
  await expect.element(page.getByText("Satisfaction Rules", { exact: true })).toBeVisible();
  await document.fonts.ready;
}
function widths(row: Locator) {
  return ["Verb", "Noun", "Adjective"].map(
    (type) =>
      row.getBySelector(`[class*="stmRuleSetContainer${type}"]`).element().getBoundingClientRect()
        .width
  );
}
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

test("rule columns resist resizing/reordering and tier layout resets on remount without document edits", async ({
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

  await mission.open();
  await openRules(page);
  const rows = page.getBySelector('[class*="stmRuleRowContainer"]');
  await expect.poll(() => rows.length).toBe(2);
  const first = rows.nth(0);
  const second = rows.nth(1);
  const assertLabels = async () => {
    await expect
      .element(first.getByText("Observe Geological Strata", { exact: true }))
      .toBeVisible();
    await expect.element(first.getByText("Core", { exact: true })).toBeVisible();
    await expect
      .element(second.getByText("Collect Microscopic Mineral Grains", { exact: true }))
      .toBeVisible();
    await expect
      .element(second.getByText("Layered volcanic deposits", { exact: true }))
      .toBeVisible();
  };
  await assertLabels();
  const initial = widths(first);
  expect(initial.every((width) => width > 0)).toBe(true);
  expect(widths(second)).toEqual(initial);
  const order = Array.from(
    first.getBySelector('[class*="stmRuleContainer"]').element().children
  ).map((node) => node.className);
  const indices = ["Verb", "Noun", "Adjective"].map((type) =>
    order.findIndex((name) => name.includes(`stmRuleSetContainer${type}`))
  );
  expect(indices[0]).toBeGreaterThan(-1);
  expect(indices[1]).toBeGreaterThan(indices[0]);
  expect(indices[2]).toBeGreaterThan(indices[1]);
  await expect.poll(() => rows.getBySelector('[draggable="true"]').length).toBe(0);
  await expect.poll(() => rows.getBySelector('[aria-label*="resize" i]').length).toBe(0);
  const verb = first.getBySelector('[class*="stmRuleSetContainerVerb"]');
  const adjective = first.getBySelector('[class*="stmRuleSetContainerAdjective"]');
  const box = verb.element().getBoundingClientRect();
  await commands.mapPointer("move", box.right, box.top + box.height / 2);
  await commands.mapPointer("down");
  await commands.mapPointer("move", box.right + 55, box.top + box.height / 2, 8);
  await commands.mapPointer("up");
  await verb.dropTo(adjective);
  expect(widths(first)).toEqual(initial);
  await assertLabels();
  for (const tier of ["Objective", "Goal"])
    await page.getBySelector(`[data-tooltip-html="Collapse ${tier} column"]`).click();
  await page.getByText("Rule Matches", { exact: true }).click();
  await expect.element(page.getByText("Rule Matches", { exact: true })).toHaveClass(/tabActive/);
  await page.getByText("Rules", { exact: true }).click();
  for (const tier of ["Objective", "Goal"])
    await expect
      .element(page.getBySelector(`[data-tooltip-html="Expand ${tier} column"]`))
      .toBeVisible();
  expect(widths(first)).toEqual(initial);
  await mission.open();
  await openRules(page);
  for (const tier of ["Objective", "Goal"])
    await expect
      .element(page.getBySelector(`[data-tooltip-html="Collapse ${tier} column"]`))
      .toBeVisible();
  await expect.poll(() => rows.length).toBe(2);
  await assertLabels();
  await expect.poll(() => widths(first)).toEqual(initial);
  const after = await mission.read();
  expect({
    actionDefinitions: after.actionDefinitions,
    stmLevel1s: after.stmLevel1s,
    stmLevel2s: after.stmLevel2s,
    stmLevel3s: after.stmLevel3s,
    stmRules: after.stmRules,
  }).toEqual(semanticSnapshot);
});
