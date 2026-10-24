import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test, expect } from "../fixtures/behavioralTest";
import {
  cancelPlanningField,
  choosePlanningEvaAction,
  confirmPlanningDelete,
  enablePlanningEditMode,
  openPlanningField,
  openPlanningSection,
  planningEvaRow,
  planningField,
  savePlanningField,
  selectPlanningEva,
  selectPlanningPoi,
  selectPlanningStation,
} from "./planningHelpers";

test.describe("Planning contracts", () => {
  test("station names save to the mission, update the list, and survive a fresh page", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Alpha station");
    await savePlanningField(page, "Station", "Sampling ridge");

    await expect(
      page.getByLabel("stationList-item").filter({ hasText: "Sampling ridge" })
    ).toHaveCount(1);
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].name)
      .toBe("Sampling ridge");
    expect((await mission.read()).stations[mission.ids.stationB].name).toBe("Bravo station");

    await mission.open(page);
    await selectPlanningStation(page, "Sampling ridge");
    await expect(planningField(page, "Station")).toHaveText("Sampling ridge");
  });

  test("canceling a station rename leaves its name and related traverse names unchanged", async ({
    page,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Alpha station");
    await cancelPlanningField(page, "Station", "Discarded station name");

    await mission.open(page);
    await selectPlanningStation(page, "Alpha station");
    const after = await mission.read();
    expect(after.stations[mission.ids.stationA].name).toBe(
      before.stations[mission.ids.stationA].name
    );
    expect(after.traverses[mission.ids.traverseA].name).toBe(
      before.traverses[mission.ids.traverseA].name
    );
    await expect(page.getByText("Discarded station name", { exact: true })).toHaveCount(0);
  });

  for (const invalidName of ["", "bravo STATION"]) {
    test(`station name validation rejects ${invalidName ? "case-insensitive duplicates" : "empty names"} without saving`, async ({
      page,
      mission,
    }) => {
      await mission.open(page);
      await enablePlanningEditMode(page);
      await selectPlanningStation(page, "Alpha station");
      const dialog = await openPlanningField(page, "Station");
      await dialog.getByLabel("Station", { exact: true }).fill(invalidName);
      await expect(
        dialog.getByText(invalidName ? "Name must be unique" : "Required", { exact: true })
      ).toBeVisible();
      await dialog.getByText("Save", { exact: true }).click();
      await expect(dialog.getByLabel("Station", { exact: true })).toBeVisible();
      await dialog.getByText("Cancel", { exact: true }).click();

      await mission.open(page);
      await selectPlanningStation(page, "Alpha station");
      expect((await mission.read()).stations[mission.ids.stationA].name).toBe("Alpha station");
      expect((await mission.read()).stations[mission.ids.stationB].name).toBe("Bravo station");
    });
  }

  test("duplicating a station copies its actions with independent identities and editable values", async ({
    page,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Alpha station");
    await page.getByLabel("duplicateStation", { exact: true }).click();
    await expect(planningField(page, "Station")).toHaveText("Alpha station (copy 1)");
    await expect
      .poll(async () => Object.keys((await mission.read()).stations).length)
      .toBe(Object.keys(before.stations).length + 1);
    const duplicated = await mission.read();
    const copy = Object.values(duplicated.stations).find(
      (station) => station.name === "Alpha station (copy 1)"
    );
    expect(copy).toBeDefined();
    expect(copy.uuid).not.toBe(mission.ids.stationA);
    expect(copy.refUuid).not.toBe(before.stations[mission.ids.stationA].refUuid);
    expect(copy.location).toEqual(before.stations[mission.ids.stationA].location);
    expect(copy.poiUuids).toEqual(before.stations[mission.ids.stationA].poiUuids);
    const originalActions = Object.values(before.actions).filter(
      (action) => action.stationUuid === mission.ids.stationA
    );
    const copiedActions = Object.values(duplicated.actions).filter(
      (action) => action.stationUuid === copy.uuid
    );
    expect(originalActions.length).toBeGreaterThan(0);
    expect(copiedActions).toHaveLength(originalActions.length);
    expect(copiedActions.map((action) => action.name)).toEqual(
      originalActions.map((action) => action.name)
    );
    expect(copy.actionOrderUuids).toEqual(copiedActions.map((action) => action.uuid));
    for (const action of copiedActions) {
      expect(originalActions.map((original) => original.uuid)).not.toContain(action.uuid);
      expect(originalActions.map((original) => original.refUuid)).not.toContain(action.refUuid);
    }

    await savePlanningField(page, "Station", "Independent copy");
    await expect
      .poll(async () => (await mission.read()).stations[copy.uuid].name)
      .toBe("Independent copy");
    expect((await mission.read()).stations[mission.ids.stationA]).toEqual(
      before.stations[mission.ids.stationA]
    );
    await mission.open(page);
    await selectPlanningStation(page, "Independent copy");
  });

  test("a station shared by planned EVAs cannot be deleted directly", async ({ page, mission }) => {
    const before = await mission.read();
    expect(
      before.evas[mission.ids.evaA].sequence.some((item) => item.uuid === mission.ids.stationB)
    ).toBe(true);
    expect(
      before.evas[mission.ids.evaB].sequence.some((item) => item.uuid === mission.ids.stationB)
    ).toBe(true);
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Bravo station");
    const messages: string[] = [];
    page.on("dialog", async (dialog) => {
      messages.push(dialog.message());
      await dialog.accept();
    });
    await page.getByLabel("deleteStation", { exact: true }).click();
    await expect.poll(() => messages.length).toBe(2);
    expect(messages[1]).toContain("Cannot delete a station that is being used by an EVA");
    expect(await mission.read()).toEqual(before);
    await mission.open(page);
    await openPlanningSection(page, "station");
    await expect(
      page.getByLabel("stationList-item").filter({ hasText: "Bravo station" })
    ).toHaveCount(1);
    await expect(
      page.getByLabel("stationList-item").filter({ hasText: "Alpha station" })
    ).toHaveCount(1);
  });

  test("deleting an unassigned station removes its child actions and folder entry while retaining other plans", async ({
    page,
    mission,
  }) => {
    const before = await mission.read();
    const stationId = randomUUID();
    const actionId = randomUUID();
    const station: Station = {
      ...before.stations[mission.ids.stationA],
      uuid: stationId,
      refUuid: randomUUID(),
      name: "Unassigned sample site",
      actionOrderUuids: [actionId],
    };
    const action: Action = {
      ...before.actions[mission.ids.actionA],
      uuid: actionId,
      refUuid: randomUUID(),
      stationUuid: stationId,
    };
    await mission.change((document) => {
      document.stations[stationId] = station;
      document.actions[actionId] = action;
      document.folders[mission.ids.folderA].items.push(stationId);
    });
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Unassigned sample site");
    await confirmPlanningDelete(page, "deleteStation");
    await expect.poll(async () => (await mission.read()).stations[stationId]).toBeUndefined();
    const after = await mission.read();
    expect(after.actions[actionId]).toBeUndefined();
    expect(after.folders[mission.ids.folderA].items).toEqual(
      before.folders[mission.ids.folderA].items
    );
    expect(after.evas).toEqual(before.evas);
    expect(after.stations).toEqual(before.stations);
    expect(after.actions).toEqual(before.actions);
    await mission.open(page);
    await openPlanningSection(page, "station");
    await expect(
      page.getByLabel("stationList-item").filter({ hasText: "Unassigned sample site" })
    ).toHaveCount(0);
  });

  test("a newly created station can be named, persisted, and deleted without modifying existing stations", async ({
    page,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await openPlanningSection(page, "station");
    await page.getByLabel("addStation", { exact: true }).click();
    await expect(planningField(page, "Station")).toBeVisible();
    await savePlanningField(page, "Station", "New sampling site");
    await expect
      .poll(async () =>
        Object.values((await mission.read()).stations).some(
          (station) => station.name === "New sampling site"
        )
      )
      .toBe(true);
    const created = Object.values((await mission.read()).stations).find(
      (station) => station.name === "New sampling site"
    );
    expect(Object.keys(before.stations)).not.toContain(created.uuid);

    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "New sampling site");
    await confirmPlanningDelete(page, "deleteStation");
    await expect.poll(async () => (await mission.read()).stations[created.uuid]).toBeUndefined();
    expect((await mission.read()).stations).toEqual(before.stations);
  });

  test("POI edits save and cancel independently, and duplicates preserve location without sharing identity", async ({
    page,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningPoi(page, "Reference POI");
    await cancelPlanningField(page, "POI", "Canceled target");
    await savePlanningField(page, "POI", "Ice exposure");
    await expect
      .poll(async () => (await mission.read()).pois[mission.ids.poiA].name)
      .toBe("Ice exposure");
    await page.getByLabel("duplicatePoi", { exact: true }).click();
    await expect(planningField(page, "POI")).toHaveText("Ice exposure (copy 1)");
    await expect
      .poll(async () => Object.keys((await mission.read()).pois).length)
      .toBe(Object.keys(before.pois).length + 1);
    const copy = Object.values((await mission.read()).pois).find(
      (poi) => poi.name === "Ice exposure (copy 1)"
    );
    expect(copy.uuid).not.toBe(mission.ids.poiA);
    expect(copy.location).toEqual(before.pois[mission.ids.poiA].location);
    await savePlanningField(page, "POI", "Independent exposure");
    await expect
      .poll(async () => (await mission.read()).pois[copy.uuid].name)
      .toBe("Independent exposure");
    expect((await mission.read()).pois[mission.ids.poiA].name).toBe("Ice exposure");

    await mission.open(page);
    await selectPlanningPoi(page, "Independent exposure");
    await expect(page.getByLabel("poiList-item")).toHaveCount(2);
  });

  test("deleting a referenced POI clears associated actions and station references while preserving the plan", async ({
    page,
    mission,
  }) => {
    const before = await mission.read();
    expect(before.stations[mission.ids.stationA].poiUuids).toContain(mission.ids.poiA);
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningPoi(page, "Reference POI");
    await confirmPlanningDelete(page, "deletePoi");
    await expect.poll(async () => (await mission.read()).pois[mission.ids.poiA]).toBeUndefined();
    const after = await mission.read();
    expect(
      Object.values(after.stations).some((station) => station.poiUuids?.includes(mission.ids.poiA))
    ).toBe(false);
    expect(Object.values(after.actions).some((action) => action.poiUuid === mission.ids.poiA)).toBe(
      false
    );
    expect(after.stations[mission.ids.stationA].name).toBe("Alpha station");
    expect(after.actions[mission.ids.actionA]).toBeUndefined();
    expect(after.stations[mission.ids.stationA].actionOrderUuids).not.toContain(
      mission.ids.actionA
    );
    expect(after.evas).toEqual(before.evas);
    expect(after.traverses).toEqual(before.traverses);
    await mission.open(page);
    await openPlanningSection(page, "poi");
    await expect(page.getByLabel("poiList-item")).toHaveCount(0);
  });

  test("a new EVA starts with a complete lander-to-lander sequence and can be removed without touching other plans", async ({
    page,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await openPlanningSection(page, "evas");
    await page.getByLabel("addEva", { exact: true }).click();
    await expect(planningField(page, "EVA Title")).toBeVisible();
    await savePlanningField(page, "EVA Title", "New survey plan");
    await expect
      .poll(async () => Object.keys((await mission.read()).evas).length)
      .toBe(Object.keys(before.evas).length + 1);
    const after = await mission.read();
    const created = Object.values(after.evas).find((eva) => eva.name === "New survey plan");
    expect(created.duration).toBe(before.defaultEvaDuration);
    expect(created.traverseRate).toBe(before.traverseRate);
    expect(created.sequence.map((item) => item.type)).toEqual(["station", "traverse", "station"]);
    const egress = after.stations[created.sequence[0].uuid];
    const traverse = after.traverses[created.sequence[1].uuid];
    const ingress = after.stations[created.sequence[2].uuid];
    expect(egress.isLanderXgress).toBe(true);
    expect(ingress.isLanderXgress).toBe(true);
    expect(egress.uuid).not.toBe(ingress.uuid);
    expect(egress.location).toEqual(before.landerLocation);
    expect(ingress.location).toEqual(before.landerLocation);
    expect(traverse.path).toEqual([before.landerLocation, before.landerLocation]);
    expect(traverse.pathSegmentDistances).toEqual([0]);

    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningEva(page, "New survey plan");
    await confirmPlanningDelete(page, "deleteEva");
    await expect.poll(async () => (await mission.read()).evas[created.uuid]).toBeUndefined();
    const final = await mission.read();
    expect(final.evas).toEqual(before.evas);
    expect(final.stations).toEqual(before.stations);
    expect(final.traverses).toEqual(before.traverses);
    expect(final.actions).toEqual(before.actions);
  });

  test("station dwell time saves as minutes and rejects zero without corrupting the saved value", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Alpha station");
    await savePlanningField(page, "Time in minutes", "37");
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].duration)
      .toBe(37);
    const dialog = await openPlanningField(page, "Time in minutes");
    await dialog.getByLabel("Time in minutes", { exact: true }).fill("0");
    await expect(
      dialog.getByText("Must be a number greater than 0", { exact: true })
    ).toBeVisible();
    await dialog.getByText("Save", { exact: true }).click();
    await expect(dialog.getByLabel("Time in minutes", { exact: true })).toBeVisible();
    await dialog.getByText("Cancel", { exact: true }).click();
    await mission.open(page);
    await selectPlanningStation(page, "Alpha station");
    await expect(planningField(page, "Time in minutes")).toHaveText("37");
    expect((await mission.read()).stations[mission.ids.stationA].duration).toBe(37);
  });

  test("duplicating an EVA shares planned stations but owns new traverses", async ({
    page,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningEva(page, "Survey Alpha");
    await choosePlanningEvaAction(page, "Survey Alpha", "Duplicate EVA");
    await expect
      .poll(async () => Object.keys((await mission.read()).evas).length)
      .toBe(Object.keys(before.evas).length + 1);
    const after = await mission.read();
    const copy = Object.values(after.evas).find((eva) => eva.name === "Survey Alpha (copy 1)");
    expect(copy).toBeDefined();
    expect(copy.refUuid).not.toBe(before.evas[mission.ids.evaA].refUuid);
    expect(copy.sequence.map((item) => item.type)).toEqual(
      before.evas[mission.ids.evaA].sequence.map((item) => item.type)
    );
    expect(
      copy.sequence.filter((item) => item.type === "station").map((item) => item.uuid)
    ).toEqual(expect.arrayContaining([mission.ids.stationA, mission.ids.stationB]));
    const originalTraverseIds = before.evas[mission.ids.evaA].sequence
      .filter((item) => item.type === "traverse")
      .map((item) => item.uuid);
    const copiedTraverseIds = copy.sequence
      .filter((item) => item.type === "traverse")
      .map((item) => item.uuid);
    expect(copiedTraverseIds).toHaveLength(originalTraverseIds.length);
    for (const id of copiedTraverseIds) {
      expect(originalTraverseIds).not.toContain(id);
      expect(after.traverses[id]).toBeDefined();
    }

    await savePlanningField(page, "EVA Title", "Independent plan");
    await expect
      .poll(async () => (await mission.read()).evas[copy.uuid].name)
      .toBe("Independent plan");
    expect((await mission.read()).evas[mission.ids.evaA]).toEqual(before.evas[mission.ids.evaA]);
    await mission.open(page);
    await selectPlanningEva(page, "Independent plan");
  });

  test("duplicating an EVA with stations clones its complete station and action tree", async ({
    page,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningEva(page, "Survey Alpha");
    page.once("dialog", (dialog) => dialog.accept());
    await choosePlanningEvaAction(page, "Survey Alpha", "Duplicate w/ Stations");
    await expect
      .poll(async () => Object.keys((await mission.read()).evas).length)
      .toBe(Object.keys(before.evas).length + 1);
    const after = await mission.read();
    const copy = Object.values(after.evas).find((eva) => eva.name === "Survey Alpha (copy 1)");
    const originalStationIds = before.evas[mission.ids.evaA].sequence
      .filter((item) => item.type === "station")
      .map((item) => item.uuid);
    const copiedStationIds = copy.sequence
      .filter((item) => item.type === "station")
      .map((item) => item.uuid);
    expect(copiedStationIds).toHaveLength(originalStationIds.length);
    for (const id of copiedStationIds) {
      expect(originalStationIds).not.toContain(id);
      expect(after.stations[id]).toBeDefined();
    }
    const copiedSampleStation = copiedStationIds
      .map((id) => after.stations[id])
      .find((station) => station.name === "Alpha station (copy 1)");
    expect(copiedSampleStation.location).toEqual(before.stations[mission.ids.stationA].location);
    expect(copiedSampleStation.actionOrderUuids).toHaveLength(1);
    const copiedAction = after.actions[copiedSampleStation.actionOrderUuids[0]];
    expect(copiedAction.stationUuid).toBe(copiedSampleStation.uuid);
    expect(copiedAction.uuid).not.toBe(mission.ids.actionA);
    expect(copiedAction.refUuid).not.toBe(before.actions[mission.ids.actionA].refUuid);
    expect(after.stations[mission.ids.stationA]).toEqual(before.stations[mission.ids.stationA]);
    await mission.open(page);
    await selectPlanningEva(page, "Survey Alpha (copy 1)");
  });

  test("adding and deleting a REX preserves its planned EVA and gives the execution scoped identities", async ({
    page,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningEva(page, "Survey Alpha");
    await choosePlanningEvaAction(page, "Survey Alpha", "Add REX");
    await expect(planningField(page, "REX Title")).toBeVisible();
    await expect.poll(async () => Object.keys((await mission.read()).rexes).length).toBe(1);
    const created = await mission.read();
    const rex = Object.values(created.rexes)[0];
    const rexEva = created.evas[rex.evaUuid];
    expect(rexEva.uuid).not.toBe(mission.ids.evaA);
    expect(rexEva.refUuid).toBe(before.evas[mission.ids.evaA].refUuid);
    expect(rexEva.sequence).toHaveLength(before.evas[mission.ids.evaA].sequence.length);
    expect(rexEva.sequence.map((item) => item.type)).toEqual(
      before.evas[mission.ids.evaA].sequence.map((item) => item.type)
    );
    for (let i = 0; i < rexEva.sequence.length; i++) {
      const sourceItem = before.evas[mission.ids.evaA].sequence[i];
      const copiedItem = rexEva.sequence[i];
      expect(copiedItem.type).toBe(sourceItem.type);
      expect(copiedItem.uuid).not.toBe(sourceItem.uuid);
      const original =
        sourceItem.type === "station"
          ? before.stations[sourceItem.uuid]
          : before.traverses[sourceItem.uuid];
      const copy =
        copiedItem.type === "station"
          ? created.stations[copiedItem.uuid]
          : created.traverses[copiedItem.uuid];
      expect(copy.refUuid).toBe(original.refUuid);
    }
    const scopedStationIds = rexEva.sequence
      .filter((item) => item.type === "station")
      .map((item) => item.uuid);
    const scopedTraverseIds = rexEva.sequence
      .filter((item) => item.type === "traverse")
      .map((item) => item.uuid);
    const scopedActions = Object.values(created.actions).filter(
      (action) =>
        scopedStationIds.includes(action.stationUuid) ||
        scopedTraverseIds.includes(action.traverseUuid)
    );
    expect(
      scopedActions.some((action) => action.refUuid === before.actions[mission.ids.actionA].refUuid)
    ).toBe(true);
    await savePlanningField(page, "REX Title", "Independent execution");
    await expect
      .poll(async () => (await mission.read()).rexes[rex.uuid].name)
      .toBe("Independent execution");
    expect((await mission.read()).evas[mission.ids.evaA]).toEqual(before.evas[mission.ids.evaA]);

    await confirmPlanningDelete(page, "deleteEva");
    await expect.poll(async () => (await mission.read()).rexes[rex.uuid]).toBeUndefined();
    const after = await mission.read();
    expect(after.evas).toEqual(before.evas);
    expect(after.stations).toEqual(before.stations);
    expect(after.traverses).toEqual(before.traverses);
    expect(after.actions).toEqual(before.actions);
    await mission.open(page);
    await selectPlanningEva(page, "Survey Alpha");
    await expect(planningField(page, "REX Title")).toHaveCount(0);
  });

  test("deleting a planned EVA retains shared stations and the other plan", async ({
    page,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningEva(page, "Survey Alpha");
    await confirmPlanningDelete(page, "deleteEva");
    await expect.poll(async () => (await mission.read()).evas[mission.ids.evaA]).toBeUndefined();
    const after = await mission.read();
    expect(after.evas[mission.ids.evaB]).toEqual(before.evas[mission.ids.evaB]);
    expect(after.stations[mission.ids.stationA]).toEqual(before.stations[mission.ids.stationA]);
    expect(after.stations[mission.ids.stationB]).toEqual(before.stations[mission.ids.stationB]);
    expect(after.actions[mission.ids.actionA]).toEqual(before.actions[mission.ids.actionA]);
    for (const item of before.evas[mission.ids.evaA].sequence.filter(
      (entry) => entry.type === "traverse"
    )) {
      expect(after.traverses[item.uuid]).toBeUndefined();
    }
    await mission.open(page);
    await openPlanningSection(page, "evas");
    await expect(planningEvaRow(page, "Survey Alpha")).toHaveCount(0);
    await expect(planningEvaRow(page, "Survey Bravo")).toHaveCount(1);
  });

  test("two executions of the same plan have distinct entities and deleting the plan cascades only through its executions", async ({
    page,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningEva(page, "Survey Alpha");
    await choosePlanningEvaAction(page, "Survey Alpha", "Add REX");
    await expect.poll(async () => Object.keys((await mission.read()).rexes).length).toBe(1);
    await choosePlanningEvaAction(page, "Survey Alpha", "Add REX");
    await expect.poll(async () => Object.keys((await mission.read()).rexes).length).toBe(2);
    const withExecutions = await mission.read();
    const executions = Object.values(withExecutions.rexes);
    const firstEva = withExecutions.evas[executions[0].evaUuid];
    const secondEva = withExecutions.evas[executions[1].evaUuid];
    expect(firstEva.uuid).not.toBe(secondEva.uuid);
    expect(firstEva.refUuid).toBe(before.evas[mission.ids.evaA].refUuid);
    expect(secondEva.refUuid).toBe(before.evas[mission.ids.evaA].refUuid);
    const firstIds = firstEva.sequence.map((item) => item.uuid);
    const secondIds = secondEva.sequence.map((item) => item.uuid);
    expect(firstIds).toHaveLength(before.evas[mission.ids.evaA].sequence.length);
    expect(secondIds).toHaveLength(firstIds.length);
    for (let index = 0; index < firstEva.sequence.length; index++) {
      const firstItem = firstEva.sequence[index];
      const secondItem = secondEva.sequence[index];
      expect(firstIds).not.toContain(secondItem.uuid);
      const firstEntity =
        firstItem.type === "station"
          ? withExecutions.stations[firstItem.uuid]
          : withExecutions.traverses[firstItem.uuid];
      const secondEntity =
        secondItem.type === "station"
          ? withExecutions.stations[secondItem.uuid]
          : withExecutions.traverses[secondItem.uuid];
      expect(firstEntity.refUuid).toBe(secondEntity.refUuid);
    }
    await planningEvaRow(page, "Survey Alpha")
      .locator(`select:has(option[value="${mission.ids.evaA}"])`)
      .selectOption(mission.ids.evaA);
    await expect(planningField(page, "REX Title")).toHaveCount(0);
    await confirmPlanningDelete(page, "deleteEva");
    await expect.poll(async () => Object.keys((await mission.read()).rexes)).toEqual([]);
    const after = await mission.read();
    expect(Object.keys(after.evas)).toEqual([mission.ids.evaB]);
    expect(after.evas[mission.ids.evaB]).toEqual(before.evas[mission.ids.evaB]);
    expect(after.stations[mission.ids.stationA]).toEqual(before.stations[mission.ids.stationA]);
    expect(after.stations[mission.ids.stationB]).toEqual(before.stations[mission.ids.stationB]);
    expect(after.actions[mission.ids.actionA]).toEqual(before.actions[mission.ids.actionA]);
    for (const id of [...firstIds, ...secondIds]) {
      expect(after.stations[id]).toBeUndefined();
      expect(after.traverses[id]).toBeUndefined();
    }
    await mission.open(page);
    await selectPlanningEva(page, "Survey Bravo");
    await expect(planningEvaRow(page, "Survey Alpha")).toHaveCount(0);
  });

  test("JSON export contains the saved planning values and nested station/action relationships", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Alpha station");
    await savePlanningField(page, "Station", "Exported sampling site");
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].name)
      .toBe("Exported sampling site");
    await openPlanningSection(page, "mission");
    await page.getByLabel("export_panel", { exact: true }).click();
    await page.locator("#export-stations").check();
    await page.locator("#export-pois").check();
    const downloadPromise = page.waitForEvent("download");
    await page.getByLabel("Export JSON File", { exact: true }).click();
    const download = await downloadPromise;
    const output: BehavioralPlanningExport = JSON.parse(
      await readFile(await download.path(), "utf8")
    );
    const station = output.stations.find((entry) => entry.uuid === mission.ids.stationA);
    expect(station.name).toBe("Exported sampling site");
    expect(station.actionsReadable.map((action) => action.uuid)).toContain(mission.ids.actionA);
    expect(station.poisAssociatedReadable).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Reference POI" })])
    );
    expect(output.pois.map((poi) => poi.uuid)).toContain(mission.ids.poiA);
    const eva = output.evas.find((entry) => entry.uuid === mission.ids.evaA);
    expect(eva.sequenceReadable.map((entry) => entry.uuid)).toEqual(
      (await mission.read()).evas[mission.ids.evaA].sequence.map((entry) => entry.uuid)
    );
    expect(eva.sequenceReadable.find((entry) => entry.uuid === mission.ids.stationA).name).toBe(
      "Exported sampling site"
    );
  });
});
