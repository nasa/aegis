import { vi } from "vitest";
import { exactText } from "./browserAssertions";
import { v4 as randomUUID } from "uuid";
import { test, expect } from "./missionHarness";
import { seedAction } from "tests/playwright/fixtures/entitySeeds";
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
    test(`renaming traverse endpoints ${order} updates every connected label through native controls`, async ({
      page,
      mission,
    }) => {
      const before = await mission.read();
      await mission.open();
      await enablePlanningEditMode(page);
      await selectPlanningStation(page, "Alpha station");
      const changes = [
        { client: page, name: "Eastern ridge", id: mission.ids.stationA },
        { client: page, name: "Western crater", id: mission.ids.stationB },
      ];
      if (order === "Bravo then Alpha") changes.reverse();
      for (const { client, name, id } of changes) {
        await selectPlanningStation(client, (await mission.read()).stations[id].name);
        await savePlanningField(client, "Station", name);
        await expect.poll(async () => (await mission.read()).stations[id].name).toBe(name);
        // Make the other endpoint's next Save use the synchronized graph.
        for (const observer of [page]) {
          await expect
            .poll(
              () =>
                observer.getByLabelText("stationList-item").getByText(name, { exact: true }).length
            )
            .toBe(1);
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

      await mission.open();
      await selectPlanningEva(page, "Survey Alpha");
      const alphaRow = planningEvaRow(page, "Survey Alpha");
      for (const name of [
        expectedNames[mission.ids.traverseOutbound],
        expectedNames[mission.ids.traverseA],
        expectedNames[mission.ids.traverseReturn],
      ]) {
        await expect.element(alphaRow.getByText(name, { exact: true })).toBeVisible();
      }
      await selectPlanningEva(page, "Survey Bravo");
      for (const id of [mission.ids.traverseB, mission.ids.traverseBReturn]) {
        await expect
          .element(
            planningEvaRow(page, "Survey Bravo").getByText(expectedNames[id], { exact: true })
          )
          .toBeVisible();
      }
    });
  }

  test("canceling deletion of an unassigned station preserves its actions and folder membership", async ({
    page,
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
    await mission.open();
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Unassigned cancellation site");
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await page.getByLabelText("deleteStation", { exact: true }).click();
    expect(confirm).toHaveBeenCalledExactlyOnceWith(
      "Are you sure you want to delete this Station?"
    );
    expect(await mission.read()).toEqual(before);

    await mission.open();
    await selectPlanningStation(page, "Unassigned cancellation site");
    await page.getByLabelText("actions_panel", { exact: true }).click();
    await expect.element(page.getByText("Sample regolith", { exact: true })).toBeVisible();

    expect(await mission.read()).toEqual(before);
  });

  for (const endpoint of ["egress", "ingress"] as const) {
    test(`direct deletion of a managed lander ${endpoint} is rejected without altering the graph`, async ({
      page,
      mission,
    }) => {
      const before = await mission.read();
      await mission.open();
      await enablePlanningEditMode(page);
      await selectPlanningEva(page, "Survey Alpha");
      await planningEvaRow(page, "Survey Alpha")
        .getByAltText("Lander", { exact: true })
        .nth(endpoint === "egress" ? 0 : 1)
        .click();
      await expect
        .element(planningField(page, "Station"))
        .toHaveTextContent(exactText(endpoint === "egress" ? "Lander Egress" : "Lander Ingress"));
      const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(true);
      const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
      await page.getByLabelText("deleteStation", { exact: true }).click();
      expect(confirm).toHaveBeenCalledExactlyOnceWith(
        "Are you sure you want to delete this Station?"
      );
      expect(alert).toHaveBeenCalledExactlyOnceWith(
        "Cannot delete an EVA's egress or ingress location directly.\nStation not deleted.\n" +
          "Change the EVA's egress/ingress location instead."
      );
      expect(await mission.read()).toEqual(before);
      await mission.open();
      await openPlanningSection(page, "evas");
      await selectPlanningEva(page, "Survey Alpha");
      await expect
        .poll(() => planningEvaRow(page, "Survey Alpha").getByAltText("Lander").length)
        .toBe(2);
      expect(await mission.read()).toEqual(before);
    });
  }

  for (const unassigned of [false, true]) {
    test(`manual station dwell overrides calculated crew time ${unassigned ? "with" : "without"} unassigned actions`, async ({
      page,
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
      await mission.open();
      await enablePlanningEditMode(page);
      await selectPlanningStation(page, "Alpha station");
      await page.getByLabelText("info_panel", { exact: true }).click();
      const expectSequenceDwell = async (value: string) => {
        const edit = page.getByLabelText("globalEditToggle", { exact: true });
        if (edit.element().getAttribute("data-tooltip-content") === "Turn Off Edit Mode") {
          await edit.click();
        }
        await selectPlanningEva(page, "Survey Alpha");
        const sequenceDwell = planningEvaRow(page, "Survey Alpha")
          .getBySelector('[class*="evaItem_"]')
          .filter({ has: page.getByText("Alpha station", { exact: true }) })
          .getBySelector('[data-tooltip-content="Total dwell time (h:mm)"]');
        await expect.element(sequenceDwell).toHaveTextContent(exactText(value));
        await selectPlanningStation(page, "Alpha station");
        await enablePlanningEditMode(page);
        await page.getByLabelText("info_panel", { exact: true }).click();
      };
      await expectSequenceDwell("0:15");
      const total = (label: string) =>
        page
          .getByText(label, { exact: true })
          .getBySelector("../..")
          .getBySelector('[class*="displayFieldValue"]');
      await expect.element(total("Action Time (mins):")).toHaveTextContent(exactText("20"));
      await expect.element(total("Dwell Time (mins):")).toHaveTextContent(exactText("10"));
      if (unassigned) {
        await expect
          .element(total("Dwell Time (mins):"))
          .toHaveAttribute("data-tooltip-content", "Crew assignments incomplete");
      } else {
        await expect
          .element(total("Dwell Time (mins):"))
          .not.toHaveAttribute("data-tooltip-content");
      }
      const clear = await openPlanningField(page, "Time in minutes");
      await clear.getByLabelText("Time in minutes", { exact: true }).fill("");
      await clear.getByText("Save", { exact: true }).click();
      await expect.poll(() => clear.length).toBe(0);
      await expect
        .poll(async () => (await mission.read()).stations[mission.ids.stationA].duration)
        .toBeNull();
      await expect
        .element(page.getByText("Using Calculated Total Dwell Time: 10", { exact: true }))
        .toBeVisible();
      await expectSequenceDwell("0:10");
      await cancelPlanningField(page, "Time in minutes", "35");
      await expectSequenceDwell("0:10");
      await savePlanningField(page, "Time in minutes", "21");
      await expectSequenceDwell("0:21");
      await expect
        .poll(() => page.getByText("Using Calculated Total Dwell Time: 10", { exact: true }).length)
        .toBe(0);
      await expect.element(total("Dwell Time (mins):")).toHaveTextContent(exactText("10"));
      await page.getByLabelText("report_panel", { exact: true }).click();
      const warning = page.getByText(
        "Station has actions with no crew assigned. Dwell time calculation is incorrect",
        { exact: true }
      );
      if (unassigned) await expect.element(warning).toBeVisible();
      else await expect.poll(() => warning.length).toBe(0);
      const after = await mission.read();
      expect(after.stations[mission.ids.stationA].duration).toBe(21);
      expect(after.actions).toEqual(before.actions);
      expect(after.evas).toEqual(before.evas);
      expect(after.traverses).toEqual(before.traverses);
      expect(after.folders).toEqual(before.folders);
      await mission.open();
      await selectPlanningStation(page, "Alpha station");
      await page.getByLabelText("info_panel", { exact: true }).click();
      await expect
        .element(planningField(page, "Time in minutes"))
        .toHaveTextContent(exactText("21"));
      await mission.open();
      await selectPlanningEva(page, "Survey Alpha");
      await expectSequenceDwell("0:21");
      expect(await mission.read()).toEqual(after);
    });
  }
});
