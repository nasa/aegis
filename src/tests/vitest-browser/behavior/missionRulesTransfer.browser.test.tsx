import { vi } from "vitest";
import { test, expect } from "./missionHarness";

const level1 = "92000000-0000-4000-8000-000000000001";
const level2 = "92000000-0000-4000-8000-000000000002";
const level3 = "92000000-0000-4000-8000-000000000003";
const ruleId = "92000000-0000-4000-8000-000000000004";

test("mission rules export exact JSON, validate atomically, cancel replacement and import files with live report updates", async ({
  page,
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
  await mission.open();
  await page.getByLabelText("reports Section", { exact: true }).click();
  await page.getByText("EVA STM Coverage", { exact: true }).click();
  await page.getByLabelText("Diff", { exact: true }).click();
  const row = page
    .getByText("Any includes unset definitions", { exact: true })
    .getBySelector('xpath=ancestor::div[contains(@class,"gridCellLevel3Container")][1]');
  await expect
    .element(
      row.getBySelector('[data-tooltip-html*="1 matching actions, 1/1 rules satisfied"]').first()
    )
    .toBeVisible();
  await mission.navigate(`/admin/mission_stm/${mission.id}`);
  const download = await mission.captureDownload(() =>
    page.getByRole("button", { name: "Export Mission Rules to JSON", exact: true }).click()
  );
  expect(download.filename).toBe(`mission-${mission.id}-rules.json`);
  const exported = JSON.parse(await download.text());
  expect(exported).toEqual({
    version: 1,
    missionId: mission.id,
    missionName: before.name,
    stmRules: [rule],
  });
  const input = page.getByLabelText("Mission rules JSON", { exact: true });
  const submit = page.getByRole("button", { name: "Import Mission Rules", exact: true });
  for (const invalid of [
    "{",
    JSON.stringify({ version: 2, stmRules: [] }),
    JSON.stringify({ version: 1, stmRules: [{ ...rule, stmUuid: "missing" }] }),
    JSON.stringify({ version: 1, stmRules: [rule, rule] }),
    JSON.stringify({ version: 1, stmRules: [{ ...rule, count: 0 }] }),
  ]) {
    await input.fill(invalid);
    await submit.click();
    await expect.element(page.getByRole("alert")).toHaveTextContent("Importing mission rules");
    expect((await mission.read()).stmRules).toEqual(before.stmRules);
  }
  const replacement = { ...exported, stmRules: [{ ...rule, count: 2 }] };
  await input.fill(JSON.stringify(replacement));
  vi.spyOn(window, "confirm").mockImplementationOnce((message) => {
    expect(String(message)).toContain("Replace all 1 mission rules with 1 imported rules?");
    return false;
  });
  await submit.click();
  await expect.element(submit).toBeEnabled();
  expect((await mission.read()).stmRules).toEqual(before.stmRules);
  await page
    .getByLabelText("Load mission rules JSON")
    .upload(new File([JSON.stringify(replacement)], "rules.json", { type: "application/json" }));
  await expect.element(input).toHaveValue(JSON.stringify(replacement));
  vi.spyOn(window, "confirm").mockReturnValueOnce(true);
  await submit.click();
  await expect.element(page.getByRole("status")).toHaveTextContent("Imported 1 mission rules.");
  await expect.poll(async () => (await mission.read()).stmRules[ruleId].count).toBe(2);
  await mission.navigate(`/mission/${mission.id}`);
  await page.getByLabelText("reports Section", { exact: true }).click();
  await page.getByText("EVA STM Coverage", { exact: true }).click();
  await page.getByLabelText("Diff", { exact: true }).click();
  await expect
    .element(
      row.getBySelector('[data-tooltip-html*="1 matching actions, 0/1 rules satisfied"]').first()
    )
    .toBeVisible();
  await mission.open();
  expect((await mission.read()).stmRules).toEqual({ [ruleId]: { ...rule, count: 2 } });
  expect((await mission.read()).actions).toEqual(before.actions);
});
