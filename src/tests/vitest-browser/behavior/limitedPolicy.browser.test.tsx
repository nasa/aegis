import { vi } from "vitest";
import type { BrowserPage as Page } from "vitest/browser";
import { test as base, expect } from "./missionHarness";
import { openExecutionInfo, selectExecution } from "./executionHelpers";
import {
  enablePlanningEditMode,
  openPlanningField,
  planningField,
  savePlanningField,
} from "./planningHelpers";

const test = base.extend({ scenario: "execution" as BehavioralScenario });

const SPARE_STATION = "30000000-0000-4000-8000-000000009020";
const SPARE_STATION_REF = "30000000-0000-4000-8000-000000009021";

function policyControl(page: Page) {
  return page.getByText("Execute Edit Mode:", { exact: true }).getBySelector("../..");
}

async function startLimitedAlpha(page: Page, mission: BrowserMission): Promise<void> {
  await mission.change((doc) => {
    doc.rexes[mission.ids.rexB].isRunning = false;
  });
  await mission.open();
  await enablePlanningEditMode(page);
  await openExecutionInfo(page, "Survey Alpha", mission.ids.rexEvaA);
  await policyControl(page).getBySelector("select").selectOptions("limited");
  await page.getByLabelText("Execute EVA", { exact: true }).click();
  await expect.element(page.getByLabelText("Stop Execution", { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await mission.read()).rexes[mission.ids.rexA].isRunning)
    .toBe(true);
}

test("limited mode edits original station and traverse duration/path/sequence while blocking protected fields", async ({
  page,
  mission,
}) => {
  await startLimitedAlpha(page, mission);
  const initial = await mission.read();
  const row = await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);

  await row.getByText("Alpha station", { exact: true }).click();
  await expect.element(page.getByText("Station Information", { exact: true })).toBeVisible();
  await savePlanningField(page, "Time in minutes", "24");
  await expect
    .poll(async () => (await mission.read()).stations[mission.ids.rexStationA].duration)
    .toBe(24);

  const stationName = planningField(page, "Station");
  await stationName.click();
  await expect.poll(() => page.getBySelector("dialog[open]").length).toBe(0);
  await expect.poll(() => page.getByLabelText("Edit on Map", { exact: true }).length).toBe(0);
  await expect.poll(() => page.getByRole("textbox", { name: "LatitudeStation" }).length).toBe(0);
  await expect.poll(() => page.getByRole("textbox", { name: "LongitudeStation" }).length).toBe(0);
  expect((await mission.read()).stations[mission.ids.rexStationA].location).toEqual(
    initial.stations[mission.ids.rexStationA].location
  );

  await row.getByText("Alpha to Bravo", { exact: true }).click();
  await expect.element(page.getByLabelText("Edit Path on Map", { exact: true })).toBeVisible();
  await savePlanningField(page, "Duration", "9");
  const pathBefore = (await mission.read()).traverses[mission.ids.rexTraverseA].path;
  await expect(pathBefore).toHaveLength(3);
  await page.getByLabelText("Reset Path", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).traverses[mission.ids.rexTraverseA].path)
    .not.toEqual(pathBefore);
  await expect
    .poll(async () => (await mission.read()).traverses[mission.ids.rexTraverseA].path.length)
    .toBe(2);
  const stationItem = row
    .getByText("Alpha station", { exact: true })
    .getBySelector('xpath=ancestor::div[contains(@class,"evaItem_")][1]');
  await expect.element(stationItem.getBySelector('svg[data-icon="arrow-down"]')).toBeVisible();
  await stationItem.getBySelector('svg[data-icon="arrow-down"]').click();
  await expect
    .poll(async () => (await mission.read()).evas[mission.ids.rexEvaA].sequence)
    .not.toEqual(initial.evas[mission.ids.rexEvaA].sequence);

  const persisted = await mission.read();
  expect(persisted.stations[mission.ids.rexStationA].duration).toBe(24);
  expect(persisted.traverses[mission.ids.rexTraverseA].duration).toBe(9);
  expect(persisted.evas[mission.ids.rexEvaA].sequence).not.toEqual(
    initial.evas[mission.ids.rexEvaA].sequence
  );
  expect(persisted.stations[mission.ids.rexStationA].name).toBe(
    initial.stations[mission.ids.rexStationA].name
  );
  expect(persisted.evas[mission.ids.evaA].sequence).toEqual(
    initial.evas[mission.ids.evaA].sequence
  );

  await mission.open();
  await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);
  expect((await mission.read()).traverses[mission.ids.rexTraverseA].path).not.toEqual(pathBefore);
  expect((await mission.read()).traverses[mission.ids.rexTraverseA].duration).toBe(9);
  expect((await mission.read()).stations[mission.ids.rexStationA].duration).toBe(24);
});

test("limited additions register editable station/traverse/actions and cleanly delete their copies", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    const spare = JSON.parse(JSON.stringify(doc.stations[mission.ids.stationA])) as Station;
    spare.uuid = SPARE_STATION;
    spare.refUuid = SPARE_STATION_REF;
    spare.name = "Spare limited station";
    spare.description = "Planning source station";
    doc.stations[SPARE_STATION] = spare;
  });
  const planningBefore = await mission.read();
  await startLimitedAlpha(page, mission);
  const before = await mission.read();
  const initialEditState = before.rexes[mission.ids.rexA].executeEditState!;
  const row = await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);

  await row.getByLabelText("Add Station", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).evas[mission.ids.rexEvaA].sequence.length)
    .toBe(before.evas[mission.ids.rexEvaA].sequence.length + 2);
  const emptyStationChoice = row.getByRole("combobox").filter({
    has: page.getBySelector(`option[value="${SPARE_STATION}"]`),
  });
  await expect.poll(() => emptyStationChoice.length).toBe(1);
  await emptyStationChoice.selectOptions(SPARE_STATION);
  await expect
    .poll(
      async () =>
        (await mission.read()).rexes[mission.ids.rexA].executeEditState!.addedStationUuids.length
    )
    .toBe(initialEditState.addedStationUuids.length + 1);

  const afterPick = await mission.read();
  const editStateAfterPick = afterPick.rexes[mission.ids.rexA].executeEditState!;
  const addedStationUuid = editStateAfterPick.addedStationUuids.find(
    (uuid) => !initialEditState.addedStationUuids.includes(uuid)
  );
  const addedTraverseUuid = editStateAfterPick.addedTraverseUuids.find(
    (uuid) => !initialEditState.addedTraverseUuids.includes(uuid)
  );
  expect(addedStationUuid).toBeTruthy();
  expect(addedTraverseUuid).toBeTruthy();
  expect(afterPick.evas[mission.ids.rexEvaA].sequence).toContainEqual({
    type: "station",
    uuid: addedStationUuid,
  });
  expect(afterPick.evas[mission.ids.rexEvaA].sequence).toContainEqual({
    type: "traverse",
    uuid: addedTraverseUuid,
  });

  const addedStationName = afterPick.stations[addedStationUuid!].name;
  expect(addedStationName).toContain("Spare limited station");
  const addedStationChoice = row.getByRole("combobox").filter({
    has: page.getBySelector(`option[value="${addedStationUuid}"]`),
  });
  const addedSequenceRow = addedStationChoice.getBySelector(
    'xpath=ancestor::div[contains(@class,"evaItem_")][1]'
  );
  await addedSequenceRow.getBySelector('[class*="iconCustom"]').click();
  await savePlanningField(page, "Station", "Added station editable");
  await savePlanningField(page, "Time in minutes", "31");
  const locationDialog = await openPlanningField(page, "LatitudeStation");
  await locationDialog.getByLabelText("LatitudeStation", { exact: true }).fill("0.002");
  await locationDialog.getByLabelText("LongitudeStation", { exact: true }).fill("0.004");
  await locationDialog.getByText("Save", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).stations[addedStationUuid!].location)
    .toEqual({ lat: 0.002, lng: 0.004 });

  const traverseName = (await mission.read()).traverses[addedTraverseUuid!].name;
  expect(traverseName).toContain("Added station editable");
  await row
    .getBySelector('[class*="evaTraverseNameText"]')
    .filter({ hasText: "Lander Ingress" })
    .click();
  await expect.element(page.getByLabelText("Edit Path on Map", { exact: true })).toBeVisible();
  await mission.change((doc) => {
    const traverse = doc.traverses[addedTraverseUuid!];
    const [start, end] = traverse.path;
    traverse.path = [
      { ...start },
      { lat: (start.lat + end.lat) / 2, lng: (start.lng + end.lng) / 2 },
      { ...end },
    ];
  });
  await expect
    .poll(async () => (await mission.read()).traverses[addedTraverseUuid!].path.length)
    .toBe(3);
  const newTraversePath = (await mission.read()).traverses[addedTraverseUuid!].path;
  await page.getByLabelText("Reset Path", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).traverses[addedTraverseUuid!].path)
    .not.toEqual(newTraversePath);
  await expect
    .poll(async () => (await mission.read()).traverses[addedTraverseUuid!].path.length)
    .toBe(2);
  await savePlanningField(page, "Duration", "13");

  await addedSequenceRow.getBySelector('[class*="iconCustom"]').click();
  await page.getByLabelText("actions_panel", { exact: true }).click();
  await page.getByText("Add Action", { exact: true }).click();
  const addedActionState = before.rexes[mission.ids.rexA].executeEditState!;
  await expect
    .poll(
      async () =>
        (await mission.read()).rexes[mission.ids.rexA].executeEditState!.addedActionUuids.length
    )
    .toBe(addedActionState.addedActionUuids.length + 1);
  const withAction = await mission.read();
  const addedActionUuid = withAction.rexes[
    mission.ids.rexA
  ].executeEditState!.addedActionUuids.find(
    (uuid) => !addedActionState.addedActionUuids.includes(uuid)
  );
  expect(addedActionUuid).toBeTruthy();
  const createdAction = withAction.actions[addedActionUuid!];
  const createdName = createdAction.name;
  await savePlanningField(page, "Action Name", "Added limited action");
  const createdCard = page.getByRole("listitem").filter({
    has: planningField(page, "Action Name").filter({ hasText: "Added limited action" }),
  });
  await createdCard.getBySelector('svg[data-icon="ellipsis-vertical"]').click();
  await page.getBySelector("dialog[open]").getByText("Duplicate Action", { exact: true }).click();
  await expect
    .poll(
      async () =>
        (await mission.read()).rexes[mission.ids.rexA].executeEditState!.addedActionUuids.length
    )
    .toBe(addedActionState.addedActionUuids.length + 2);
  const withDuplicate = await mission.read();
  const duplicateUuid = withDuplicate.rexes[
    mission.ids.rexA
  ].executeEditState!.addedActionUuids.find((uuid) => uuid !== addedActionUuid);
  expect(duplicateUuid).toBeTruthy();
  expect(withDuplicate.actions[duplicateUuid!].stationUuid).toBe(addedStationUuid);
  expect(withDuplicate.actions[duplicateUuid!].name).not.toBe(createdName);

  const duplicateCard = page.getByRole("listitem").filter({
    has: planningField(page, "Action Name").filter({
      hasText: withDuplicate.actions[duplicateUuid!].name,
    }),
  });
  await duplicateCard.getBySelector('svg[data-icon="ellipsis-vertical"]').click();
  vi.spyOn(window, "confirm").mockReturnValueOnce(true);
  await page.getBySelector("dialog[open]").getByText("Delete Action", { exact: true }).click();
  await expect.poll(async () => (await mission.read()).actions[duplicateUuid!]).toBeUndefined();
  await expect
    .poll(
      async () => (await mission.read()).rexes[mission.ids.rexA].executeEditState!.addedActionUuids
    )
    .not.toContain(duplicateUuid);

  await addedSequenceRow.getBySelector('svg[data-icon="trash"]').click();
  await expect
    .poll(async () => (await mission.read()).evas[mission.ids.rexEvaA].sequence)
    .not.toContainEqual({ type: "station", uuid: addedStationUuid });
  const afterDelete = await mission.read();
  expect(afterDelete.stations[addedStationUuid!]).toBeUndefined();
  expect(afterDelete.traverses[addedTraverseUuid!]).toBeUndefined();
  expect(afterDelete.rexes[mission.ids.rexA].executeEditState.addedStationUuids).not.toContain(
    addedStationUuid
  );
  expect(afterDelete.rexes[mission.ids.rexA].executeEditState.addedTraverseUuids).not.toContain(
    addedTraverseUuid
  );
  expect(afterDelete.stations[SPARE_STATION]).toEqual(planningBefore.stations[SPARE_STATION]);
  expect(afterDelete.evas[mission.ids.evaA]).toEqual(planningBefore.evas[mission.ids.evaA]);

  await mission.open();
  await expect.poll(async () => (await mission.read()).stations[addedStationUuid!]).toBeUndefined();
});
