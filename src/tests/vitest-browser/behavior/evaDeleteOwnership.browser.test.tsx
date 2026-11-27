import { vi } from "vitest";
import { exactText, isVisible } from "./browserAssertions";
import type { BrowserPage as Page } from "vitest/browser";
import { test as base, expect } from "./missionHarness";
import { enablePlanningEditMode, planningEvaRow, planningField } from "./planningHelpers";

const test = base.extend({ scenario: "execution" as BehavioralScenario });

async function selectPlannedAlpha(page: Page): Promise<void> {
  await page.getByLabelText("evas Section", { exact: true }).click();
  const showAll = page.getByLabelText("Show All EVAs", { exact: true });
  if (isVisible(showAll)) await showAll.click();
  await planningEvaRow(page, "Survey Alpha")
    .getByText("Survey Alpha", { exact: true })
    .first()
    .click();
  await expect
    .element(planningField(page, "EVA Title"))
    .toMatchTextContent(exactText("Survey Alpha"));
}

test.describe("EVA confirmation and ownership graph", () => {
  test("canceling duplicate and delete preserves the graph; confirmation deletes only one plan and its REX family", async ({
    page,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open();
    await enablePlanningEditMode(page);
    await selectPlannedAlpha(page);

    await planningEvaRow(page, "Survey Alpha")
      .getBySelector('svg[data-icon="ellipsis-vertical"]')
      .click();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await page
      .getBySelector("dialog[open]")
      .getByText("Duplicate w/ Stations", { exact: true })
      .click();
    expect(confirm).toHaveBeenLastCalledWith(
      expect.stringContaining("duplicate the EVA and also make duplicates")
    );
    expect(await mission.read()).toEqual(before);

    confirm.mockReturnValueOnce(false);
    await page.getByLabelText("deleteEva", { exact: true }).click();
    const message =
      "Are you sure you want to delete this EVA?\n" +
      "WARNING: This EVA has REXes. Deleting this EVA will delete ALL REXes in this EVA.";
    expect(confirm).toHaveBeenLastCalledWith(message);
    expect(await mission.read()).toEqual(before);

    confirm.mockReturnValueOnce(true);
    await page.getByLabelText("deleteEva", { exact: true }).click();
    expect(confirm).toHaveBeenLastCalledWith(message);

    const after = await mission.read();
    const deletedEvas = [mission.ids.evaA, mission.ids.rexEvaA];
    const deletedRexes = [mission.ids.rexA];
    const deletedStations = [
      mission.ids.egressA,
      mission.ids.ingressA,
      mission.ids.rexEgressA,
      mission.ids.rexStationA,
      mission.ids.rexStationABravo,
      mission.ids.rexIngressA,
    ];
    const deletedTraverses = [
      mission.ids.traverseOutbound,
      mission.ids.traverseA,
      mission.ids.traverseReturn,
      mission.ids.rexTraverseOutbound,
      mission.ids.rexTraverseA,
      mission.ids.rexTraverseReturn,
    ];
    const deletedActions = [mission.ids.rexActionA];
    for (const uuid of deletedEvas) expect(after.evas[uuid]).toBeUndefined();
    for (const uuid of deletedRexes) expect(after.rexes[uuid]).toBeUndefined();
    for (const uuid of deletedStations) expect(after.stations[uuid]).toBeUndefined();
    for (const uuid of deletedTraverses) expect(after.traverses[uuid]).toBeUndefined();
    for (const uuid of deletedActions) expect(after.actions[uuid]).toBeUndefined();

    // Shared planned station B and the other EVA's complete execution graph survive.
    expect(after.stations[mission.ids.stationB]).toEqual(before.stations[mission.ids.stationB]);
    expect(after.actions[mission.ids.actionA]).toEqual(before.actions[mission.ids.actionA]);
    expect(after.evas[mission.ids.evaB]).toEqual(before.evas[mission.ids.evaB]);
    expect(after.evas[mission.ids.rexEvaB]).toEqual(before.evas[mission.ids.rexEvaB]);
    expect(after.rexes[mission.ids.rexB]).toEqual(before.rexes[mission.ids.rexB]);
    expect(after.stations[mission.ids.rexStationB]).toEqual(
      before.stations[mission.ids.rexStationB]
    );
    expect(after.traverses[mission.ids.traverseB]).toEqual(before.traverses[mission.ids.traverseB]);
    expect(after.traverses[mission.ids.rexTraverseB]).toEqual(
      before.traverses[mission.ids.rexTraverseB]
    );
    expect(after.actions).toEqual({ [mission.ids.actionA]: before.actions[mission.ids.actionA] });
    expect(after.folders).toEqual(before.folders);

    await mission.open();
    const showAll = page.getByLabelText("Show All EVAs", { exact: true });
    if (isVisible(showAll)) await showAll.click();
    await expect.element(planningEvaRow(page, "Survey Bravo")).toBeVisible();
    await expect.poll(() => planningEvaRow(page, "Survey Alpha").length).toBe(0);
    expect(await mission.read()).toEqual(after);
  });
});
