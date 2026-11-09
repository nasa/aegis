import type { BrowserPage as Page } from "vitest/browser";
import { exactText, isVisible } from "./browserAssertions";
import { vi } from "vitest";
import { test as base, expect } from "./missionHarness";
import { seedAction } from "tests/playwright/fixtures/entitySeeds";
import { choosePlanningEvaAction, enablePlanningEditMode, planningEvaRow } from "./planningHelpers";

const campaignUuid = "81000000-0000-4000-8000-000000000001";

async function execution(page: Page, evaUuid: string) {
  await page.getByLabelText("evas Section", { exact: true }).click();
  const all = page.getByLabelText("Show All EVAs", { exact: true });
  if (isVisible(all)) await all.click();
  await planningEvaRow(page, "Survey Alpha").getBySelector("select").first().selectOptions(evaUuid);
}
async function comparison(page: Page) {
  await page.getByLabelText("reports Section", { exact: true }).click();
  await page.getByText("EVA Comparison", { exact: true }).click();
  await expect.element(page.getByText("Metric", { exact: true })).toBeVisible();
  await page.getByText("Diff", { exact: true }).click();
}
function executedMass(page: Page) {
  return page
    .getBySelector('div[data-tooltip-html="Actual sample mass"]')
    .getBySelector("..")
    .getBySelector('[class*="tableRowCells"] > [data-tooltip-id="aegis-tooltip"]')
    .last();
}
async function chooseExecution(page: Page, rexUuid: string) {
  await page.getByText("Campaigns…", { exact: true }).click();
  const dialog = page.getBySelector("dialog[open]");
  await dialog.getByRole("button", { name: "Known campaign", exact: true }).click();
  const member = dialog
    .getBySelector('[class*="memberRow"]')
    .filter({ has: page.getByText("Survey Alpha", { exact: true }) });
  await member.getBySelector("select").selectOptions(rexUuid);
  await page.getByRole("button", { name: "Close campaigns" }).click();
}

const test = base.extend({ scenario: "execution" as BehavioralScenario });
for (const removal of ["designated REX", "planned EVA"] as const) {
  test(`campaign explicit/latest resolution falls back safely on deleting its ${removal}`, async ({
    page,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.actionSystemVersion = 2;
      doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
    });
    await mission.open();
    await enablePlanningEditMode(page);
    await execution(page, mission.ids.evaA);
    await choosePlanningEvaAction(page, "Survey Alpha", "Add REX");
    await expect.poll(async () => Object.keys((await mission.read()).rexes).length).toBe(3);
    const newRex = Object.values((await mission.read()).rexes).find(
      (rex) => ![mission.ids.rexA, mission.ids.rexB].includes(rex.uuid)
    );
    expect(newRex).toBeDefined();
    await mission.change((doc) => {
      doc.rexes[mission.ids.rexA].createdAt = 100;
      doc.rexes[newRex.uuid].createdAt = 200;
      doc.rexes[mission.ids.rexA].actionEntries = {
        [mission.ids.rexActionA]: {
          rexStatus: "complete",
          mass: 250,
          markerId: null,
          containerId: null,
          secondaryContainerId: null,
        },
      };
      const newActions = Object.values(doc.actions).filter((action) =>
        doc.evas[newRex.evaUuid].sequence.some(
          (item) => item.uuid === action.stationUuid || item.uuid === action.traverseUuid
        )
      );
      expect(newActions).toHaveLength(1);
      doc.rexes[newRex.uuid].actionEntries = {
        [newActions[0].uuid]: {
          rexStatus: "complete",
          mass: 900,
          markerId: null,
          containerId: null,
          secondaryContainerId: null,
        },
      };
      const unrelatedAction = "81000000-0000-4000-8000-000000000002";
      doc.actions[unrelatedAction] = seedAction({
        uuid: unrelatedAction,
        refUuid: unrelatedAction,
        name: "Unrelated execution sample",
        stationUuid: mission.ids.rexStationB,
      });
      doc.stations[mission.ids.rexStationB].actionOrderUuids.push(unrelatedAction);
      doc.rexes[mission.ids.rexB].actionEntries = {
        [unrelatedAction]: {
          rexStatus: "complete",
          mass: 10000,
          markerId: null,
          containerId: null,
          secondaryContainerId: null,
        },
      };
      doc.reportCampaigns = {
        [campaignUuid]: {
          uuid: campaignUuid,
          name: "Known campaign",
          description: null,
          memberEvaUuids: [mission.ids.evaA],
          executionRexUuidByEvaUuid: null,
          createdAt: 1,
          updatedAt: null,
        },
      };
    });
    const before = await mission.read();
    await comparison(page);
    await expect.element(executedMass(page)).toMatchTextContent(exactText("0.9"));
    await chooseExecution(page, mission.ids.rexA);
    await expect.element(executedMass(page)).toMatchTextContent(exactText("0.3"));
    await expect
      .poll(
        async () => (await mission.read()).reportCampaigns[campaignUuid].executionRexUuidByEvaUuid
      )
      .toEqual({ [mission.ids.evaA]: mission.ids.rexA });
    await chooseExecution(page, "");
    await expect.element(executedMass(page)).toMatchTextContent(exactText("0.9"));
    await chooseExecution(page, mission.ids.rexA);
    await mission.open();
    await comparison(page);
    await expect.element(executedMass(page)).toMatchTextContent(exactText("0.3"));
    const deleteFromEditor = async (evaUuid: string) => {
      await enablePlanningEditMode(page);
      await execution(page, evaUuid);
      vi.spyOn(window, "confirm").mockReturnValueOnce(true);
      await page.getByLabelText("deleteEva", { exact: true }).click();
      await page.getByLabelText("reports Section", { exact: true }).click();
      await page.getByText("EVA Comparison", { exact: true }).click();
    };
    await deleteFromEditor(removal === "designated REX" ? mission.ids.rexEvaA : mission.ids.evaA);
    await expect.poll(async () => (await mission.read()).rexes[mission.ids.rexA]).toBeUndefined();
    await expect
      .element(executedMass(page))
      .toMatchTextContent(exactText(removal === "designated REX" ? "0.9" : ""));
    if (removal === "designated REX") {
      await deleteFromEditor(newRex.evaUuid);
      await expect.poll(async () => (await mission.read()).rexes[newRex.uuid]).toBeUndefined();
      await expect.element(executedMass(page)).toMatchTextContent(exactText(""));
    }
    const after = await mission.read();
    expect(after.evas[mission.ids.rexEvaA]).toBeUndefined();
    expect(after.rexes[newRex.uuid]).toBeUndefined();
    expect(after.evas[newRex.evaUuid]).toBeUndefined();
    if (removal === "planned EVA") {
      expect(after.evas[mission.ids.evaA]).toBeUndefined();
    } else {
      expect(after.evas[mission.ids.evaA]).toEqual(before.evas[mission.ids.evaA]);
    }
    expect(after.rexes[mission.ids.rexB]).toEqual(before.rexes[mission.ids.rexB]);
    expect(after.evas[mission.ids.evaB]).toEqual(before.evas[mission.ids.evaB]);
    expect(after.evas[mission.ids.rexEvaB]).toEqual(before.evas[mission.ids.rexEvaB]);
    await mission.open();
    await comparison(page);
    await expect.element(executedMass(page)).toMatchTextContent(exactText(""));
    expect(await mission.read()).toEqual(after);
  });
}
