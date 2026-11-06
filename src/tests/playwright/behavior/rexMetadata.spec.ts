import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { enablePlanningEditMode, planningEvaRow, planningField } from "./planningHelpers";

test.use({ scenario: "execution" });

async function selectRex(page: Page, family: string, evaUuid: string) {
  await page.getByLabel("evas Section", { exact: true }).click();
  const showAll = page.getByLabel("Show All EVAs", { exact: true });
  if (await showAll.isVisible()) await showAll.click();
  await planningEvaRow(page, family).locator("select").first().selectOption(evaUuid);
}

for (const otherRunning of [false, true]) {
  test(`deleting a selected historical REX preserves its graph boundaries and clears stale controls with ${otherRunning ? "another REX active" : "no active REX"}`, async ({
    page,
    context,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.rexes[mission.ids.rexB].isRunning = otherRunning;
    });
    const before = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectRex(page, "Survey Alpha", mission.ids.rexEvaA);
    const peer = await context.newPage();
    await mission.open(peer);
    await selectRex(peer, "Survey Alpha", mission.ids.rexEvaA);
    await page.getByLabel("rex_info_panel", { exact: true }).click();
    await peer.getByLabel("rex_info_panel", { exact: true }).click();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByLabel("deleteEva", { exact: true }).click();
    expect(await mission.read()).toEqual(before);
    await expect(planningField(peer, "REX Title")).toHaveText("Stopped Alpha");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByLabel("deleteEva", { exact: true }).click();
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
    for (const client of [page, peer]) {
      await expect(planningField(client, "REX Title")).toHaveCount(0);
      await expect(client.getByLabel("rex_info_panel", { exact: true })).toHaveCount(0);
      await expect(
        planningEvaRow(client, "Survey Alpha").locator(
          'option[value="' + mission.ids.rexEvaA + '"]'
        )
      ).toHaveCount(0);
      await expect(planningField(client, "EVA Title")).toHaveText("Survey Alpha");
      await expect(client.getByText("EVA Information (As Planned)", { exact: true })).toBeVisible();
      await expect(
        planningEvaRow(client, "Survey Alpha").locator('select[class*="dropdownSelector"]')
      ).toHaveCount(0);
      await mission.open(client);
      await selectRex(client, "Survey Bravo", mission.ids.evaB);
      await expect(planningEvaRow(client, "Survey Alpha")).toBeVisible();
      await planningEvaRow(client, "Survey Alpha")
        .getByText("Survey Alpha", { exact: true })
        .click();
      await expect(planningField(client, "EVA Title")).toHaveText("Survey Alpha");
      await selectRex(client, "Survey Bravo", mission.ids.rexEvaB);
      await expect(planningField(client, "REX Title")).toHaveText("Active Bravo");
    }
    expect(await mission.read()).toEqual(expected);
  });
}
