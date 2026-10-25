import { test, expect } from "../fixtures/behavioralTest";
import {
  enablePlanningEditMode,
  planningField,
  savePlanningField,
  selectPlanningEva,
  selectPlanningStationActions,
} from "./planningHelpers";

const ids = {
  verb: "40000000-0000-4000-8000-000000000081",
  noun: "40000000-0000-4000-8000-000000000082",
  adjective: "40000000-0000-4000-8000-000000000083",
  priority: "40000000-0000-4000-8000-000000000084",
  level1: "40000000-0000-4000-8000-000000000085",
  level2: "40000000-0000-4000-8000-000000000086",
  level3: "40000000-0000-4000-8000-000000000087",
  rule: "40000000-0000-4000-8000-000000000088",
};

test("legacy action type, title, task priority and all STM priority choices persist without v2 fields", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.actionSystemVersion = 1;
    doc.stmLevel1s[ids.level1] = {
      uuid: ids.level1,
      name: "Science",
      numbering: "1",
      createdAt: 1,
      updatedAt: 1,
    };
    doc.stmLevel2s[ids.level2] = {
      uuid: ids.level2,
      name: "Samples",
      numbering: "a",
      level1Uuid: ids.level1,
      createdAt: 1,
      updatedAt: 1,
    };
    doc.stmLevel3s[ids.level3] = {
      uuid: ids.level3,
      name: "Known science target",
      numbering: "1",
      level2Uuid: ids.level2,
      createdAt: 1,
      updatedAt: 1,
    };
  });
  await mission.open(page);
  await enablePlanningEditMode(page);
  await selectPlanningStationActions(page, "Alpha station");
  await savePlanningField(page, "Action Name", "Collect legacy specimen");
  const action = page.getByRole("listitem").filter({
    has: planningField(page, "Action Name").filter({ hasText: "Collect legacy specimen" }),
  });
  await action.locator("select").selectOption("sample");
  await action.locator('svg[data-icon="caret-right"]').click();
  await savePlanningField(page, "Priority", "42");
  const stm = action.locator('[data-tooltip-content="STM Priority"]');
  for (const [label, expected] of [
    ["H", 1],
    ["M", 2],
    ["L", 3],
  ] as const) {
    await stm.getByText(label, { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].stmPriorities)
      .toEqual({ [ids.level3]: expected });
  }
  await stm.getByText("L", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).actions[mission.ids.actionA].stmPriorities)
    .toEqual({});
  await stm.getByText("H", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).actions[mission.ids.actionA].stmPriorities)
    .toEqual({ [ids.level3]: 1 });
  await expect(action.getByText("Non-STM", { exact: true })).toHaveCount(0);
  await expect(action.getByText("Mission Priority Identifier:", { exact: true })).toHaveCount(0);
  await mission.open(page);
  await selectPlanningStationActions(page, "Alpha station");
  await action.locator('svg[data-icon="caret-right"]').click();
  await expect(planningField(page, "Priority")).toHaveText("42");
  await expect(action).toContainText("sample");
  await expect(action.locator('[data-stm-uuid="' + ids.level3 + '"]')).toHaveCount(1);
  expect((await mission.read()).actions[mission.ids.actionA]).toMatchObject({
    name: "Collect legacy specimen",
    type: "sample",
    priority: 42,
    stmPriorities: { [ids.level3]: 1 },
  });
  await selectPlanningEva(page, "Survey Alpha");
  await page.getByLabel("actions_panel", { exact: true }).click();
  await expect(planningField(page, "Action Name")).toHaveText("Collect legacy specimen");
  await expect(page.locator('[class*="stmCoverage"]').first()).toBeVisible();
});

test("v2 action verb noun adjective and mission priority survive STM toggles and refresh aggregate wording", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.actionSystemVersion = 2;
    doc.actionDefinitions = {
      verbs: { [ids.verb]: { name: "Collect", abbr: "collect" } },
      nouns: { [ids.noun]: { name: "Core", abbr: "core" } },
      adjectives: { [ids.adjective]: { name: "Frozen", abbr: "frozen" } },
    };
    doc.missionPriorities = { [ids.priority]: { category: "Science", trace: "SCI-42" } };
    doc.stmLevel1s[ids.level1] = {
      uuid: ids.level1,
      name: "Science",
      numbering: "1",
      createdAt: 1,
      updatedAt: 1,
    };
    doc.stmLevel2s[ids.level2] = {
      uuid: ids.level2,
      name: "Samples",
      numbering: "a",
      level1Uuid: ids.level1,
      createdAt: 1,
      updatedAt: 1,
    };
    doc.stmLevel3s[ids.level3] = {
      uuid: ids.level3,
      name: "Known science target",
      numbering: "1",
      level2Uuid: ids.level2,
      createdAt: 1,
      updatedAt: 1,
    };
    doc.stmRules[ids.rule] = {
      uuid: ids.rule,
      stmUuid: ids.level3,
      verbUuids: [ids.verb],
      nounUuids: [ids.noun],
      adjectiveUuids: [ids.adjective],
      verbAny: false,
      nounAny: false,
      adjectiveAny: false,
      count: 1,
      createdAt: 1,
      updatedAt: 1,
    };
  });
  await mission.open(page);
  await enablePlanningEditMode(page);
  await selectPlanningStationActions(page, "Alpha station");
  await page.getByRole("listitem").locator('svg[data-icon="caret-right"]').click();
  await page.getByRole("listitem").getByText("STM", { exact: true }).click();
  for (const [placeholder, name] of [
    ["Verb", "Collect"],
    ["Noun", "Core"],
    ["Adjective", "Frozen"],
  ]) {
    await page.getByRole("listitem").getByText(placeholder, { exact: true }).first().click();
    await page.locator("dialog[open]").getByText(name, { exact: true }).click();
  }
  await page
    .getByText("Mission Priority Identifier:", { exact: true })
    .locator("../..")
    .getByLabel("dropdown", { exact: true })
    .selectOption(ids.priority);
  await expect
    .poll(async () => (await mission.read()).actions[mission.ids.actionA])
    .toMatchObject({
      stmAction: true,
      actionDefinition: { verbUuid: ids.verb, nounUuid: ids.noun, adjectiveUuid: ids.adjective },
      missionPriorityUuid: ids.priority,
    });
  await expect(planningField(page, "Priority")).toHaveCount(0);
  await expect(page.getByText("STM Coverage", { exact: true })).toHaveCount(0);
  await page.getByRole("listitem").getByText("Non-STM", { exact: true }).click();
  await savePlanningField(page, "Action Name", "Retained non-STM wording");
  await page.getByRole("listitem").getByText("STM", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).actions[mission.ids.actionA].stmAction)
    .toBe(true);
  const saved = (await mission.read()).actions[mission.ids.actionA];
  await mission.open(page);
  await selectPlanningStationActions(page, "Alpha station");
  await expect(page.getByRole("listitem")).toContainText("Collect");
  await expect(page.getByRole("listitem")).toContainText("Core");
  await expect(page.getByRole("listitem")).toContainText("Frozen");
  await expect(page.getByLabel("Mission priority: SCI-42", { exact: true })).toBeVisible();
  await selectPlanningEva(page, "Survey Alpha");
  await page.getByLabel("actions_panel", { exact: true }).click();
  for (const name of ["Collect", "Core", "Frozen"])
    await expect(page.getByRole("listitem").getByText(name, { exact: true }).first()).toBeVisible();
  await page.getByLabel("reports Section", { exact: true }).click();
  await page.getByText("EVA STM Coverage", { exact: true }).click();
  await expect(page.locator('[data-tooltip-html^="Survey Alpha:"]')).toHaveAttribute(
    "data-tooltip-html",
    /Survey Alpha: 1 matching actions, 1\/1 rules satisfied \(all rules satisfied\)/
  );
  expect((await mission.read()).actions[mission.ids.actionA]).toEqual(saved);
});
