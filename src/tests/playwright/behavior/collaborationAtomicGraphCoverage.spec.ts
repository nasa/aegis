import type { BrowserContext, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import {
  enablePlanningEditMode,
  openPlanningSection,
  selectPlanningEva,
  choosePlanningEvaAction,
} from "./planningHelpers";

function assertGraphReferencesAreClosed(doc: Mission): void {
  for (const eva of Object.values(doc.evas)) {
    for (const item of eva.sequence) {
      if (item.type === "station") expect(doc.stations[item.uuid]).toBeDefined();
      else expect(doc.traverses[item.uuid]).toBeDefined();
    }
  }
  for (const station of Object.values(doc.stations)) {
    for (const actionUuid of station.actionOrderUuids ?? []) {
      expect(doc.actions[actionUuid]).toMatchObject({ stationUuid: station.uuid });
    }
  }
  for (const action of Object.values(doc.actions)) {
    if (action.stationUuid) expect(doc.stations[action.stationUuid]).toBeDefined();
    if (action.traverseUuid) expect(doc.traverses[action.traverseUuid]).toBeDefined();
  }
  for (const rex of Object.values(doc.rexes)) expect(doc.evas[rex.evaUuid]).toBeDefined();
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

    const snapshots: Mission[] = [await mission.read()];
    const sampler = (async () => {
      while (true) {
        const snapshot = await mission.read();
        snapshots.push(snapshot);
        if (Object.values(snapshot.evas).some((eva) => eva.name === "Survey Alpha (copy 1)")) {
          break;
        }
      }
    })();
    peer.once("dialog", (dialog) => dialog.accept());
    await choosePlanningEvaAction(peer, "Survey Alpha", "Duplicate w/ Stations");
    await expect
      .poll(async () => Object.keys((await mission.read()).evas).length)
      .toBe(Object.keys(before.evas).length + 1);
    await sampler;

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
