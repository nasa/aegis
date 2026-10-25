import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { seedAction } from "../fixtures/entitySeeds";

const campaignUuid = "87000000-0000-4000-8000-000000000001";
const secondAlphaRexUuid = "87000000-0000-4000-8000-000000000002";
const poiActionUuid = "87000000-0000-4000-8000-000000000003";
const alphaCopyUuid = "87000000-0000-4000-8000-000000000004";
const bravoCopyUuid = "87000000-0000-4000-8000-000000000005";
const alphaExecUuid = "87000000-0000-4000-8000-000000000006";
const bravoExecUuid = "87000000-0000-4000-8000-000000000007";
const uuidAt = (index: number) => `87000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

test.use({ scenario: "execution" });

async function openReport(page: Page, name: string): Promise<void> {
  await page.getByLabel("reports Section", { exact: true }).click();
  await page.getByText(name, { exact: true }).click();
}

function metricCells(page: Page, metric: string) {
  return page
    .locator(`div[data-tooltip-html="${metric}"]`)
    .locator("..")
    .locator('[class*="tableRowCells"] > [data-tooltip-id="aegis-tooltip"]');
}

test("campaign aggregates count shared action lineage once per member and one chosen REX per EVA", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    const source = JSON.parse(JSON.stringify(doc.actions[mission.ids.actionA])) as Action;
    const sharedActionRefUuid = "87000000-0000-4000-8000-000000000008";
    doc.actionSystemVersion = 2;
    doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
    doc.actions = {};
    for (const station of Object.values(doc.stations)) station.actionOrderUuids = [];
    for (const traverse of Object.values(doc.traverses)) traverse.actionOrderUuids = [];

    const addKnownAction = (uuid: string, stationUuid: string, mass: number) => {
      doc.actions[uuid] = seedAction({
        ...source,
        uuid,
        refUuid: sharedActionRefUuid,
        poiUuid: null,
        parentActionUuid: null,
        parentCopyDate: null,
        stationUuid,
        name: "Shared sample task",
        mass,
      });
      doc.stations[stationUuid].actionOrderUuids.push(uuid);
    };
    const addForEva = (evaUuid: string, prefix: string) => {
      const eva = doc.evas[evaUuid];
      const stations = eva.sequence
        .filter((item) => item.type === "station")
        .map((item) => doc.stations[item.uuid])
        .filter((station) => !station.isLanderXgress);
      expect(stations.length).toBeGreaterThan(0);
      const base = Number(prefix);
      const ids = stations.map((station, index) => {
        const uuid = uuidAt(base + index);
        addKnownAction(uuid, station.uuid, 500 * (index + 1));
        return uuid;
      });
      return ids;
    };

    const alphaPlanActions = addForEva(mission.ids.evaA, "100");
    const bravoPlanActions = addForEva(mission.ids.evaB, "110");
    const alphaExecutionActions = addForEva(mission.ids.rexEvaA, "120");
    const bravoExecutionActions = addForEva(mission.ids.rexEvaB, "130");
    const entries = (ids: string[], masses: [number, number]): ActionEntries => {
      const result: ActionEntries = {};
      ids.forEach((uuid, index) => {
        const entry: ActionEntry = {
          rexStatus: "complete",
          mass: masses[index],
          markerId: null,
          containerId: null,
          secondaryContainerId: null,
        };
        result[uuid] = entry;
      });
      return result;
    };
    doc.rexes[mission.ids.rexA].actionEntries = entries(alphaExecutionActions, [250, 500]);
    doc.rexes[mission.ids.rexB].actionEntries = entries(bravoExecutionActions, [10000, 15000]);
    const duplicateRex = JSON.parse(JSON.stringify(doc.rexes[mission.ids.rexA])) as Rex;
    duplicateRex.uuid = secondAlphaRexUuid;
    duplicateRex.name = "Alpha repeat execution";
    duplicateRex.createdAt = doc.rexes[mission.ids.rexA].createdAt + 100;
    duplicateRex.actionEntries = entries(alphaExecutionActions, [900, 1200]);
    doc.rexes[secondAlphaRexUuid] = duplicateRex;
    doc.reportCampaigns = {
      [campaignUuid]: {
        uuid: campaignUuid,
        name: "Shared lineage campaign",
        description: null,
        memberEvaUuids: [mission.ids.evaA, mission.ids.evaB],
        executionRexUuidByEvaUuid: {
          [mission.ids.evaA]: mission.ids.rexA,
          [mission.ids.evaB]: mission.ids.rexB,
        },
        createdAt: 1,
        updatedAt: null,
      },
    };
    // The two member EVAs and their execution copies share the same action lineage,
    // while retaining distinct location/action UUIDs and independent recorded mass.
    expect(alphaPlanActions).toHaveLength(2);
    expect(bravoPlanActions).toHaveLength(1);
    expect(alphaExecutionActions).toHaveLength(2);
    expect(bravoExecutionActions).toHaveLength(1);
  });

  const before = await mission.read();
  await mission.open(page);
  await openReport(page, "EVA Comparison");
  await page.getByText("Diff", { exact: true }).click();
  const actionCounts = metricCells(page, "Action count");
  const plannedMasses = metricCells(page, "Planned sample mass");
  const actualMasses = metricCells(page, "Actual sample mass");
  await expect(actionCounts).toHaveText(["3", "2", "2", "2", "1", "5", "3"]);
  await expect(plannedMasses).toHaveText(["2", "1.5", "1.5", "1.5", "0.5", "3.5", "2"]);
  // Explicit campaign selection contributes 0.75 kg from Alpha's selected REX and
  // 10 kg from Bravo's selected REX; Alpha's newer 2.1 kg copy is excluded.
  await expect(actualMasses).toHaveText(["", "2.1", "0.8", "", "10", "", "10.8"]);
  const persisted = await mission.read();
  expect(persisted.reportCampaigns[campaignUuid].executionRexUuidByEvaUuid).toEqual({
    [mission.ids.evaA]: mission.ids.rexA,
    [mission.ids.evaB]: mission.ids.rexB,
  });
  expect(persisted.rexes[mission.ids.rexA].actionEntries).toEqual(
    before.rexes[mission.ids.rexA].actionEntries
  );
  expect(persisted).toEqual(before);
});

test("POI trace shows each execution status and preserves zero, missing mass, and sample IDs", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    const baseAction = JSON.parse(JSON.stringify(doc.actions[mission.ids.actionA])) as Action;
    const sourceRef = "87000000-0000-4000-8000-000000000008";
    const alphaRef = "87000000-0000-4000-8000-000000000009";
    const bravoRef = "87000000-0000-4000-8000-000000000010";
    doc.actionSystemVersion = 2;
    doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
    doc.actions = {};
    for (const station of Object.values(doc.stations)) {
      station.actionOrderUuids = [];
      station.poiUuids = [];
    }
    for (const traverse of Object.values(doc.traverses)) traverse.actionOrderUuids = [];
    doc.pois[mission.ids.poiA].actionOrderUuids = [poiActionUuid];
    doc.actions[poiActionUuid] = seedAction({
      ...baseAction,
      uuid: poiActionUuid,
      refUuid: sourceRef,
      name: "Traceable sample",
      poiUuid: mission.ids.poiA,
      stationUuid: null,
      parentActionUuid: null,
      parentCopyDate: null,
    });
    const planned = (uuid: string, refUuid: string, stationUuid: string) => {
      doc.actions[uuid] = seedAction({
        ...baseAction,
        uuid,
        refUuid,
        name: "Traceable sample",
        poiUuid: null,
        stationUuid,
        parentActionUuid: poiActionUuid,
        parentCopyDate: 1,
      });
      doc.stations[stationUuid].actionOrderUuids.push(uuid);
      doc.stations[stationUuid].poiUuids = [mission.ids.poiA];
    };
    const stationInEva = (evaUuid: string, ref: string) =>
      doc.evas[evaUuid].sequence
        .filter((item) => item.type === "station")
        .map((item) => doc.stations[item.uuid])
        .find(
          (station) => station.refUuid === doc.stations[ref].refUuid && !station.isLanderXgress
        )!.uuid;
    const alphaStation = stationInEva(mission.ids.evaA, mission.ids.stationA);
    const bravoStation = stationInEva(mission.ids.evaB, mission.ids.stationB);
    const alphaRexStation = stationInEva(mission.ids.rexEvaA, mission.ids.stationA);
    const bravoRexStation = stationInEva(mission.ids.rexEvaB, mission.ids.stationB);
    planned(alphaCopyUuid, alphaRef, alphaStation);
    planned(bravoCopyUuid, bravoRef, bravoStation);
    const executed = (uuid: string, refUuid: string, stationUuid: string) => {
      doc.actions[uuid] = seedAction({
        ...baseAction,
        uuid,
        refUuid,
        name: "Traceable sample",
        poiUuid: null,
        stationUuid,
        parentActionUuid: poiActionUuid,
        parentCopyDate: 1,
      });
      doc.stations[stationUuid].actionOrderUuids.push(uuid);
    };
    executed(alphaExecUuid, alphaRef, alphaRexStation);
    executed(bravoExecUuid, bravoRef, bravoRexStation);
    const secondaryAlphaRexUuid = "87000000-0000-4000-8000-000000000011";
    doc.rexes[mission.ids.rexA].actionEntries = {
      [alphaExecUuid]: {
        rexStatus: "complete",
        mass: 0,
        markerId: "MARK-ZERO",
        containerId: "BAG-ZERO",
        secondaryContainerId: "BAG-SECONDARY",
      },
    };
    doc.rexes[mission.ids.rexB].actionEntries = {
      [bravoExecUuid]: {
        rexStatus: "skipped",
        markerId: "MARK-MISSING",
        containerId: "BAG-MISSING",
        secondaryContainerId: null,
      },
    };
    const secondRex = JSON.parse(JSON.stringify(doc.rexes[mission.ids.rexA])) as Rex;
    secondRex.uuid = secondaryAlphaRexUuid;
    secondRex.name = "Alpha in-progress execution";
    secondRex.createdAt = doc.rexes[mission.ids.rexA].createdAt + 100;
    secondRex.actionEntries = {
      [alphaExecUuid]: {
        rexStatus: "in-progress",
        markerId: "MARK-IN-PROGRESS",
        containerId: null,
        secondaryContainerId: "TUBE-IN-PROGRESS",
      },
    };
    doc.rexes[secondaryAlphaRexUuid] = secondRex;
  });

  const before = await mission.read();
  await mission.open(page);
  await openReport(page, "POI Traceability");
  const trace = page.getByRole("region", { name: "Reference POI action trace" });
  await expect(page.getByRole("button", { name: /Traceable sample/ })).toBeVisible();
  const branches = trace.getByRole("list", { name: "EVA adoptions" });
  await expect(branches.getByText("Survey Alpha", { exact: true })).toHaveCount(2);
  await expect(branches.getByText("Survey Bravo", { exact: true })).toHaveCount(1);
  await expect(branches.getByText("Completed", { exact: true })).toHaveCount(1);
  await expect(branches.getByText("In progress", { exact: true })).toHaveCount(1);
  await expect(branches.getByText("Skipped", { exact: true })).toHaveCount(1);

  const executionRows = branches.getByRole("list", { name: "Execution outcomes" });
  const zeroMassRow = executionRows.locator("li").filter({ hasText: "Completed" });
  await zeroMassRow.getByRole("button", { name: "Preview executed action" }).click();
  let dialog = page.getByRole("dialog", { name: "Action preview" });
  await expect(dialog).toContainText("REX: Stopped Alpha / Completed");
  await expect(dialog.locator('input[aria-label="Executed Sample Mass"]')).toHaveValue("0");
  await expect(dialog.locator('input[aria-label="Sample Marker ID"]')).toHaveValue("MARK-ZERO");
  await expect(dialog.locator('input[aria-label="Container ID"]')).toHaveValue("BAG-ZERO");
  await expect(dialog.locator('input[aria-label="Secondary Container ID"]')).toHaveValue(
    "BAG-SECONDARY"
  );
  await dialog.getByRole("button", { name: "Close preview" }).click();

  const missingMassRow = executionRows.locator("li").filter({ hasText: "In progress" });
  await missingMassRow.getByRole("button", { name: "Preview executed action" }).click();
  dialog = page.getByRole("dialog", { name: "Action preview" });
  await expect(dialog).toContainText("REX: Alpha in-progress execution / In progress");
  await expect(dialog.locator('input[aria-label="Executed Sample Mass"]')).toHaveValue("");
  await expect(dialog.locator('input[aria-label="Sample Marker ID"]')).toHaveValue(
    "MARK-IN-PROGRESS"
  );
  await expect(dialog.locator('input[aria-label="Secondary Container ID"]')).toHaveValue(
    "TUBE-IN-PROGRESS"
  );
  await dialog.getByRole("button", { name: "Close preview" }).click();

  const skippedRow = executionRows.locator("li").filter({ hasText: "Skipped" });
  await skippedRow.getByRole("button", { name: "Preview executed action" }).click();
  dialog = page.getByRole("dialog", { name: "Action preview" });
  await expect(dialog).toContainText("REX: Active Bravo / Skipped");
  await expect(dialog.locator('input[aria-label="Executed Sample Mass"]')).toHaveValue("");
  await expect(dialog.locator('input[aria-label="Sample Marker ID"]')).toHaveValue("MARK-MISSING");
  await expect(dialog.locator('input[aria-label="Container ID"]')).toHaveValue("BAG-MISSING");
  expect(await mission.read()).toEqual(before);
});
