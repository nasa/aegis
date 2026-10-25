import type { Browser, BrowserContext, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { enablePlanningEditMode } from "./planningHelpers";

const ids = {
  observe: "86000000-0000-4000-8000-000000000001",
  collect: "86000000-0000-4000-8000-000000000002",
  core: "86000000-0000-4000-8000-000000000003",
  pristine: "86000000-0000-4000-8000-000000000004",
  level1: "86000000-0000-4000-8000-000000000011",
  level2: "86000000-0000-4000-8000-000000000012",
  level3: "86000000-0000-4000-8000-000000000013",
  rule: "86000000-0000-4000-8000-000000000021",
} as const;

async function openRules(page: Page): Promise<void> {
  await page.getByLabel("stmRules Section", { exact: true }).click();
  await page.getByText("Rules", { exact: true }).click();
  await expect(page.getByText("Satisfaction Rules", { exact: true })).toBeVisible();
}

async function withEditorPeer(
  browser: Browser,
  context: BrowserContext,
  baseURL: string | undefined,
  mission: BehavioralMission,
  run: (peer: Page) => Promise<void>
): Promise<void> {
  const peerContext = await browser.newContext({
    storageState: await context.storageState(),
    baseURL,
    viewport: { width: 1960, height: 1080 },
  });
  const peer = await peerContext.newPage();
  const errors: string[] = [];
  peer.on("pageerror", (error) => errors.push(error.message));
  try {
    await mission.open(peer);
    await enablePlanningEditMode(peer);
    await openRules(peer);
    await run(peer);
    expect(errors, "The editing peer must not raise an uncaught error").toEqual([]);
  } finally {
    await peerContext.close();
  }
}

test("rule edits, deletion, and referenced definition cleanup converge across two editors", async ({
  page,
  browser,
  context,
  baseURL,
  mission,
}) => {
  await mission.change((doc) => {
    doc.actionSystemVersion = 2;
    doc.actionDefinitions = {
      verbs: {
        [ids.observe]: { name: "Observe", abbr: "observe" },
        [ids.collect]: { name: "Collect", abbr: "collect" },
      },
      nouns: { [ids.core]: { name: "Core", abbr: "core" } },
      adjectives: { [ids.pristine]: { name: "Pristine", abbr: "pristine" } },
    };
    doc.stmLevel1s[ids.level1] = {
      uuid: ids.level1,
      name: "Mission Science",
      numbering: "1",
      createdAt: 1,
      updatedAt: 1,
    };
    doc.stmLevel2s[ids.level2] = {
      uuid: ids.level2,
      name: "Sampling",
      numbering: "a",
      level1Uuid: ids.level1,
      createdAt: 1,
      updatedAt: 1,
    };
    doc.stmLevel3s[ids.level3] = {
      uuid: ids.level3,
      name: "Core recovery",
      numbering: "1",
      level2Uuid: ids.level2,
      createdAt: 1,
      updatedAt: 1,
    };
    doc.stmRules = {
      [ids.rule]: {
        uuid: ids.rule,
        stmUuid: ids.level3,
        count: 1,
        verbUuids: [ids.observe],
        nounUuids: [ids.core],
        adjectiveUuids: [ids.pristine],
        verbAny: false,
        nounAny: false,
        adjectiveAny: false,
        createdAt: 1,
        updatedAt: 1,
      },
    };
    doc.actions[mission.ids.actionA].stmAction = true;
    doc.actions[mission.ids.actionA].actionDefinition = {
      verbUuid: ids.observe,
      nounUuid: ids.core,
      adjectiveUuid: ids.pristine,
    };
  });

  await mission.open(page);
  await enablePlanningEditMode(page);
  await openRules(page);
  const ruleRow = page.locator('[class*="stmRuleRowContainer"]').first();
  await expect(ruleRow.getByText("Observe", { exact: true })).toBeVisible();

  await withEditorPeer(browser, context, baseURL, mission, async (peer) => {
    const peerRule = peer.locator('[class*="stmRuleRowContainer"]').first();
    await expect(peerRule.getByText("Observe", { exact: true })).toBeVisible();

    // Edit one rule field and verify the other editor receives the persisted value.
    await ruleRow.getByText("Observe", { exact: true }).click();
    const verbItems = ruleRow.locator('[class*="multiselectDropdownItems"]');
    await verbItems.getByText("Collect", { exact: true }).click();
    await verbItems.getByText("Observe", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).stmRules[ids.rule].verbUuids)
      .toEqual([ids.collect]);
    await expect(peerRule.getByText("Collect", { exact: true })).toBeVisible();

    // The action still uses Observe, so the edited Collect rule has no matching action.
    await page.getByLabel("viewRuleMatches", { exact: true }).click();
    await expect(
      page.getByText(
        "Actions that satisfy this rule in as-planned stations outside the selected Executions",
        {
          exact: true,
        }
      )
    ).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Sample regolith" })).toHaveCount(0);

    // Delete from the peer while this client has the rule selected in the Matches tab.
    peer.once("dialog", (dialog) => dialog.accept());
    await peer.getByLabel("deleteRule", { exact: true }).click();
    await expect.poll(async () => (await mission.read()).stmRules[ids.rule]).toBeUndefined();
    await expect(
      page.getByText("No rules defined for this investigation.", { exact: true })
    ).toBeVisible();
    await expect(page.getByText("Collect", { exact: true })).toHaveCount(0);

    // With the rule removed and no action referencing Collect, remove the now-unreferenced definition.
    await peer.getByLabel("mission Section", { exact: true }).click();
    await peer.getByLabel("actionDefinitions_panel", { exact: true }).click();
    const collectRow = peer
      .getByLabel("actionDefs-item", { exact: true })
      .filter({ hasText: "Collect" });
    await expect(collectRow).toHaveCount(1);
    await collectRow.getByLabel("deleteButton", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).actionDefinitions.verbs[ids.collect])
      .toBeUndefined();
    await expect(
      page.getByText("No rules defined for this investigation.", { exact: true })
    ).toBeVisible();
  });

  const final = await mission.read();
  expect(final.stmRules[ids.rule]).toBeUndefined();
  expect(final.actionDefinitions.verbs).toEqual({
    [ids.observe]: { name: "Observe", abbr: "observe" },
  });
  expect(final.actions[mission.ids.actionA].actionDefinition).toEqual({
    verbUuid: ids.observe,
    nounUuid: ids.core,
    adjectiveUuid: ids.pristine,
  });
  expect(final.stmLevel3s[ids.level3].level2Uuid).toBe(ids.level2);
});
