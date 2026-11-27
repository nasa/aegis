import { test, expect } from "../fixtures/behavioralTest";
import {
  enablePlanningEditMode,
  planningEvaRow,
  savePlanningField,
  selectPlanningEva,
  selectPlanningStation,
} from "./planningHelpers";

test.describe("Station graph boundaries", () => {
  test("renaming connected traverse endpoints from two clients synchronizes every label", async ({
    page,
    context,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    const peer = await context.newPage();
    await mission.open(peer);
    await enablePlanningEditMode(peer);
    await selectPlanningStation(page, "Alpha station");
    await selectPlanningStation(peer, "Bravo station");
    const changes = [
      { client: page, name: "Eastern ridge", id: mission.ids.stationA },
      { client: peer, name: "Western crater", id: mission.ids.stationB },
    ];
    for (const { client, name, id } of changes) {
      await savePlanningField(client, "Station", name);
      await expect.poll(async () => (await mission.read()).stations[id].name).toBe(name);
      // Make the other endpoint's next Save use the synchronized graph.
      for (const observer of [page, peer]) {
        await expect(
          observer.getByLabel("stationList-item").getByText(name, { exact: true })
        ).toHaveCount(1);
      }
      const alpha = "Eastern ridge";
      const bravo = id === mission.ids.stationB ? "Western crater" : "Bravo station";
      await expect
        .poll(async () => (await mission.read()).traverses[mission.ids.traverseA].name)
        .toBe(`${alpha} to ${bravo}`);
    }
    const expectedNames = {
      [mission.ids.traverseOutbound]: "Lander Egress to Eastern ridge",
      [mission.ids.traverseA]: "Eastern ridge to Western crater",
      [mission.ids.traverseReturn]: "Western crater to Lander Ingress",
      [mission.ids.traverseB]: "Lander Egress to Western crater",
      [mission.ids.traverseBReturn]: "Western crater to Lander Ingress",
    };
    const after = await mission.read();
    for (const [id, name] of Object.entries(expectedNames)) {
      expect(after.traverses[id]).toEqual({
        ...before.traverses[id],
        name,
        updatedAt: expect.any(Number),
      });
      expect(after.traverses[id].updatedAt).toBeGreaterThan(before.traverses[id].updatedAt);
    }
    expect(after.evas).toEqual(before.evas);
    expect(after.actions).toEqual(before.actions);
    expect(after.folders).toEqual(before.folders);
    for (const client of [page, peer]) {
      await mission.open(client);
      await selectPlanningEva(client, "Survey Alpha");
      const alphaRow = planningEvaRow(client, "Survey Alpha");
      for (const name of [
        expectedNames[mission.ids.traverseOutbound],
        expectedNames[mission.ids.traverseA],
        expectedNames[mission.ids.traverseReturn],
      ]) {
        await expect(alphaRow.getByText(name, { exact: true })).toBeVisible();
      }
      await selectPlanningEva(client, "Survey Bravo");
      for (const id of [mission.ids.traverseB, mission.ids.traverseBReturn]) {
        await expect(
          planningEvaRow(client, "Survey Bravo").getByText(expectedNames[id], { exact: true })
        ).toBeVisible();
      }
    }
  });

  test("a saved manual station dwell reaches the open peer itinerary and persists", async ({
    page,
    context,
    mission,
  }) => {
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Alpha station");
    await page.getByLabel("info_panel", { exact: true }).click();
    const peer = await context.newPage();
    await mission.open(peer);
    await selectPlanningEva(peer, "Survey Alpha");
    const dwell = planningEvaRow(peer, "Survey Alpha")
      .locator('[class*="evaItem_"]')
      .filter({ has: peer.getByText("Alpha station", { exact: true }) })
      .locator('[data-tooltip-content="Total dwell time (h:mm)"]');
    await expect(dwell).toHaveText("0:15");
    await savePlanningField(page, "Time in minutes", "21");
    await expect(dwell).toHaveText("0:21");
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].duration)
      .toBe(21);
    await mission.open(peer);
    await selectPlanningEva(peer, "Survey Alpha");
    await expect(dwell).toHaveText("0:21");
  });
});
