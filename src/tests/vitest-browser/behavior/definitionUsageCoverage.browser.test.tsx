import { vi } from "vitest";
import { v4 as randomUUID } from "uuid";
import type { BrowserPage as Page } from "vitest/browser";
import { test, expect } from "./missionHarness";
import {
  enablePlanningEditMode,
  planningEvaRow,
  selectPlanningEva,
  selectPlanningPoi,
  selectPlanningStationActions,
} from "./planningHelpers";

test("each definition category blocks all action parents, templates and rules until every live reference is removed", async ({
  page,
  mission,
}) => {
  const ids = {
    verb: randomUUID(),
    noun: randomUUID(),
    adjective: randomUUID(),
    poiAction: randomUUID(),
    traverseAction: randomUUID(),
    template: randomUUID(),
    rule: randomUUID(),
    level1: randomUUID(),
    level2: randomUUID(),
    level3: randomUUID(),
  };
  const initial = await mission.read();
  await mission.change((doc) => {
    doc.actionSystemVersion = 2;
    doc.actionDefinitions = {
      verbs: { [ids.verb]: { name: "Collect", abbr: "collect" } },
      nouns: { [ids.noun]: { name: "Core", abbr: "core" } },
      adjectives: { [ids.adjective]: { name: "Frozen", abbr: "frozen" } },
    };
    const definition = { verbUuid: ids.verb, nounUuid: ids.noun, adjectiveUuid: ids.adjective };
    for (const [uuid, parent] of [
      [mission.ids.actionA, "station"],
      [ids.poiAction, "poi"],
      [ids.traverseAction, "traverse"],
    ]) {
      doc.actions[uuid] = {
        ...initial.actions[mission.ids.actionA],
        uuid,
        refUuid: randomUUID(),
        stmAction: true,
        actionDefinition: definition,
        poiUuid: parent === "poi" ? mission.ids.poiA : null,
        stationUuid: parent === "station" ? mission.ids.stationA : null,
        traverseUuid: parent === "traverse" ? mission.ids.traverseA : null,
      };
    }
    doc.pois[mission.ids.poiA].actionOrderUuids = [ids.poiAction];
    doc.traverses[mission.ids.traverseA].actionOrderUuids = [ids.traverseAction];
    const {
      uuid: _uuid,
      refUuid: _refUuid,
      poiUuid: _poi,
      stationUuid: _station,
      traverseUuid: _traverse,
      parentActionUuid: _parent,
      parentCopyDate: _date,
      location: _location,
      elevation: _elevation,
      enabled: _enabled,
      ...content
    } = initial.actions[mission.ids.actionA];
    doc.actionTemplates[ids.template] = {
      ...content,
      templateName: "Referenced template",
      name: "Referenced template",
      stmAction: true,
      actionDefinition: definition,
    };
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
      name: "Known target",
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
  const arranged = await mission.read();
  await mission.open();
  await enablePlanningEditMode(page);
  const openDefinitions = async (client: Page) => {
    await client.getByLabelText("mission Section", { exact: true }).click();
    await client.getByLabelText("actionDefinitions_panel", { exact: true }).click();
  };
  await openDefinitions(page);
  for (const name of ["Collect", "Core", "Frozen"]) {
    vi.spyOn(window, "alert").mockImplementationOnce((message) => {
      for (const expected of [
        "Action in Station: Alpha station",
        "Action in POI: Reference POI",
        "Action in Traverse: Alpha to Bravo",
        "Rule in STM Item: 1a1",
        "Action Template: Referenced template",
      ])
        expect(String(message)).toContain(expected);

      return true;
    });
    await page
      .getByLabelText("actionDefs-item", { exact: true })
      .filter({ hasText: name })
      .getByLabelText("deleteButton", { exact: true })
      .click();
  }
  expect((await mission.read()).actionDefinitions).toEqual(arranged.actionDefinitions);
  for (const parent of ["station", "poi", "traverse"]) {
    if (parent === "station") await selectPlanningStationActions(page, "Alpha station");
    else if (parent === "poi") {
      await selectPlanningPoi(page, "Reference POI");
      await page.getByLabelText("actions_panel", { exact: true }).click();
    } else {
      await selectPlanningEva(page, "Survey Alpha");
      await planningEvaRow(page, "Survey Alpha")
        .getByText("Alpha to Bravo", { exact: true })
        .click();
      await page.getByLabelText("actions_panel", { exact: true }).click();
    }
    await page.getByRole("listitem").getBySelector('svg[data-icon="ellipsis-vertical"]').click();
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    await page.getBySelector("dialog[open]").getByText("Delete Action", { exact: true }).click();
    await expect.poll(() => page.getByRole("listitem").length).toBe(0);
  }
  await openDefinitions(page);
  for (const name of ["Collect", "Core", "Frozen"]) {
    vi.spyOn(window, "alert").mockImplementationOnce((message) => {
      expect(String(message)).toContain("Rule in STM Item: 1a1");
      expect(String(message)).toContain("Action Template: Referenced template");
      expect(String(message)).not.toContain("Action in ");

      return true;
    });
    await page
      .getByLabelText("actionDefs-item", { exact: true })
      .filter({ hasText: name })
      .getByLabelText("deleteButton", { exact: true })
      .click();
  }
  await page.getByLabelText("actionTemplate_panel", { exact: true }).click();
  await page
    .getByLabelText("templateList-item", { exact: true })
    .getByLabelText("Template Menu", { exact: true })
    .click();
  vi.spyOn(window, "confirm").mockReturnValueOnce(true);
  await page.getBySelector("dialog[open]").getByLabelText("Delete", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).actionTemplates[ids.template])
    .toBeUndefined();
  await page.getByLabelText("stmRules Section", { exact: true }).click();
  await page.getByText("Rules", { exact: true }).click();
  vi.spyOn(window, "confirm").mockReturnValueOnce(true);
  await page.getByLabelText("deleteRule", { exact: true }).click();
  await expect.poll(async () => (await mission.read()).stmRules[ids.rule]).toBeUndefined();
  await openDefinitions(page);
  for (const name of ["Collect", "Core", "Frozen"])
    await page
      .getByLabelText("actionDefs-item", { exact: true })
      .filter({ hasText: name })
      .getByLabelText("deleteButton", { exact: true })
      .click();
  await expect
    .poll(async () => (await mission.read()).actionDefinitions)
    .toEqual({ verbs: {}, nouns: {}, adjectives: {} });
  await mission.open();
  await openDefinitions(page);
  await expect.poll(() => page.getByLabelText("actionDefs-item", { exact: true }).length).toBe(0);
});
