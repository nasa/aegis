import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { seedAction } from "../fixtures/entitySeeds";

const priority = "93000000-0000-4000-8000-000000000001";
const disabled = "93000000-0000-4000-8000-000000000002";
const unused = "93000000-0000-4000-8000-000000000003";
const extraAction = "93000000-0000-4000-8000-000000000004";
const poiAction = "93000000-0000-4000-8000-000000000005";

async function openReport(page: Page): Promise<void> {
  await page.getByLabel("reports Section", { exact: true }).click();
  await page.getByText("Mission Priorities", { exact: true }).click();
  await page.getByLabel("Diff", { exact: true }).click();
}

function row(page: Page, trace = "SCI-1") {
  return page.getByRole("button", { name: `${trace} (Science)`, exact: true }).locator("..");
}

test.describe("Mission priority comparison and execution", () => {
  test.use({ scenario: "execution" });
  test("priority reassignment reaches an open peer report and survives reload", async ({
    page,
    context,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.actionSystemVersion = 2;
      doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
      doc.missionPriorities = {
        [priority]: { trace: "SCI-1", category: "Science" },
        [disabled]: { trace: "SCI-2", category: "Science" },
        [unused]: { trace: "SCI-3", category: "Science" },
      };
      doc.actions[mission.ids.actionA].missionPriorityUuid = priority;
      doc.actions[mission.ids.rexActionA].missionPriorityUuid = priority;
      doc.rexes[mission.ids.rexA].actionEntries[mission.ids.rexActionA] = {
        rexStatus: "in-progress",
      };
      doc.actions[extraAction] = seedAction({
        uuid: extraAction,
        refUuid: extraAction,
        stationUuid: mission.ids.stationB,
        missionPriorityUuid: disabled,
        name: "Disabled priority task",
        enabled: false,
      });
      doc.stations[mission.ids.stationB].actionOrderUuids.push(extraAction);
      doc.actions[poiAction] = seedAction({
        uuid: poiAction,
        refUuid: poiAction,
        poiUuid: mission.ids.poiA,
        missionPriorityUuid: unused,
        name: "Unscheduled POI task",
      });
      doc.pois[mission.ids.poiA].actionOrderUuids.push(poiAction);
    });
    const before = await mission.read();
    await mission.open(page);
    const peer = await context.newPage();
    await mission.open(peer);
    await openReport(peer);
    await mission.change((doc) => {
      doc.actions[mission.ids.actionA].missionPriorityUuid = unused;
    });
    await expect(
      row(peer).locator('[data-tooltip-html="Survey Alpha: 0 active actions (no active actions)"]')
    ).toHaveText("0");
    await expect(
      row(peer, "SCI-3").locator('[data-tooltip-html="Survey Alpha: 1 active action (planned)"]')
    ).toHaveText("1");
    await page.reload();
    await openReport(page);
    await expect(
      row(page, "SCI-3").locator('[data-tooltip-html="Survey Alpha: 1 active action (planned)"]')
    ).toHaveText("1");
    const after = await mission.read();
    expect(after).toEqual({
      ...before,
      actions: {
        ...before.actions,
        [mission.ids.actionA]: {
          ...before.actions[mission.ids.actionA],
          missionPriorityUuid: unused,
        },
      },
    });
  });
});
