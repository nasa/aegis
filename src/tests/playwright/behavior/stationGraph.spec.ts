import { randomUUID } from "node:crypto";
import { test, expect } from "../fixtures/behavioralTest";
import { seedAction } from "../fixtures/entitySeeds";
import {
  cancelPlanningField,
  enablePlanningEditMode,
  openPlanningField,
  openPlanningSection,
  planningEvaRow,
  planningField,
  savePlanningField,
  selectPlanningEva,
  selectPlanningStation,
} from "./planningHelpers";

test.describe("Station graph boundaries", () => {
  for (const order of ["Alpha then Bravo", "Bravo then Alpha"] as const) {
    test(`renaming traverse endpoints ${order} from two clients updates every connected label`, async ({
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
      if (order === "Bravo then Alpha") changes.reverse();
      for (const { client, name, id } of changes) {
        await savePlanningField(client, "Station", name);
        await expect.poll(async () => (await mission.read()).stations[id].name).toBe(name);
        // Make the other endpoint's next Save use the synchronized graph.
        for (const observer of [page, peer]) {
          await expect(
            observer.getByLabel("stationList-item").getByText(name, { exact: true })
          ).toHaveCount(1);
        }
        const alpha =
          id === mission.ids.stationA || order === "Alpha then Bravo"
            ? "Eastern ridge"
            : "Alpha station";
        const bravo =
          id === mission.ids.stationB || order === "Bravo then Alpha"
            ? "Western crater"
            : "Bravo station";
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
  }

  test("canceling deletion of an unassigned station preserves its actions and folder membership", async ({
    page,
    context,
    mission,
  }) => {
    const original = await mission.read();
    const stationId = randomUUID();
    const actionId = randomUUID();
    await mission.change((doc) => {
      doc.stations[stationId] = {
        ...original.stations[mission.ids.stationA],
        uuid: stationId,
        refUuid: randomUUID(),
        name: "Unassigned cancellation site",
        actionOrderUuids: [actionId],
      };
      doc.actions[actionId] = {
        ...original.actions[mission.ids.actionA],
        uuid: actionId,
        refUuid: randomUUID(),
        stationUuid: stationId,
      };
      doc.folders[mission.ids.folderA].items.push(stationId);
    });
    const before = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Unassigned cancellation site");
    const peer = await context.newPage();
    await mission.open(peer);
    await selectPlanningStation(peer, "Unassigned cancellation site");
    const confirmation = page.waitForEvent("dialog");
    const click = page.getByLabel("deleteStation", { exact: true }).click();
    const dialog = await confirmation;
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toBe("Are you sure you want to delete this Station?");
    await dialog.dismiss();
    await click;
    expect(await mission.read()).toEqual(before);
    for (const client of [page, peer]) {
      await mission.open(client);
      await selectPlanningStation(client, "Unassigned cancellation site");
      await client.getByLabel("actions_panel", { exact: true }).click();
      await expect(client.getByText("Sample regolith", { exact: true })).toBeVisible();
    }
    expect(await mission.read()).toEqual(before);
  });

  for (const endpoint of ["egress", "ingress"] as const) {
    test(`direct deletion of a managed lander ${endpoint} is rejected without altering the graph`, async ({
      page,
      mission,
    }) => {
      const before = await mission.read();
      await mission.open(page);
      await enablePlanningEditMode(page);
      await selectPlanningEva(page, "Survey Alpha");
      await planningEvaRow(page, "Survey Alpha")
        .getByAltText("Lander", { exact: true })
        .nth(endpoint === "egress" ? 0 : 1)
        .click();
      await expect(planningField(page, "Station")).toHaveText(
        endpoint === "egress" ? "Lander Egress" : "Lander Ingress"
      );
      const messages: string[] = [];
      page.on("dialog", async (dialog) => {
        messages.push(dialog.message());
        await dialog.accept();
      });
      await page.getByLabel("deleteStation", { exact: true }).click();
      await expect
        .poll(() => messages)
        .toEqual([
          "Are you sure you want to delete this Station?",
          "Cannot delete an EVA's egress or ingress location directly.\nStation not deleted.\n" +
            "Change the EVA's egress/ingress location instead.",
        ]);
      expect(await mission.read()).toEqual(before);
      await mission.open(page);
      await openPlanningSection(page, "evas");
      await selectPlanningEva(page, "Survey Alpha");
      await expect(planningEvaRow(page, "Survey Alpha").getByAltText("Lander")).toHaveCount(2);
      expect(await mission.read()).toEqual(before);
    });
  }

  for (const unassigned of [false, true]) {
    test(`manual station dwell overrides calculated crew time ${unassigned ? "with" : "without"} unassigned actions`, async ({
      page,
      context,
      mission,
    }) => {
      const crewTasks: Pick<Action, "duration" | "crewAssigned" | "enabled">[] = [
        { duration: 10, crewAssigned: ["EV1"], enabled: true },
        { duration: 7, crewAssigned: ["EV2"], enabled: true },
        { duration: 3, crewAssigned: unassigned ? [] : ["EV2"], enabled: true },
        { duration: 90, crewAssigned: [], enabled: false },
      ];
      await mission.change((doc) => {
        const ids = crewTasks.map((_, index) => `60000000-0000-4000-8000-00000000000${index}`);
        doc.actions = {};
        crewTasks.forEach((task, index) => {
          doc.actions[ids[index]] = seedAction({
            ...task,
            uuid: ids[index],
            refUuid: ids[index],
            stationUuid: mission.ids.stationA,
            name: `Dwell task ${index}`,
          });
        });
        doc.stations[mission.ids.stationA].actionOrderUuids = ids;
      });
      const before = await mission.read();
      await mission.open(page);
      await enablePlanningEditMode(page);
      await selectPlanningStation(page, "Alpha station");
      await page.getByLabel("info_panel", { exact: true }).click();
      const peer = await context.newPage();
      await mission.open(peer);
      await selectPlanningEva(peer, "Survey Alpha");
      const sequenceDwell = planningEvaRow(peer, "Survey Alpha")
        .locator('[class*="evaItem_"]')
        .filter({ has: peer.getByText("Alpha station", { exact: true }) })
        .locator('[data-tooltip-content="Total dwell time (h:mm)"]');
      await expect(sequenceDwell).toHaveText("0:15");
      const total = (label: string) =>
        page
          .getByText(label, { exact: true })
          .locator("../..")
          .locator('[class*="displayFieldValue"]');
      await expect(total("Action Time (mins):")).toHaveText("20");
      await expect(total("Dwell Time (mins):")).toHaveText("10");
      if (unassigned) {
        await expect(total("Dwell Time (mins):")).toHaveAttribute(
          "data-tooltip-content",
          "Crew assignments incomplete"
        );
      } else {
        await expect(total("Dwell Time (mins):")).not.toHaveAttribute("data-tooltip-content");
      }
      const clear = await openPlanningField(page, "Time in minutes");
      await clear.getByLabel("Time in minutes", { exact: true }).fill("");
      await clear.getByText("Save", { exact: true }).click();
      await expect(clear).toHaveCount(0);
      await expect
        .poll(async () => (await mission.read()).stations[mission.ids.stationA].duration)
        .toBeNull();
      await expect(
        page.getByText("Using Calculated Total Dwell Time: 10", { exact: true })
      ).toBeVisible();
      await expect(sequenceDwell).toHaveText("0:10");
      await cancelPlanningField(page, "Time in minutes", "35");
      await expect(sequenceDwell).toHaveText("0:10");
      await savePlanningField(page, "Time in minutes", "21");
      await expect(sequenceDwell).toHaveText("0:21");
      await expect(
        page.getByText("Using Calculated Total Dwell Time: 10", { exact: true })
      ).toHaveCount(0);
      await expect(total("Dwell Time (mins):")).toHaveText("10");
      await page.getByLabel("report_panel", { exact: true }).click();
      const warning = page.getByText(
        "Station has actions with no crew assigned. Dwell time calculation is incorrect",
        { exact: true }
      );
      if (unassigned) await expect(warning).toBeVisible();
      else await expect(warning).toHaveCount(0);
      const after = await mission.read();
      expect(after.stations[mission.ids.stationA].duration).toBe(21);
      expect(after.actions).toEqual(before.actions);
      expect(after.evas).toEqual(before.evas);
      expect(after.traverses).toEqual(before.traverses);
      expect(after.folders).toEqual(before.folders);
      await mission.open(page);
      await selectPlanningStation(page, "Alpha station");
      await page.getByLabel("info_panel", { exact: true }).click();
      await expect(planningField(page, "Time in minutes")).toHaveText("21");
      await mission.open(peer);
      await selectPlanningEva(peer, "Survey Alpha");
      await expect(sequenceDwell).toHaveText("0:21");
      expect(await mission.read()).toEqual(after);
    });
  }
});
