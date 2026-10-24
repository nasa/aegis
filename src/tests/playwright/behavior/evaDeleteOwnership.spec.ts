import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { enablePlanningEditMode, planningEvaRow, planningField } from "./planningHelpers";

async function selectPlannedAlpha(page: Page): Promise<void> {
  await page.getByLabel("evas Section", { exact: true }).click();
  const showAll = page.getByLabel("Show All EVAs", { exact: true });
  if (await showAll.isVisible()) await showAll.click();
  await planningEvaRow(page, "Survey Alpha")
    .getByText("Survey Alpha", { exact: true })
    .first()
    .click();
  await expect(planningField(page, "EVA Title")).toHaveText("Survey Alpha");
}

test.describe("EVA confirmation and ownership graph", () => {
  test.use({ scenario: "execution" });

  test("canceling duplicate and delete preserves the graph; confirmation deletes only one plan and its REX family", async ({
    page,
    context,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlannedAlpha(page);
    const peer = await context.newPage();
    await mission.open(peer);
    await selectPlannedAlpha(peer);

    await planningEvaRow(page, "Survey Alpha")
      .locator('svg[data-icon="ellipsis-vertical"]')
      .click();
    const duplicateQuestion = page.waitForEvent("dialog");
    const menuClick = page
      .locator("dialog[open]")
      .getByText("Duplicate w/ Stations", { exact: true })
      .click();
    const duplicateDialog = await duplicateQuestion;
    expect(duplicateDialog.type()).toBe("confirm");
    expect(duplicateDialog.message()).toContain("duplicate the EVA and also make duplicates");
    await duplicateDialog.dismiss();
    await menuClick;
    expect(await mission.read()).toEqual(before);

    const cancelQuestion = page.waitForEvent("dialog");
    const cancelClick = page.getByLabel("deleteEva", { exact: true }).click();
    const cancelDialog = await cancelQuestion;
    expect(cancelDialog.message()).toBe(
      "Are you sure you want to delete this EVA?\n" +
        "WARNING: This EVA has REXes. Deleting this EVA will delete ALL REXes in this EVA."
    );
    await cancelDialog.dismiss();
    await cancelClick;
    expect(await mission.read()).toEqual(before);

    const confirmQuestion = page.waitForEvent("dialog");
    const confirmClick = page.getByLabel("deleteEva", { exact: true }).click();
    const confirmDialog = await confirmQuestion;
    expect(confirmDialog.message()).toBe(cancelDialog.message());
    await confirmDialog.accept();
    await confirmClick;

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

    await mission.open(peer);
    const showAll = peer.getByLabel("Show All EVAs", { exact: true });
    if (await showAll.isVisible()) await showAll.click();
    await expect(planningEvaRow(peer, "Survey Bravo")).toBeVisible();
    await expect(planningEvaRow(peer, "Survey Alpha")).toHaveCount(0);
    expect(await mission.read()).toEqual(after);
  });
});
