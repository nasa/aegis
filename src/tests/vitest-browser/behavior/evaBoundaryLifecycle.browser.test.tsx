import { v4 as randomUUID } from "uuid";
import { test, expect } from "./missionHarness";
import { seedAction, seedStation } from "tests/playwright/fixtures/entitySeeds";
import { readMapFeatures } from "./mapObserver";
import { enablePlanningEditMode, planningEvaRow, selectPlanningEva } from "./planningHelpers";

test.describe("EVA sequence boundary lifecycle", () => {
  for (const role of ["egress", "ingress"] as const) {
    test(`switches ${role} from managed lander copy to a regular station and back`, async ({
      page,
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
      await mission.open();
      await enablePlanningEditMode(page);
      await selectPlanningEva(page, "Survey Alpha");

      const row = planningEvaRow(page, "Survey Alpha");
      // The pinned ingress is the last of the four station selectors in edit mode.
      const position = role === "egress" ? 0 : 3;
      const endpointSelect = row.getByRole("combobox").nth(position);
      const boundaryTraverseUuid =
        role === "egress" ? mission.ids.traverseOutbound : mission.ids.traverseReturn;

      await endpointSelect.selectOptions(stationId);
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
      await endpointSelect.selectOptions("lander");
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

      await mission.open();
      await enablePlanningEditMode(page);
      await selectPlanningEva(page, "Survey Alpha");
      await expect
        .poll(() => planningEvaRow(page, "Survey Alpha").getByAltText("Lander").length)
        .toBe(2);
      await expect
        .element(planningEvaRow(page, "Survey Alpha").getByRole("combobox").first())
        .toHaveValue("lander");
      await expect
        .element(planningEvaRow(page, "Survey Alpha").getByRole("combobox").last())
        .toHaveValue("lander");
    });
  }

  test("Add Station creates an explicit empty selector without substituting a station", async ({
    page,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open();
    await enablePlanningEditMode(page);
    await selectPlanningEva(page, "Survey Alpha");

    await page.getByLabelText("Add Station", { exact: true }).click();
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

    await mission.open();
    await selectPlanningEva(page, "Survey Alpha");
    await expect
      .element(
        planningEvaRow(page, "Survey Alpha").getByText("< Station not selected >", {
          exact: true,
        })
      )
      .toBeVisible();
    await enablePlanningEditMode(page);
    const stationSelectors = planningEvaRow(page, "Survey Alpha").getByRole("combobox");
    await expect.poll(() => stationSelectors.length).toBe(5);
    await expect.element(stationSelectors.nth(3)).toHaveValue("");

    // Convert the empty supported slot into a well-formed but unresolved reference
    // to exercise old/imported graphs that point to a missing station record.
    const unresolvedStationUuid = randomUUID();
    await mission.change((doc) => {
      doc.evas[mission.ids.evaA].sequence[emptyIndex].uuid = unresolvedStationUuid;
    });
    const unresolved = await mission.read();
    expect(unresolved.stations[unresolvedStationUuid]).toBeUndefined();
    expect(unresolved.evas[mission.ids.evaA].sequence[emptyIndex].uuid).toBe(unresolvedStationUuid);

    await mission.open();
    await selectPlanningEva(page, "Survey Alpha");
    await expect
      .element(
        planningEvaRow(page, "Survey Alpha").getByText("< Station not selected >", {
          exact: true,
        })
      )
      .toBeVisible();
    await page.getByLabelText("report_panel", { exact: true }).click();
    await expect.element(page.getByText(/^EVA Report/)).toBeVisible();
    await expect.poll(() => page.getBySelector(".ol-viewport").length).toBe(1);
    const features = await readMapFeatures();
    expect(features.some((feature) => feature.id === unresolvedStationUuid)).toBe(false);
    expect(
      features.filter((feature) => feature.layerZIndex === 14).map((feature) => feature.id)
    ).not.toContain(unresolvedStationUuid);

    expect((await mission.read()).evas[mission.ids.evaA].sequence[emptyIndex].uuid).toBe(
      unresolvedStationUuid
    );
    expect(unresolved.evas[mission.ids.evaA].sequence).toHaveLength(sequence.length);
  });
});
