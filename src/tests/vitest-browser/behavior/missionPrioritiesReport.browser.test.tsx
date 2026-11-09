import type { BrowserPage as Page } from "vitest/browser";
import { test as base, expect } from "./missionHarness";
import { seedAction } from "tests/playwright/fixtures/entitySeeds";
import { exactText } from "./browserAssertions";
const test = base;

async function openReport(page: Page): Promise<void> {
  await page.getByLabelText("reports Section", { exact: true }).click();
  await page.getByText("Mission Priorities", { exact: true }).click();
  await page.getByLabelText("Diff", { exact: true }).click();
}

test("legacy missions hide reports and empty v2 missions explain missing priorities", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.actionSystemVersion = 1;
  });
  await mission.open();
  await expect.poll(() => page.getByLabelText("reports Section", { exact: true }).length).toBe(0);
  await mission.change((doc) => {
    doc.actionSystemVersion = 2;
    doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
    doc.missionPriorities = {};
  });
  await mission.open();
  await openReport(page);
  await expect
    .element(
      page.getByText("No Mission Priority Identifiers are configured for this mission.", {
        exact: true,
      })
    )
    .toBeVisible();
});

const priority = "93000000-0000-4000-8000-000000000001";
const disabled = "93000000-0000-4000-8000-000000000002";
const unused = "93000000-0000-4000-8000-000000000003";
const extraAction = "93000000-0000-4000-8000-000000000004";
const poiAction = "93000000-0000-4000-8000-000000000005";

function row(page: Page, trace = "SCI-1") {
  return page.getByRole("button", { name: `${trace} (Science)`, exact: true }).getBySelector("..");
}

test.describe("Mission priority comparison and execution", () => {
  const test = base.extend({ scenario: "execution" as BehavioralScenario });
  test("counts, disabled and unscheduled usages, execution filters, drilldown, diff and document changes preserve mission data", async ({
    page,
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
    await mission.open();
    await openReport(page);
    const science = row(page);
    const plan = science.getBySelector(
      '[data-tooltip-html="Survey Alpha: 1 active action (planned)"]'
    );
    await expect.element(plan).toMatchTextContent(exactText("1"));
    await expect
      .element(science.getBySelector('[data-tooltip-html*="in progress"]').first())
      .toMatchTextContent(exactText("1"));
    await expect
      .element(
        row(page, "SCI-2")
          .getBySelector('[data-tooltip-html*="0 active actions (1 disabled"]')
          .first()
      )
      .toMatchTextContent(exactText("0 (D)"));
    await expect.element(row(page, "SCI-3")).toMatchTextContent("POI only (1)");
    await plan.click();
    await expect
      .element(page.getBySelector('[class*="drilldownTitle"]'))
      .toMatchTextContent(exactText("SCI-1 — Science"));
    await expect
      .element(page.getBySelector('[class*="drilldownContent"]'))
      .toMatchTextContent(before.actions[mission.ids.actionA].name);
    await page.getBySelector('[class*="drilldownClose"]').click();
    const filter = page.getBySelector(
      '[data-tooltip-content="Which REX action statuses count toward priority completion"] select'
    );
    await filter.selectOptions("completeOnly");
    await expect
      .element(
        science.getBySelector('[data-tooltip-html*="REX: Survey Alpha: 0 active actions"]').first()
      )
      .toMatchTextContent(exactText("0"));
    await filter.selectOptions("all");
    await page
      .getBySelector('[data-tooltip-content="Show other columns as differences vs the baseline"]')
      .click();
    await expect
      .element(
        science
          .getBySelector('[data-tooltip-html*="same active priority actions as baseline"]')
          .first()
      )
      .toMatchTextContent(exactText("="));
    await page
      .getBySelector('[data-tooltip-content="Show other columns as differences vs the baseline"]')
      .click();
    await page.getByRole("button", { name: "Science 3", exact: true }).click();
    await expect
      .poll(() => page.getByRole("button", { name: "SCI-1 (Science)", exact: true }).length)
      .toBe(0);
    await page.getByRole("button", { name: "Science 3", exact: true }).click();
    await mission.change((doc) => {
      doc.actions[mission.ids.actionA].missionPriorityUuid = unused;
    });
    await expect
      .element(
        row(page).getBySelector(
          '[data-tooltip-html="Survey Alpha: 0 active actions (no active actions)"]'
        )
      )
      .toMatchTextContent(exactText("0"));
    await expect
      .element(
        row(page, "SCI-3").getBySelector(
          '[data-tooltip-html="Survey Alpha: 1 active action (planned)"]'
        )
      )
      .toMatchTextContent(exactText("1"));
    await mission.open();
    await openReport(page);
    await expect
      .element(
        row(page, "SCI-3").getBySelector(
          '[data-tooltip-html="Survey Alpha: 1 active action (planned)"]'
        )
      )
      .toMatchTextContent(exactText("1"));
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
