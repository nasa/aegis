import { readFile } from "node:fs/promises";
import { test, expect } from "../fixtures/behavioralTest";

const level1 = "92000000-0000-4000-8000-000000000001";
const level2 = "92000000-0000-4000-8000-000000000002";
const level3 = "92000000-0000-4000-8000-000000000003";
const ruleId = "92000000-0000-4000-8000-000000000004";

test("mission rules deliver an actual JSON download and imported rules reach a live peer and server reload", async ({
  page,
  context,
  mission,
}) => {
  const rule: STMRule = {
    uuid: ruleId,
    stmUuid: level3,
    count: 1,
    verbUuids: [],
    nounUuids: [],
    adjectiveUuids: [],
    verbAny: true,
    nounAny: true,
    adjectiveAny: true,
    createdAt: 1,
    updatedAt: 1,
  };
  await mission.change((doc) => {
    doc.actionSystemVersion = 2;
    doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
    doc.stmLevel1s[level1] = {
      uuid: level1,
      name: "Science",
      numbering: "1",
      createdAt: 1,
      updatedAt: 1,
    };
    doc.stmLevel2s[level2] = {
      uuid: level2,
      level1Uuid: level1,
      name: "Samples",
      numbering: "a",
      createdAt: 1,
      updatedAt: 1,
    };
    doc.stmLevel3s[level3] = {
      uuid: level3,
      level2Uuid: level2,
      name: "Any includes unset definitions",
      numbering: "1",
      createdAt: 1,
      updatedAt: 1,
    };
    doc.stmRules = { [ruleId]: rule };
    doc.actions[mission.ids.actionA].stmAction = true;
    doc.actions[mission.ids.actionA].actionDefinition = null;
  });
  const before = await mission.read();
  const peer = await context.newPage();
  await mission.open(peer);
  await peer.getByLabel("reports Section", { exact: true }).click();
  await peer.getByText("EVA STM Coverage", { exact: true }).click();
  await peer.getByLabel("Diff", { exact: true }).click();
  const row = peer
    .getByText("Any includes unset definitions", { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"gridCellLevel3Container")][1]');
  await expect(
    row.locator('[data-tooltip-html*="1 matching actions, 1/1 rules satisfied"]').first()
  ).toBeVisible();
  await page.goto(`/admin/mission_stm/${mission.id}`);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Mission Rules to JSON", exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe(`mission-${mission.id}-rules.json`);
  const exported = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(exported).toEqual({
    version: 1,
    missionId: mission.id,
    missionName: before.name,
    stmRules: [rule],
  });
  const input = page.getByLabel("Mission rules JSON", { exact: true });
  const submit = page.getByRole("button", { name: "Import Mission Rules", exact: true });
  const replacement = { ...exported, stmRules: [{ ...rule, count: 2 }] };
  await page.getByLabel("Load mission rules JSON").setInputFiles({
    name: "rules.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(replacement)),
  });
  await expect(input).toHaveValue(JSON.stringify(replacement));
  page.once("dialog", (dialog) => dialog.accept());
  await submit.click();
  await expect(page.getByRole("status")).toContainText("Imported 1 mission rules.");
  await expect.poll(async () => (await mission.read()).stmRules[ruleId].count).toBe(2);
  await expect(
    row.locator('[data-tooltip-html*="1 matching actions, 0/1 rules satisfied"]').first()
  ).toBeVisible();
  await page.reload();
  expect((await mission.read()).stmRules).toEqual({ [ruleId]: { ...rule, count: 2 } });
  expect((await mission.read()).actions).toEqual(before.actions);
});
