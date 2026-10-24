import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { seedAction } from "../fixtures/entitySeeds";
import { choosePlanningEvaAction, enablePlanningEditMode, planningEvaRow } from "./planningHelpers";

const campaignUuid = "81000000-0000-4000-8000-000000000001";

async function execution(page: Page, evaUuid: string) {
  await page.getByLabel("evas Section", { exact: true }).click();
  const all = page.getByLabel("Show All EVAs", { exact: true });
  if (await all.isVisible()) await all.click();
  await planningEvaRow(page, "Survey Alpha").locator("select").first().selectOption(evaUuid);
}
async function comparison(page: Page) {
  await page.getByLabel("reports Section", { exact: true }).click();
  await page.getByText("EVA Comparison", { exact: true }).click();
  await expect(page.getByText("Metric", { exact: true })).toBeVisible();
  await page.getByText("Diff", { exact: true }).click();
}
function executedMass(page: Page) {
  return page
    .locator('div[data-tooltip-html="Actual sample mass"]')
    .locator("..")
    .locator('[class*="tableRowCells"] > [data-tooltip-id="aegis-tooltip"]')
    .last();
}
async function chooseExecution(page: Page, rexUuid: string) {
  await page.getByText("Campaigns…", { exact: true }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByRole("button", { name: "Known campaign", exact: true }).click();
  const member = dialog
    .locator('[class*="memberRow"]')
    .filter({ has: page.getByText("Survey Alpha", { exact: true }) });
  await member.locator("select").selectOption(rexUuid);
  await page.getByRole("button", { name: "Close campaigns" }).click();
}

test.use({ scenario: "execution" });
for (const removal of ["designated REX", "planned EVA"] as const) {
  test(`campaign explicit/latest resolution falls back safely after deleting its ${removal}`, async ({
    page,
    context,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.actionSystemVersion = 2;
      doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
    });
    await mission.open(page);
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
    await expect(executedMass(page)).toHaveText("0.9");
    await chooseExecution(page, mission.ids.rexA);
    await expect(executedMass(page)).toHaveText("0.3");
    await expect
      .poll(
        async () => (await mission.read()).reportCampaigns[campaignUuid].executionRexUuidByEvaUuid
      )
      .toEqual({ [mission.ids.evaA]: mission.ids.rexA });
    await chooseExecution(page, "");
    await expect(executedMass(page)).toHaveText("0.9");
    await chooseExecution(page, mission.ids.rexA);
    await page.reload();
    await comparison(page);
    await expect(executedMass(page)).toHaveText("0.3");
    const peer = await context.newPage();
    await mission.open(peer);
    await enablePlanningEditMode(peer);
    await execution(peer, removal === "designated REX" ? mission.ids.rexEvaA : mission.ids.evaA);
    peer.once("dialog", (dialog) => dialog.accept());
    await peer.getByLabel("deleteEva", { exact: true }).click();
    await expect.poll(async () => (await mission.read()).rexes[mission.ids.rexA]).toBeUndefined();
    await expect(executedMass(page)).toHaveText(removal === "designated REX" ? "0.9" : "");
    if (removal === "designated REX") {
      await execution(peer, newRex.evaUuid);
      peer.once("dialog", (dialog) => dialog.accept());
      await peer.getByLabel("deleteEva", { exact: true }).click();
      await expect.poll(async () => (await mission.read()).rexes[newRex.uuid]).toBeUndefined();
      await expect(executedMass(page)).toHaveText("");
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
    await page.reload();
    await comparison(page);
    await expect(executedMass(page)).toHaveText("");
    expect(await mission.read()).toEqual(after);
  });
}
