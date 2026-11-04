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

test("legacy missions hide reports and empty v2 missions explain missing priorities", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.actionSystemVersion = 1;
  });
  await mission.open(page);
  await expect(page.getByLabel("reports Section", { exact: true })).toHaveCount(0);
  await mission.change((doc) => {
    doc.actionSystemVersion = 2;
    doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
    doc.missionPriorities = {};
  });
  await page.reload();
  await openReport(page);
  await expect(
    page.getByText("No Mission Priority Identifiers are configured for this mission.", {
      exact: true,
    })
  ).toBeVisible();
});

test.describe("Mission priority comparison and execution", () => {
  test.use({ scenario: "execution" });
  test("counts, disabled and unscheduled usages, execution filters, drilldown, diff and peer changes preserve mission data", async ({
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
    await openReport(page);
    const science = row(page);
    const plan = science.locator('[data-tooltip-html="Survey Alpha: 1 active action (planned)"]');
    await expect(plan).toHaveText("1");
    await expect(science.locator('[data-tooltip-html*="in progress"]').first()).toHaveText("1");
    await expect(
      row(page, "SCI-2").locator('[data-tooltip-html*="0 active actions (1 disabled"]').first()
    ).toHaveText("0 (D)");
    await expect(row(page, "SCI-3")).toContainText("POI only (1)");
    await plan.click();
    await expect(page.locator('[class*="drilldownTitle"]')).toHaveText("SCI-1 — Science");
    await expect(page.locator('[class*="drilldownContent"]')).toContainText(
      before.actions[mission.ids.actionA].name
    );
    await page.locator('[class*="drilldownClose"]').click();
    const filter = page.locator(
      '[data-tooltip-content="Which REX action statuses count toward priority completion"] select'
    );
    await filter.selectOption("completeOnly");
    await expect(
      science.locator('[data-tooltip-html*="REX: Survey Alpha: 0 active actions"]').first()
    ).toHaveText("0");
    await filter.selectOption("all");
    await page
      .locator('[data-tooltip-content="Show other columns as differences vs the baseline"]')
      .click();
    await expect(
      science.locator('[data-tooltip-html*="same active priority actions as baseline"]').first()
    ).toHaveText("=");
    await page
      .locator('[data-tooltip-content="Show other columns as differences vs the baseline"]')
      .click();
    await page.getByRole("button", { name: "Science 3", exact: true }).click();
    await expect(page.getByRole("button", { name: "SCI-1 (Science)", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Science 3", exact: true }).click();
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
