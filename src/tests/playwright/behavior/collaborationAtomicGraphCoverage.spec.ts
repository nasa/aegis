import type { BrowserContext, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import {
  enablePlanningEditMode,
  openPlanningSection,
  selectPlanningEva,
  choosePlanningEvaAction,
  planningEvaRow,
  planningField,
  selectPlanningStation,
  selectPlanningStationActions,
} from "./planningHelpers";

async function observeDocumentChanges(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const modulePath = "/client/automergeDocHandles.ts";
    const { getMissionDocHandle } = await import(modulePath);
    const handle = getMissionDocHandle();
    if (!handle) throw new Error("Peer mission handle is unavailable");
    const snapshots: Mission[] = [JSON.parse(JSON.stringify(handle.doc()))];
    Reflect.set(window, "aegisGraphSnapshots", snapshots);
    handle.on("change", () => snapshots.push(JSON.parse(JSON.stringify(handle.doc()))));
  });
}

async function observedDocuments(page: Page): Promise<Mission[]> {
  return page.evaluate(() => Reflect.get(window, "aegisGraphSnapshots"));
}

async function expectCompletePeerGraph(page: Page, mission: BehavioralMission): Promise<Mission> {
  const persisted = await mission.read();
  await expect.poll(async () => (await observedDocuments(page)).at(-1)).toEqual(persisted);
  const snapshots = await observedDocuments(page);
  expect(snapshots.length).toBeGreaterThan(1);
  for (const snapshot of snapshots) assertGraphReferencesAreClosed(snapshot);
  return persisted;
}

function assertGraphReferencesAreClosed(doc: Mission): void {
  for (const eva of Object.values(doc.evas)) {
    for (const item of eva.sequence) {
      if (!item.uuid) continue;
      if (item.type === "station") expect(doc.stations[item.uuid]).toBeDefined();
      else expect(doc.traverses[item.uuid]).toBeDefined();
    }
  }
  for (const station of Object.values(doc.stations)) {
    for (const actionUuid of station.actionOrderUuids ?? []) {
      expect(doc.actions[actionUuid]).toMatchObject({ stationUuid: station.uuid });
    }
  }
  for (const traverse of Object.values(doc.traverses)) {
    for (const actionUuid of traverse.actionOrderUuids ?? []) {
      expect(doc.actions[actionUuid]).toMatchObject({ traverseUuid: traverse.uuid });
    }
  }
  for (const action of Object.values(doc.actions)) {
    if (action.stationUuid) {
      expect(doc.stations[action.stationUuid]).toBeDefined();
      expect(doc.stations[action.stationUuid].actionOrderUuids).toContain(action.uuid);
    }
    if (action.traverseUuid) {
      expect(doc.traverses[action.traverseUuid]).toBeDefined();
      expect(doc.traverses[action.traverseUuid].actionOrderUuids).toContain(action.uuid);
    }
  }
  for (const rex of Object.values(doc.rexes)) expect(doc.evas[rex.evaUuid]).toBeDefined();
  for (const folder of Object.values(doc.folders)) {
    const entities =
      folder.type === "station"
        ? doc.stations
        : folder.type === "eva"
          ? doc.evas
          : folder.type === "poi"
            ? doc.pois
            : folder.type === "layer"
              ? doc.layers
              : doc.presets;
    for (const uuid of folder.items) expect(entities[uuid]).toBeDefined();
  }
}

test("peer EVA duplication publishes a complete graph with no observed dangling references", async ({
  page,
  browser,
  context,
  baseURL,
  mission,
}) => {
  const before = await mission.read();
  await mission.open(page);
  await openPlanningSection(page, "evas");
  await observeDocumentChanges(page);

  const peerContext: BrowserContext = await browser.newContext({
    storageState: await context.storageState(),
    baseURL,
    viewport: { width: 1960, height: 1080 },
  });
  const peer: Page = await peerContext.newPage();
  try {
    await mission.open(peer);
    await enablePlanningEditMode(peer);
    await selectPlanningEva(peer, "Survey Alpha");

    peer.once("dialog", (dialog) => dialog.accept());
    await choosePlanningEvaAction(peer, "Survey Alpha", "Duplicate w/ Stations");
    await expect
      .poll(async () => Object.keys((await mission.read()).evas).length)
      .toBe(Object.keys(before.evas).length + 1);
    await expectCompletePeerGraph(page, mission);
    const snapshots = await observedDocuments(page);

    expect(snapshots.length).toBeGreaterThanOrEqual(2);
    for (const snapshot of snapshots) assertGraphReferencesAreClosed(snapshot);
    const observedCopies = snapshots.map(
      (snapshot) =>
        Object.values(snapshot.evas).filter((eva) => eva.name === "Survey Alpha (copy 1)").length
    );
    expect(observedCopies).toContain(0);
    expect(observedCopies).toContain(1);
    expect(observedCopies.every((count) => count === 0 || count === 1)).toBe(true);

    const complete = await mission.read();
    assertGraphReferencesAreClosed(complete);
    const copy = Object.values(complete.evas).find((eva) => eva.name === "Survey Alpha (copy 1)");
    expect(copy).toBeDefined();
    const originalStationIds = before.evas[mission.ids.evaA].sequence
      .filter((item) => item.type === "station")
      .map((item) => item.uuid);
    const copiedStationIds = copy!.sequence
      .filter((item) => item.type === "station")
      .map((item) => item.uuid);
    expect(copiedStationIds).toHaveLength(originalStationIds.length);
    for (const stationUuid of copiedStationIds) {
      expect(originalStationIds).not.toContain(stationUuid);
      const station = complete.stations[stationUuid];
      expect(station).toBeDefined();
      for (const actionUuid of station.actionOrderUuids ?? []) {
        expect(complete.actions[actionUuid]).toMatchObject({ stationUuid });
      }
    }
    await expect(
      page.getByLabel("evaList-item", { exact: true }).filter({ hasText: "Survey Alpha (copy 1)" })
    ).toHaveCount(1);
    await mission.open(page);
    await openPlanningSection(page, "evas");
    await expect(
      page.getByLabel("evaList-item", { exact: true }).filter({ hasText: "Survey Alpha (copy 1)" })
    ).toHaveCount(1);
    expect(complete.evas[mission.ids.evaA]).toEqual(before.evas[mission.ids.evaA]);
  } finally {
    await peerContext.close();
  }
});

for (const operation of ["shared-station EVA", "station with actions", "action"] as const) {
  test(`peer observes atomic ${operation} duplication and deletion with complete ownership and order references`, async ({
    page,
    context,
    mission,
  }) => {
    const original = await mission.read();
    await mission.open(page);
    await observeDocumentChanges(page);
    const writer = await context.newPage();
    await mission.open(writer);
    await enablePlanningEditMode(writer);
    if (operation === "shared-station EVA") {
      await selectPlanningEva(writer, "Survey Alpha");
      await choosePlanningEvaAction(writer, "Survey Alpha", "Duplicate EVA");
      await expect.poll(async () => Object.keys((await mission.read()).evas).length).toBe(3);
      const duplicated = await expectCompletePeerGraph(page, mission);
      const copy = Object.values(duplicated.evas).find((eva) => !original.evas[eva.uuid]);
      expect(copy).toBeDefined();
      expect(copy!.sequence.filter((item) => item.type === "station")).toHaveLength(4);
      expect(copy!.sequence.filter((item) => item.type === "station")).toEqual(
        expect.arrayContaining([
          { type: "station", uuid: mission.ids.stationA },
          { type: "station", uuid: mission.ids.stationB },
        ])
      );
      const landerCopies = Object.values(duplicated.stations).filter(
        (station) => !original.stations[station.uuid]
      );
      expect(landerCopies).toHaveLength(2);
      for (const station of landerCopies) {
        expect(station.isLanderXgress).toBe(true);
        expect(copy!.sequence).toContainEqual({ type: "station", uuid: station.uuid });
      }
      for (const [uuid, station] of Object.entries(original.stations)) {
        expect(duplicated.stations[uuid]).toEqual(station);
      }
      await selectPlanningEva(page, copy!.name);
      await selectPlanningEva(writer, copy!.name);
      writer.once("dialog", (dialog) => dialog.accept());
      await writer.getByLabel("deleteEva", { exact: true }).click();
      await expect.poll(async () => (await mission.read()).evas[copy!.uuid]).toBeUndefined();
      const deleted = await expectCompletePeerGraph(page, mission);
      expect(deleted.stations).toEqual(original.stations);
      expect(deleted.actions).toEqual(original.actions);
      await expect(planningEvaRow(page, copy!.name)).toHaveCount(0);
      await mission.open(page);
      await openPlanningSection(page, "evas");
      await expect(planningEvaRow(page, copy!.name)).toHaveCount(0);
    } else if (operation === "station with actions") {
      await selectPlanningStation(writer, "Alpha station");
      await writer.getByLabel("duplicateStation", { exact: true }).click();
      await expect
        .poll(async () => Object.keys((await mission.read()).stations).length)
        .toBe(Object.keys(original.stations).length + 1);
      const duplicated = await expectCompletePeerGraph(page, mission);
      const copy = Object.values(duplicated.stations).find(
        (station) => !original.stations[station.uuid]
      );
      expect(copy).toBeDefined();
      expect(copy!.actionOrderUuids).toHaveLength(1);
      const actionUuid = copy!.actionOrderUuids[0];
      expect(duplicated.actions[actionUuid]).toMatchObject({
        stationUuid: copy!.uuid,
        name: "Sample regolith",
      });
      expect(actionUuid).not.toBe(mission.ids.actionA);
      await selectPlanningStation(page, copy!.name);
      writer.once("dialog", (dialog) => dialog.accept());
      await writer.getByLabel("deleteStation", { exact: true }).click();
      await expect.poll(async () => (await mission.read()).stations[copy!.uuid]).toBeUndefined();
      const deleted = await expectCompletePeerGraph(page, mission);
      expect(deleted.actions[actionUuid]).toBeUndefined();
      expect(deleted.stations).toEqual(original.stations);
      expect(deleted.actions).toEqual(original.actions);
      await expect(page.getByLabel("stationList-item").filter({ hasText: copy!.name })).toHaveCount(
        0
      );
      await mission.open(page);
      await selectPlanningStation(page, "Alpha station");
      await expect(page.getByLabel("stationList-item").filter({ hasText: copy!.name })).toHaveCount(
        0
      );
    } else {
      await selectPlanningStationActions(writer, "Alpha station");
      await selectPlanningStationActions(page, "Alpha station");
      const originalRow = writer.getByRole("listitem").filter({
        has: writer.locator('div[aria-label="Action Name"]').filter({ hasText: "Sample regolith" }),
      });
      await originalRow.locator('svg[data-icon="ellipsis-vertical"]').click();
      await writer.locator("dialog[open]").getByText("Duplicate Action", { exact: true }).click();
      await expect.poll(async () => Object.keys((await mission.read()).actions).length).toBe(2);
      const duplicated = await expectCompletePeerGraph(page, mission);
      const copy = Object.values(duplicated.actions).find(
        (action) => !original.actions[action.uuid]
      );
      expect(copy).toBeDefined();
      expect(duplicated.stations[mission.ids.stationA].actionOrderUuids).toEqual([
        mission.ids.actionA,
        copy!.uuid,
      ]);
      await expect(planningField(page, "Action Name").filter({ hasText: copy!.name })).toHaveCount(
        1
      );
      const copyRow = writer.getByRole("listitem").filter({
        has: writer.locator('div[aria-label="Action Name"]').filter({ hasText: copy!.name }),
      });
      await copyRow.locator('svg[data-icon="ellipsis-vertical"]').click();
      writer.once("dialog", (dialog) => dialog.accept());
      await writer.locator("dialog[open]").getByText("Delete Action", { exact: true }).click();
      await expect.poll(async () => (await mission.read()).actions[copy!.uuid]).toBeUndefined();
      const deleted = await expectCompletePeerGraph(page, mission);
      expect(deleted.actions).toEqual(original.actions);
      expect(deleted.stations[mission.ids.stationA].actionOrderUuids).toEqual([
        mission.ids.actionA,
      ]);
      await expect(planningField(page, "Action Name").filter({ hasText: copy!.name })).toHaveCount(
        0
      );
      await mission.open(page);
      await selectPlanningStationActions(page, "Alpha station");
      await expect(planningField(page, "Action Name")).toHaveText("Sample regolith");
    }
    await observeDocumentChanges(page);
    expect((await observedDocuments(page))[0]).toEqual(await mission.read());
  });
}

test("peer observes complete REX creation, REX deletion and planned-EVA execution cascade in single document changes", async ({
  page,
  context,
  mission,
}) => {
  const original = await mission.read();
  await mission.open(page);
  await openPlanningSection(page, "evas");
  await observeDocumentChanges(page);
  const writer = await context.newPage();
  await mission.open(writer);
  await enablePlanningEditMode(writer);
  await selectPlanningEva(writer, "Survey Alpha");
  await choosePlanningEvaAction(writer, "Survey Alpha", "Add REX");
  await expect.poll(async () => Object.keys((await mission.read()).rexes).length).toBe(1);
  const first = await expectCompletePeerGraph(page, mission);
  const firstRex = Object.values(first.rexes)[0];
  const firstEva = first.evas[firstRex.evaUuid];
  expect(firstEva.refUuid).toBe(original.evas[mission.ids.evaA].refUuid);
  expect(firstEva.sequence.filter((item) => item.type === "station")).toHaveLength(
    original.evas[mission.ids.evaA].sequence.filter((item) => item.type === "station").length
  );
  await planningEvaRow(page, "Survey Alpha").locator("select").first().selectOption(firstEva.uuid);
  await expect(planningField(page, "REX Title")).toHaveText(firstRex.name);
  writer.once("dialog", (dialog) => dialog.accept());
  await writer.getByLabel("deleteEva", { exact: true }).click();
  await expect.poll(async () => Object.keys((await mission.read()).rexes).length).toBe(0);
  const deleted = await expectCompletePeerGraph(page, mission);
  expect(deleted.evas).toEqual(original.evas);
  expect(deleted.stations).toEqual(original.stations);
  expect(deleted.actions).toEqual(original.actions);
  expect(deleted.traverses).toEqual(original.traverses);
  await expect(planningField(page, "REX Title")).toHaveCount(0);

  await choosePlanningEvaAction(writer, "Survey Alpha", "Add REX");
  await expect.poll(async () => Object.keys((await mission.read()).rexes).length).toBe(1);
  const withRex = await expectCompletePeerGraph(page, mission);
  const rex = Object.values(withRex.rexes)[0];
  await planningEvaRow(writer, "Survey Alpha")
    .locator("select")
    .first()
    .selectOption(mission.ids.evaA);
  writer.once("dialog", (dialog) => dialog.accept());
  await writer.getByLabel("deleteEva", { exact: true }).click();
  await expect.poll(async () => (await mission.read()).evas[mission.ids.evaA]).toBeUndefined();
  const final = await expectCompletePeerGraph(page, mission);
  expect(final.rexes[rex.uuid]).toBeUndefined();
  expect(final.evas[rex.evaUuid]).toBeUndefined();
  expect(final.evas[mission.ids.evaB]).toEqual(original.evas[mission.ids.evaB]);
  expect(final.stations[mission.ids.stationA]).toEqual(original.stations[mission.ids.stationA]);
  expect(final.stations[mission.ids.stationB]).toEqual(original.stations[mission.ids.stationB]);
  expect(final.actions[mission.ids.actionA]).toEqual(original.actions[mission.ids.actionA]);
  for (const item of withRex.evas[rex.evaUuid].sequence) {
    if (item.type === "station") expect(final.stations[item.uuid]).toBeUndefined();
    else expect(final.traverses[item.uuid]).toBeUndefined();
  }
  await expect(planningEvaRow(page, "Survey Alpha")).toHaveCount(0);
  await mission.open(page);
  await openPlanningSection(page, "evas");
  await expect(planningEvaRow(page, "Survey Alpha")).toHaveCount(0);
  await expect(planningEvaRow(page, "Survey Bravo")).toHaveCount(1);
  await observeDocumentChanges(page);
  expect((await observedDocuments(page))[0]).toEqual(final);
});
