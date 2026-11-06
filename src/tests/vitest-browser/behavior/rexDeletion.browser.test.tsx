import { vi } from "vitest";
import { exactText, isVisible } from "./browserAssertions";
import type { BrowserPage as Page } from "vitest/browser";
import { test as base, expect } from "./missionHarness";
import { enablePlanningEditMode, planningEvaRow, planningField } from "./planningHelpers";

const test = base.extend({ scenario: "execution" as BehavioralScenario });

async function selectRex(page: Page, family: string, evaUuid: string) {
  await page.getByLabelText("evas Section", { exact: true }).click();
  const showAll = page.getByLabelText("Show All EVAs", { exact: true });
  if (isVisible(showAll)) await showAll.click();
  await planningEvaRow(page, family).getBySelector("select").first().selectOptions(evaUuid);
}

for (const otherRunning of [false, true]) {
  test(`deleting a selected historical REX preserves its graph boundaries and clears stale controls with ${otherRunning ? "another REX active" : "no active REX"}`, async ({
    page,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.rexes[mission.ids.rexB].isRunning = otherRunning;
    });
    const before = await mission.read();
    await mission.open();
    await enablePlanningEditMode(page);
    await selectRex(page, "Survey Alpha", mission.ids.rexEvaA);
    await page.getByLabelText("rex_info_panel", { exact: true }).click();
    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await page.getByLabelText("deleteEva", { exact: true }).click();
    expect(await mission.read()).toEqual(before);
    await expect
      .element(planningField(page, "REX Title"))
      .toHaveTextContent(exactText("Stopped Alpha"));
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    await page.getByLabelText("deleteEva", { exact: true }).click();
    await expect.poll(async () => (await mission.read()).rexes[mission.ids.rexA]).toBeUndefined();
    const expected = structuredClone(before);
    delete expected.rexes[mission.ids.rexA];
    delete expected.evas[mission.ids.rexEvaA];
    const sequence = before.evas[mission.ids.rexEvaA].sequence;
    const stationIds = sequence
      .filter((entry) => entry.type === "station")
      .map((entry) => entry.uuid);
    const traverseIds = sequence
      .filter((entry) => entry.type === "traverse")
      .map((entry) => entry.uuid);
    for (const uuid of stationIds) delete expected.stations[uuid];
    for (const uuid of traverseIds) delete expected.traverses[uuid];
    for (const action of Object.values(before.actions)) {
      if (stationIds.includes(action.stationUuid) || traverseIds.includes(action.traverseUuid))
        delete expected.actions[action.uuid];
    }
    expect(await mission.read()).toEqual(expected);

    await expect.poll(() => planningField(page, "REX Title").length).toBe(0);
    await expect.poll(() => page.getByLabelText("rex_info_panel", { exact: true }).length).toBe(0);
    await expect
      .poll(
        () =>
          planningEvaRow(page, "Survey Alpha").getBySelector(
            'option[value="' + mission.ids.rexEvaA + '"]'
          ).length
      )
      .toBe(0);
    await expect
      .element(planningField(page, "EVA Title"))
      .toHaveTextContent(exactText("Survey Alpha"));
    await expect
      .element(page.getByText("EVA Information (As Planned)", { exact: true }))
      .toBeVisible();
    await expect
      .poll(
        () =>
          planningEvaRow(page, "Survey Alpha").getBySelector('select[class*="dropdownSelector"]')
            .length
      )
      .toBe(0);
    await mission.open();
    await selectRex(page, "Survey Bravo", mission.ids.evaB);
    await expect.element(planningEvaRow(page, "Survey Alpha")).toBeVisible();
    await planningEvaRow(page, "Survey Alpha").getByText("Survey Alpha", { exact: true }).click();
    await expect
      .element(planningField(page, "EVA Title"))
      .toHaveTextContent(exactText("Survey Alpha"));
    await selectRex(page, "Survey Bravo", mission.ids.rexEvaB);
    await expect
      .element(planningField(page, "REX Title"))
      .toHaveTextContent(exactText("Active Bravo"));

    expect(await mission.read()).toEqual(expected);
  });
}
