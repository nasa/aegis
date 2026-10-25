import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import {
  choosePlanningEvaAction,
  enablePlanningEditMode,
  planningEvaRow,
  selectPlanningEva,
  selectPlanningStation,
} from "./planningHelpers";
import { openExecutionInfo, selectExecution } from "./executionHelpers";

const sourceActionUuid = "30000000-0000-4000-8000-000000000091";
const duplicateEvaName = "Survey Alpha (copy 1)";

async function openPoiTraceability(page: Page): Promise<void> {
  await page.getByLabel("reports Section", { exact: true }).click();
  await page.getByText("POI Traceability", { exact: true }).click();
  await expect(page.getByRole("region", { name: "Reference POI action trace" })).toBeVisible();
}

async function linkPoiToStation(page: Page, stationName: string, poiUuid: string): Promise<void> {
  await selectPlanningStation(page, stationName);
  await page.getByLabel("poi_panel", { exact: true }).click();
  await expect(page.locator(`input[id="${poiUuid}"]`)).toBeVisible();
  await page.locator(`input[id="${poiUuid}"]`).check();
}

async function adoptSourceAction(page: Page, stationName: string): Promise<void> {
  await selectPlanningStation(page, stationName);
  await page.getByLabel("actions_panel", { exact: true }).click();
  await expect(page.getByText("Station Actions", { exact: true })).toBeVisible();
  const poiActions = page.locator('[class*="stationPoiSection"]');
  if (!(await poiActions.isVisible()))
    await page.getByText("Associated POI Actions", { exact: true }).click();
  await expect(poiActions.getByText("Reference POI", { exact: true })).toBeVisible();
  const copyAction = poiActions.locator('[data-tooltip-content="Copy this action to station"]');
  await expect(copyAction).toHaveCount(1);
  await copyAction.click();
}

test("POI lineage distinguishes links, station adoptions, and a duplicated execution by UUID", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.actionSystemVersion = 2;
    doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
    const source: Action = JSON.parse(JSON.stringify(doc.actions[mission.ids.actionA]));
    source.uuid = sourceActionUuid;
    source.refUuid = sourceActionUuid;
    source.stationUuid = null;
    source.poiUuid = mission.ids.poiA;
    source.parentActionUuid = null;
    source.parentCopyDate = null;
    doc.actions[sourceActionUuid] = source;
    delete doc.actions[mission.ids.actionA];
    doc.stations[mission.ids.stationA].actionOrderUuids = [];
    doc.stations[mission.ids.stationA].poiUuids = [];
    doc.stations[mission.ids.stationB].poiUuids = [mission.ids.poiA];
    doc.pois[mission.ids.poiA].actionOrderUuids = [sourceActionUuid];
  });

  await mission.open(page);
  await enablePlanningEditMode(page);
  await linkPoiToStation(page, "Alpha station", mission.ids.poiA);

  // A station/POI association is visible in the report but cannot manufacture an adoption.
  await openPoiTraceability(page);
  const actionRow = page.getByRole("button", { name: /Sample regolith.*Not adopted/ });
  await expect(actionRow).toBeVisible();
  await expect(page.getByText("No adoption in this scope", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Linking a POI to a station alone does not adopt its actions.", { exact: true })
  ).toBeVisible();
  const linkedOnly = await mission.read();
  expect(linkedOnly.actions[sourceActionUuid]).toMatchObject({
    uuid: sourceActionUuid,
    poiUuid: mission.ids.poiA,
    stationUuid: null,
    parentActionUuid: null,
  });
  expect(linkedOnly.stations[mission.ids.stationA].poiUuids).toEqual([mission.ids.poiA]);
  expect(linkedOnly.stations[mission.ids.stationA].actionOrderUuids).toEqual([]);

  await adoptSourceAction(page, "Alpha station");
  await adoptSourceAction(page, "Bravo station");
  let current = await mission.read();
  const originalAdoptions = Object.values(current.actions).filter(
    (action) => action.parentActionUuid === sourceActionUuid
  );
  expect(originalAdoptions).toHaveLength(2);
  expect(originalAdoptions.map((action) => action.stationUuid).sort()).toEqual(
    [mission.ids.stationA, mission.ids.stationB].sort()
  );
  expect(new Set(originalAdoptions.map((action) => action.uuid)).size).toBe(2);
  expect(new Set(originalAdoptions.map((action) => action.refUuid)).size).toBe(2);
  await openPoiTraceability(page);
  // The Bravo station is shared by Survey Alpha and Survey Bravo, so two distinct
  // station copies correctly produce three plan-location branches.
  await expect(page.getByRole("button", { name: /Sample regolith.*3 adoptions/ })).toBeVisible();
  await expect(
    page.locator('[class*="location"]').filter({ hasText: "Alpha station" })
  ).toHaveCount(1);
  await expect(
    page.locator('[class*="location"]').filter({ hasText: "Bravo station" })
  ).toHaveCount(2);

  // Duplicate the complete planned graph so the copied stations/actions have new concrete UUIDs.
  await page.getByLabel("evas Section", { exact: true }).click();
  await selectPlanningEva(page, "Survey Alpha");
  let confirmationMessage = "";
  page.once("dialog", async (dialog) => {
    confirmationMessage = dialog.message();
    await dialog.accept();
  });
  await choosePlanningEvaAction(page, "Survey Alpha", "Duplicate w/ Stations");
  expect(confirmationMessage).toContain("duplicate the EVA and also make duplicates");
  await expect(planningEvaRow(page, duplicateEvaName)).toHaveCount(1);
  current = await mission.read();
  const duplicateEva = Object.values(current.evas).find((eva) => eva.name === duplicateEvaName);
  expect(duplicateEva).toBeDefined();
  expect(duplicateEva!.uuid).not.toBe(mission.ids.evaA);
  const duplicateStationUuids = duplicateEva!.sequence
    .filter((item) => item.type === "station")
    .map((item) => item.uuid)
    .filter((uuid) => uuid !== mission.ids.egressA && uuid !== mission.ids.ingressA);
  const duplicateActions = Object.values(current.actions).filter(
    (action) =>
      action.parentActionUuid === sourceActionUuid &&
      action.stationUuid != null &&
      duplicateStationUuids.includes(action.stationUuid)
  );
  expect(duplicateActions).toHaveLength(2);
  expect(duplicateActions.map((action) => action.refUuid)).not.toEqual(
    expect.arrayContaining(originalAdoptions.map((action) => action.refUuid))
  );

  await choosePlanningEvaAction(page, duplicateEvaName, "Add REX");
  await expect
    .poll(
      async () =>
        Object.values((await mission.read()).rexes).filter(
          (rex) => rex.evaUuid !== mission.ids.rexEvaA && rex.evaUuid !== mission.ids.rexEvaB
        ).length
    )
    .toBe(1);
  current = await mission.read();
  const duplicateRex = Object.values(current.rexes).find(
    (rex) => rex.evaUuid !== mission.ids.rexEvaA && rex.evaUuid !== mission.ids.rexEvaB
  );
  expect(duplicateRex).toBeDefined();
  const executionStationUuids = current.evas[duplicateRex!.evaUuid].sequence
    .filter((item) => item.type === "station")
    .map((item) => item.uuid);
  const executionActions = Object.values(current.actions).filter(
    (action) =>
      action.parentActionUuid === sourceActionUuid &&
      action.stationUuid &&
      executionStationUuids.includes(action.stationUuid)
  );
  expect(executionActions).toHaveLength(2);
  const completedAction = executionActions[0];
  await openExecutionInfo(page, duplicateEvaName, duplicateRex!.evaUuid);
  await page.getByLabel("Execute EVA", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).rexes[duplicateRex!.uuid].isRunning)
    .toBe(true);
  const executionRow = await selectExecution(page, duplicateEvaName, duplicateRex!.evaUuid);
  const completedStation = current.stations[completedAction.stationUuid!].name;
  await executionRow
    .locator('[class*="evaItem"]')
    .filter({ hasText: completedStation })
    .locator('[class*="iconCustom"]')
    .click();
  await page.getByLabel("actions_panel", { exact: true }).click();
  const rexActionRow = page.getByRole("listitem").filter({ hasText: completedAction.name });
  await expect(rexActionRow).toHaveCount(1);
  await rexActionRow.locator('[class*="actionHeadingRexStatusWrapper"]').click();
  await page.locator("dialog[open]").getByText("Complete", { exact: true }).click();
  await expect
    .poll(
      async () =>
        (await mission.read()).rexes[duplicateRex!.uuid].actionEntries?.[completedAction.uuid]
          ?.rexStatus
    )
    .toBe("complete");

  await openPoiTraceability(page);
  const trace = page.getByRole("region", { name: "Reference POI action trace" });
  await expect(
    trace.getByRole("list", { name: "EVA adoptions" }).getByText(duplicateEvaName, { exact: true })
  ).toHaveCount(2);
  await expect(trace.getByText("Completed", { exact: true })).toHaveCount(1);
  await expect(trace.getByText(duplicateRex!.name, { exact: true })).toHaveCount(2);
  const final = await mission.read();
  expect(final.actions[sourceActionUuid]).toMatchObject({
    parentActionUuid: null,
    stationUuid: null,
    poiUuid: mission.ids.poiA,
  });
  expect(final.evas[duplicateEva!.uuid].sequence).toEqual(duplicateEva!.sequence);
  expect(final.evas[final.rexes[duplicateRex!.uuid].evaUuid].refUuid).toBe(duplicateEva!.refUuid);
  expect(final.rexes[duplicateRex!.uuid].actionEntries[completedAction.uuid].rexStatus).toBe(
    "complete"
  );
  const executedStationRefUuid = final.stations[completedAction.stationUuid!].refUuid;
  expect(
    duplicateActions.some(
      (action) =>
        action.refUuid === final.actions[completedAction.uuid].refUuid &&
        final.stations[action.stationUuid!].refUuid === executedStationRefUuid
    )
  ).toBe(true);
});
