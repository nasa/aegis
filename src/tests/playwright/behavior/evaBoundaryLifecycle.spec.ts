import { randomUUID } from "node:crypto";
import { test, expect } from "../fixtures/behavioralTest";
import { seedAction, seedStation } from "../fixtures/entitySeeds";
import { installMapObserver, readMapFeatures } from "../fixtures/mapAssertions";
import { enablePlanningEditMode, planningEvaRow, selectPlanningEva } from "./planningHelpers";

test.describe("EVA sequence boundary lifecycle", () => {
  for (const role of ["egress", "ingress"] as const) {
    test(`switches ${role} from managed lander copy to a regular station and back`, async ({
      page,
      context,
      mission,
    }) => {
      const before = await mission.read();
      const stationId = randomUUID();
      const stationRef = randomUUID();
      const oldEndpointUuid = role === "egress" ? mission.ids.egressA : mission.ids.ingressA;
      const oldEndpointActionUuid = randomUUID();
      const targetActionUuid = randomUUID();
      const location = { lat: 0.0018, lng: 0.004 };
      await mission.change((doc) => {
        doc.stations[stationId] = seedStation({
          ...before.stations[mission.ids.stationA],
          uuid: stationId,
          refUuid: stationRef,
          name: "Endpoint switch target",
          location,
          actionOrderUuids: [targetActionUuid],
          poiUuids: [],
        });
        doc.stations[oldEndpointUuid].actionOrderUuids = [oldEndpointActionUuid];
        doc.actions[oldEndpointActionUuid] = seedAction({
          ...before.actions[mission.ids.actionA],
          uuid: oldEndpointActionUuid,
          refUuid: randomUUID(),
          name: `${role} lander-owned action`,
          stationUuid: oldEndpointUuid,
        });
        doc.actions[targetActionUuid] = seedAction({
          ...before.actions[mission.ids.actionA],
          uuid: targetActionUuid,
          refUuid: randomUUID(),
          name: `${role} target-owned action`,
          stationUuid: stationId,
        });
      });
      const arranged = await mission.read();
      await mission.open(page);
      await enablePlanningEditMode(page);
      await selectPlanningEva(page, "Survey Alpha");
      const peer = await context.newPage();
      await mission.open(peer);
      await selectPlanningEva(peer, "Survey Alpha");

      const row = planningEvaRow(page, "Survey Alpha");
      // The pinned ingress is the last of the four station selectors in edit mode.
      const position = role === "egress" ? 0 : 3;
      const endpointSelect = row.getByRole("combobox").nth(position);
      const boundaryTraverseUuid =
        role === "egress" ? mission.ids.traverseOutbound : mission.ids.traverseReturn;

      await endpointSelect.selectOption(stationId);
      await expect
        .poll(
          async () =>
            (await mission.read()).evas[mission.ids.evaA].sequence[
              role === "egress"
                ? 0
                : (await mission.read()).evas[mission.ids.evaA].sequence.length - 1
            ].uuid
        )
        .toBe(stationId);
      await expect
        .poll(async () => (await mission.read()).stations[oldEndpointUuid])
        .toBeUndefined();
      await expect
        .poll(async () => (await mission.read()).actions[oldEndpointActionUuid])
        .toBeUndefined();
      await expect
        .poll(async () => (await mission.read()).actions[targetActionUuid])
        .toEqual(arranged.actions[targetActionUuid]);
      await expect
        .poll(async () => {
          const traverse = (await mission.read()).traverses[boundaryTraverseUuid];
          return role === "egress" ? traverse.path[0] : traverse.path.at(-1);
        })
        .toEqual(location);

      // The managed Lander option is kept at the same edge position in the native select.
      await endpointSelect.selectOption("lander");
      await expect
        .poll(async () => {
          const graph = await mission.read();
          const endpoint =
            graph.evas[mission.ids.evaA].sequence[
              role === "egress" ? 0 : graph.evas[mission.ids.evaA].sequence.length - 1
            ];
          return graph.stations[endpoint.uuid]?.isLanderXgress;
        })
        .toBe(true);
      await expect
        .poll(async () => {
          const graph = await mission.read();
          const endpoint =
            graph.evas[mission.ids.evaA].sequence[
              role === "egress" ? 0 : graph.evas[mission.ids.evaA].sequence.length - 1
            ];
          return graph.stations[endpoint.uuid]?.location;
        })
        .toEqual(arranged.landerLocation);

      const after = await mission.read();
      expect(after.stations[stationId]).toEqual(arranged.stations[stationId]);
      const expectedActions = { ...arranged.actions };
      delete expectedActions[oldEndpointActionUuid];
      expect(after.actions).toEqual(expectedActions);
      expect(after.folders).toEqual(arranged.folders);
      expect(after.pois).toEqual(arranged.pois);
      expect(after.evas[mission.ids.evaB]).toEqual(arranged.evas[mission.ids.evaB]);
      for (const traverseId of [
        mission.ids.traverseA,
        mission.ids.traverseB,
        mission.ids.traverseBReturn,
      ]) {
        expect(after.traverses[traverseId]).toEqual(arranged.traverses[traverseId]);
      }
      for (const client of [page, peer]) {
        await mission.open(client);
        await enablePlanningEditMode(client);
        await selectPlanningEva(client, "Survey Alpha");
        await expect(planningEvaRow(client, "Survey Alpha").getByAltText("Lander")).toHaveCount(2);
        await expect(
          planningEvaRow(client, "Survey Alpha").getByRole("combobox").first()
        ).toHaveValue("lander");
        await expect(
          planningEvaRow(client, "Survey Alpha").getByRole("combobox").last()
        ).toHaveValue("lander");
      }
    });
  }

  test("Add Station creates an explicit empty selector without substituting a station", async ({
    page,
    context,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningEva(page, "Survey Alpha");
    const peer = await context.newPage();
    await installMapObserver(peer);
    await mission.open(peer);
    await selectPlanningEva(peer, "Survey Alpha");

    await page.getByLabel("Add Station", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).evas[mission.ids.evaA].sequence.length)
      .toBe(before.evas[mission.ids.evaA].sequence.length + 2);
    const afterAdd = await mission.read();
    const sequence = afterAdd.evas[mission.ids.evaA].sequence;
    const emptyIndex = sequence.findIndex((item) => item.type === "station" && item.uuid === "");
    expect(emptyIndex).toBe(sequence.length - 3);
    expect(sequence[emptyIndex + 1].type).toBe("traverse");
    expect(afterAdd.traverses[sequence[emptyIndex + 1].uuid]).toBeDefined();
    expect(Object.keys(afterAdd.stations).sort()).toEqual(Object.keys(before.stations).sort());

    for (const client of [page, peer]) {
      await mission.open(client);
      await selectPlanningEva(client, "Survey Alpha");
      await expect(
        planningEvaRow(client, "Survey Alpha").getByText("< Station not selected >", {
          exact: true,
        })
      ).toBeVisible();
      await enablePlanningEditMode(client);
      const stationSelectors = planningEvaRow(client, "Survey Alpha").getByRole("combobox");
      await expect(stationSelectors).toHaveCount(5);
      await expect(stationSelectors.nth(3)).toHaveValue("");
    }

    // Convert the empty supported slot into a well-formed but unresolved reference
    // to exercise old/imported graphs that point to a missing station record.
    const unresolvedStationUuid = randomUUID();
    await mission.change((doc) => {
      doc.evas[mission.ids.evaA].sequence[emptyIndex].uuid = unresolvedStationUuid;
    });
    const unresolved = await mission.read();
    expect(unresolved.stations[unresolvedStationUuid]).toBeUndefined();
    expect(unresolved.evas[mission.ids.evaA].sequence[emptyIndex].uuid).toBe(unresolvedStationUuid);

    for (const client of [page, peer]) {
      await mission.open(client);
      await selectPlanningEva(client, "Survey Alpha");
      await expect(
        planningEvaRow(client, "Survey Alpha").getByText("< Station not selected >", {
          exact: true,
        })
      ).toBeVisible();
      await client.getByLabel("report_panel", { exact: true }).click();
      await expect(client.getByText(/^EVA Report/)).toBeVisible();
      await expect(client.locator(".ol-viewport")).toHaveCount(1);
      const features = await readMapFeatures(client);
      expect(features.some((feature) => feature.id === unresolvedStationUuid)).toBe(false);
      expect(
        features.filter((feature) => feature.layerZIndex === 14).map((feature) => feature.id)
      ).not.toContain(unresolvedStationUuid);
    }

    expect((await mission.read()).evas[mission.ids.evaA].sequence[emptyIndex].uuid).toBe(
      unresolvedStationUuid
    );
    expect(unresolved.evas[mission.ids.evaA].sequence).toHaveLength(sequence.length);
  });
});
