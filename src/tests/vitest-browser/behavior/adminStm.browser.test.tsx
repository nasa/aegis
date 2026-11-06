import { vi } from "vitest";
import { test, expect } from "./missionHarness";
import { exactText } from "./browserAssertions";
test("admin STM import validates hierarchy references and preserves the existing tree on invalid input for v1 and v2", async ({
  page,
  mission,
}) => {
  const priorLevel1: STMLevel1 = {
    uuid: crypto.randomUUID(),
    name: "Prior science goal",
    numbering: "P",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const priorLevel2: STMLevel2 = {
    ...priorLevel1,
    uuid: crypto.randomUUID(),
    name: "Prior objective",
    level1Uuid: priorLevel1.uuid,
  };
  const priorLevel3: STMLevel3 = {
    ...priorLevel1,
    uuid: crypto.randomUUID(),
    name: "Prior measurement",
    level2Uuid: priorLevel2.uuid,
  };
  const priorRule: STMRule = {
    uuid: crypto.randomUUID(),
    stmUuid: priorLevel3.uuid,
    count: 1,
    verbUuids: [],
    nounUuids: [],
    adjectiveUuids: [],
    verbAny: true,
    nounAny: true,
    adjectiveAny: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const restorePriorTree = (doc: Mission) => {
    doc.stmLevel1s = { [priorLevel1.uuid]: priorLevel1 };
    doc.stmLevel2s = { [priorLevel2.uuid]: priorLevel2 };
    doc.stmLevel3s = { [priorLevel3.uuid]: priorLevel3 };
    doc.stmRules = { [priorRule.uuid]: priorRule };
    doc.actions[mission.ids.actionA].stmPriorities = { [priorLevel3.uuid]: 1 };
  };
  const expectPriorTree = async () => {
    const current = await mission.read();
    expect(current.stmLevel1s).toEqual({ [priorLevel1.uuid]: priorLevel1 });
    expect(current.stmLevel2s).toEqual({ [priorLevel2.uuid]: priorLevel2 });
    expect(current.stmLevel3s).toEqual({ [priorLevel3.uuid]: priorLevel3 });
    expect(current.stmRules).toEqual({ [priorRule.uuid]: priorRule });
    expect(current.actions[mission.ids.actionA].stmPriorities).toEqual({ [priorLevel3.uuid]: 1 });
  };
  await mission.change(restorePriorTree);
  await mission.open({ path: `/admin/mission_stm/${mission.id}`, waitForReady: false });
  const importField = page.getByPlaceholder("paste STM json to import here", { exact: true });
  const importButton = page.getByRole("button", { name: "Import STM", exact: true });

  for (const actionSystemVersion of [1, 2]) {
    await mission.change((doc) => {
      doc.actionSystemVersion = actionSystemVersion;
    });
    await expect
      .poll(async () => (await mission.read()).actionSystemVersion)
      .toBe(actionSystemVersion);

    await importField.fill("{");
    await importButton.click();
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent(exactText("Invalid STM JSON. Check that the file contains valid JSON."));
    await expectPriorTree();

    const orphanedTree = {
      level1s: [] as STMLevel1[],
      level2s: [] as STMLevel2[],
      level3s: [
        {
          uuid: crypto.randomUUID(),
          name: "Orphaned instrument trace",
          numbering: "1",
          level2Uuid: crypto.randomUUID(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    };
    await importField.fill(JSON.stringify(orphanedTree));
    await importButton.click();
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent(exactText("STM level3s contains a reference to a missing level2."));
    await expectPriorTree();

    const sourceIds = {
      level1: crypto.randomUUID(),
      level2: crypto.randomUUID(),
      level3: crypto.randomUUID(),
    };
    const validTree = {
      level1s: [
        { uuid: sourceIds.level1, name: `Science goal v${actionSystemVersion}`, numbering: "1" },
      ],
      level2s: [
        {
          uuid: sourceIds.level2,
          name: "Instrument objectives",
          numbering: "a",
          level1Uuid: sourceIds.level1,
        },
      ],
      level3s: [
        {
          uuid: sourceIds.level3,
          name: "Measure samples",
          numbering: "1",
          level2Uuid: sourceIds.level2,
        },
      ],
    };
    await importField.fill(JSON.stringify(validTree));
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    await importButton.click();
    await expect
      .poll(async () => {
        const current = await mission.read();
        return [
          Object.keys(current.stmLevel1s ?? {}).length,
          Object.keys(current.stmLevel2s ?? {}).length,
          Object.keys(current.stmLevel3s ?? {}).length,
        ];
      })
      .toEqual([1, 1, 1]);
    const imported = await mission.read();
    const [level1] = Object.values(imported.stmLevel1s ?? {});
    const [level2] = Object.values(imported.stmLevel2s ?? {});
    const [level3] = Object.values(imported.stmLevel3s ?? {});
    expect(level1).toMatchObject({ name: `Science goal v${actionSystemVersion}`, numbering: "1" });
    expect(level2).toMatchObject({
      name: "Instrument objectives",
      numbering: "a",
      level1Uuid: level1.uuid,
    });
    expect(level3).toMatchObject({
      name: "Measure samples",
      numbering: "1",
      level2Uuid: level2.uuid,
    });
    expect([level1.uuid, level2.uuid, level3.uuid]).not.toContain(sourceIds.level1);
    expect([level1.uuid, level2.uuid, level3.uuid]).not.toContain(sourceIds.level2);
    expect([level1.uuid, level2.uuid, level3.uuid]).not.toContain(sourceIds.level3);
    expect(imported.stmRules).toEqual({});
    expect(imported.actions[mission.ids.actionA].stmPriorities).toEqual({});
    await expect.element(importField).toHaveValue("");
    await mission.change(restorePriorTree);
  }
});

test("v2 STM edits honor referenced rules and import validation preserves or clears dependent references atomically", async ({
  page,
  mission,
}) => {
  const ids = {
    level1: crypto.randomUUID(),
    level2: crypto.randomUUID(),
    level3: crypto.randomUUID(),
    rule: crypto.randomUUID(),
  };
  const now = Date.now();
  await mission.change((doc) => {
    doc.actionSystemVersion = 2;
    doc.stmLevel1Enabled = true;
    doc.stmLevel1s = {
      [ids.level1]: {
        uuid: ids.level1,
        name: "Referenced goal",
        numbering: "1",
        createdAt: now,
        updatedAt: now,
      },
    };
    doc.stmLevel2s = {
      [ids.level2]: {
        uuid: ids.level2,
        name: "Referenced objective",
        numbering: "a",
        level1Uuid: ids.level1,
        createdAt: now,
        updatedAt: now,
      },
    };
    doc.stmLevel3s = {
      [ids.level3]: {
        uuid: ids.level3,
        name: "Referenced trace",
        numbering: "1",
        level2Uuid: ids.level2,
        createdAt: now,
        updatedAt: now,
      },
    };
    doc.stmRules = {
      [ids.rule]: {
        uuid: ids.rule,
        stmUuid: ids.level3,
        count: 1,
        verbUuids: Object.keys(doc.actionDefinitions?.verbs ?? {}).slice(0, 1),
        nounUuids: [],
        adjectiveUuids: [],
        verbAny: false,
        nounAny: true,
        adjectiveAny: true,
        createdAt: now,
        updatedAt: now,
      },
    };
    for (const action of Object.values(doc.actions)) action.stmPriorities = { [ids.level3]: 1 };
  });
  await mission.open({ path: `/admin/mission_stm/${mission.id}`, waitForReady: false });
  const trace = page
    .getBySelector("li")
    .filter({ has: page.getByText(/1: Referenced trace$/, { exact: false }) })
    .last();
  await trace.getByRole("button", { name: "Edit", exact: true }).click();
  const editedRow = page
    .getBySelector("li")
    .filter({ has: page.getBySelector("#editLevel1Name") })
    .last();
  await editedRow.getBySelector("#editLevel1Name").fill("Edited referenced trace");
  await editedRow.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).stmLevel3s[ids.level3].name)
    .toBe("Edited referenced trace");
  const editedTrace = page
    .getBySelector("li")
    .filter({ has: page.getByText(/1: Edited referenced trace$/, { exact: false }) })
    .last();
  const dialogs: string[] = [];
  vi.spyOn(window, "alert").mockImplementation((message) => dialogs.push(String(message)));
  vi.spyOn(window, "confirm").mockImplementation((message) => {
    dialogs.push(String(message));
    return true;
  });
  await editedTrace.getByRole("button", { name: "Delete", exact: true }).click();
  await expect
    .poll(() => dialogs.some((message) => message.includes("STM has a rule assigned")))
    .toBe(true);
  const snapshot = await mission.read();
  expect(snapshot.stmRules[ids.rule].stmUuid).toBe(ids.level3);
  const input = page.getByPlaceholder("paste STM json to import here", { exact: true });
  await input.fill(
    JSON.stringify({
      level1s: [],
      level2s: [{ uuid: "orphan", name: "Bad parent", numbering: "a", level1Uuid: "missing" }],
      level3s: [],
    })
  );
  await page.getByRole("button", { name: "Import STM", exact: true }).click();
  await expect
    .element(page.getByRole("alert"))
    .toHaveTextContent(exactText("STM level2s contains a reference to a missing level1."));
  const invalid = await mission.read();
  expect(invalid.stmRules).toEqual(snapshot.stmRules);
  expect(invalid.stmLevel3s).toEqual(snapshot.stmLevel3s);
  expect(invalid.actions).toEqual(snapshot.actions);
  await input.fill(
    JSON.stringify({
      level1s: [{ uuid: "new-goal", name: "Replacement", numbering: "2" }],
      level2s: [],
      level3s: [],
    })
  );
  await page.getByRole("button", { name: "Import STM", exact: true }).click();
  await expect
    .poll(async () => Object.values((await mission.read()).stmLevel1s).map((item) => item.name))
    .toEqual(["Replacement"]);
  const imported = await mission.read();
  expect(imported.stmRules).toEqual({});
  for (const action of Object.values(imported.actions)) expect(action.stmPriorities).toEqual({});
  await mission.open({ path: `/admin/mission_stm/${mission.id}`, waitForReady: false });
  await expect.element(page.getByText("Goal 2: Replacement", { exact: true })).toBeVisible();
});
