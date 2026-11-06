import { vi } from "vitest";
import { exactText } from "./browserAssertions";
import { test, expect } from "./missionHarness";
import { seedAction } from "tests/playwright/fixtures/entitySeeds";
import {
  enablePlanningEditMode,
  openPlanningField,
  openPlanningSection,
  planningField,
  savePlanningField,
  selectPlanningPoi,
  selectPlanningStationActions,
} from "./planningHelpers";

test.describe("POI lifecycle contracts", () => {
  test("a new POI has independent default state and rejects blank, duplicate and overlong names", async ({
    page,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open();
    await enablePlanningEditMode(page);
    await openPlanningSection(page, "poi");
    await page.getByLabelText("addPoi", { exact: true }).click();
    await expect.poll(async () => Object.keys((await mission.read()).pois).length).toBe(2);
    const created = Object.values((await mission.read()).pois).find(
      (p) => p.uuid !== mission.ids.poiA
    );
    expect(created.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/);
    expect(created).toMatchObject({
      location: null,
      elevation: null,
      description: "",
      actionOrderUuids: [],
      tags: [],
      status: "Candidate",
      icon: "1F534",
      radius: 5,
      priorityOverride: 0,
    });
    await expect.element(planningField(page, "POI")).toHaveTextContent(exactText(created.name));
    for (const [name, error] of [
      ["", "Required"],
      ["reference poi", "Name must be unique"],
      ["P".repeat(256), "Must be at no more than 255 characters"],
    ]) {
      const dialog = await openPlanningField(page, "POI");
      await dialog.getByLabelText("POI", { exact: true }).fill(name);
      await expect.element(dialog.getByText(error, { exact: true })).toBeVisible();
      await expect.element(dialog.getByText("Save", { exact: true })).toBeDisabled();
      await expect.element(dialog.getByLabelText("POI", { exact: true })).toBeVisible();
      await dialog.getByText("Cancel", { exact: true }).click();
      expect((await mission.read()).pois[created.uuid].name).toBe(created.name);
    }
    await savePlanningField(page, "POI", "P".repeat(255));
    await expect
      .poll(async () => (await mission.read()).pois[created.uuid].name)
      .toBe("P".repeat(255));
    expect((await mission.read()).pois[mission.ids.poiA]).toEqual(before.pois[mission.ids.poiA]);
    await mission.open();
    await selectPlanningPoi(page, "P".repeat(255));
    expect((await mission.read()).pois[created.uuid].location).toBeNull();
  });

  test("canceling referenced POI deletion preserves adopted copies and confirming removes only POI-owned actions", async ({
    page,
    mission,
  }) => {
    const sourceUuid = "30000000-0000-4000-8000-000000000010";
    await mission.change((doc) => {
      doc.actions[mission.ids.actionA].poiUuid = null;
      doc.actions[sourceUuid] = seedAction({
        uuid: sourceUuid,
        refUuid: sourceUuid,
        name: "Source outcrop sample",
        poiUuid: mission.ids.poiA,
      });
      doc.pois[mission.ids.poiA].actionOrderUuids = [sourceUuid];
    });
    await mission.open();
    await enablePlanningEditMode(page);
    await selectPlanningStationActions(page, "Alpha station");
    await page.getByText("Associated POI Actions", { exact: true }).click();
    await page.getBySelector('[data-tooltip-content="Copy this action to station"]').click();
    await expect
      .poll(
        async () => (await mission.read()).stations[mission.ids.stationA].actionOrderUuids.length
      )
      .toBe(2);
    const before = await mission.read();
    const adopted = Object.values(before.actions).find(
      (action) => action.parentActionUuid === sourceUuid
    );
    expect(adopted).toMatchObject({
      stationUuid: mission.ids.stationA,
      poiUuid: null,
      name: "Source outcrop sample",
    });
    expect(adopted.uuid).not.toBe(sourceUuid);
    await selectPlanningPoi(page, "Reference POI");
    vi.spyOn(window, "confirm").mockImplementationOnce((message) => {
      expect(String(message)).toContain("Alpha station");

      return false;
    });
    await page.getByLabelText("deletePoi", { exact: true }).click();
    await expect.element(planningField(page, "POI")).toHaveTextContent(exactText("Reference POI"));
    expect(await mission.read()).toEqual(before);
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    await page.getByLabelText("deletePoi", { exact: true }).click();
    await expect.poll(async () => Object.keys((await mission.read()).pois)).toEqual([]);
    const after = await mission.read();
    expect(after.actions[sourceUuid]).toBeUndefined();
    expect(after.actions[adopted.uuid]).toEqual(adopted);
    expect(after.actions[mission.ids.actionA]).toEqual(before.actions[mission.ids.actionA]);
    expect(after.stations[mission.ids.stationA].poiUuids).toEqual([]);
    expect(after.stations[mission.ids.stationA].actionOrderUuids).toEqual([
      mission.ids.actionA,
      adopted.uuid,
    ]);
    expect(after.evas).toEqual(before.evas);
    expect(after.traverses).toEqual(before.traverses);
    await mission.open();
    await openPlanningSection(page, "poi");
    await expect.poll(() => page.getByLabelText("poiList-item", { exact: true }).length).toBe(0);
    await selectPlanningStationActions(page, "Alpha station");
    await expect
      .element(planningField(page, "Action Name").filter({ hasText: "Source outcrop sample" }))
      .toHaveTextContent(exactText("Source outcrop sample"));
    expect((await mission.read()).actions[adopted.uuid]).toEqual(adopted);
  });
});
