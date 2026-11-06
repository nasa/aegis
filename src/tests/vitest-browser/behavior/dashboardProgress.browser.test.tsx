import { exactText } from "./browserAssertions";
import { v4 as randomUUID } from "uuid";
import { test as base, expect } from "./missionHarness";
import { BEHAVIORAL_NOW } from "tests/playwright/fixtures/missionSeed";

const test = base.extend({ scenario: "execution" as BehavioralScenario });

test("dashboard timeline scales known allotted and calculated work with PET and crew progress", async ({
  page,
  mission,
}) => {
  const actionUuid = randomUUID();
  const actionTemplate = (await mission.read()).actions[mission.ids.actionA];
  await mission.change((doc) => {
    const rex = doc.rexes[mission.ids.rexB];
    doc.evas[mission.ids.rexEvaB].duration = 30;
    doc.rexes[mission.ids.rexB].petRunning = false;
    rex.petValueAtStartStop = "+00:12:00";
    rex.petStartStopTimestamp = BEHAVIORAL_NOW;

    // The five timeline blocks have independently known calculated lengths:
    // 4 + 6 + 8 + 5 + 2 = 25 minutes, inside a 30-minute allotment.
    doc.stations[mission.ids.rexEgressB].duration = 4;
    doc.traverses[mission.ids.rexTraverseB].duration = 6;
    doc.stations[mission.ids.rexStationB].duration = null;
    doc.traverses[mission.ids.rexTraverseBReturn].duration = 5;
    doc.stations[mission.ids.rexIngressB].duration = 2;
    doc.actions[actionUuid] = {
      ...actionTemplate,
      uuid: actionUuid,
      refUuid: randomUUID(),
      name: "Known crew dwell",
      poiUuid: null,
      stationUuid: mission.ids.rexStationB,
      traverseUuid: null,
      duration: 8,
      crewAssigned: ["EV1"],
    };
    doc.stations[mission.ids.rexStationB].actionOrderUuids = [actionUuid];

    rex.stationEntries = {
      [mission.ids.rexEgressB]: { rexStatus: "complete" },
      [mission.ids.rexStationB]: {
        rexStatus: "in-progress",
        maestroPercentCompleteEv1: 25,
        maestroPercentCompleteEv2: 60,
      },
      [mission.ids.rexIngressB]: { rexStatus: "skipped" },
    };
    rex.traverseEntries = {
      [mission.ids.rexTraverseB]: {
        rexStatus: "pending",
        maestroPercentCompleteEv1: 40,
        maestroPercentCompleteEv2: 75,
      },
      [mission.ids.rexTraverseBReturn]: { rexStatus: "complete" },
    };
    rex.actionEntries = { [actionUuid]: { rexStatus: "complete" } };
    rex.maestroActivityProperties = {
      [mission.ids.rexStationB]: { color: "#13a06f", number: "B-7" },
      [mission.ids.rexTraverseB]: { color: "#2345ab", number: "T-9" },
    };
  });

  await mission.openDashboard();
  await expect
    .element(page.getByTestId("dashboard-pet-clock"))
    .toHaveTextContent(exactText("+00:12:00"));
  const container = page
    .getBySelector('div[class*="activityIndicators"]')
    .getBySelector('xpath=ancestor::div[contains(@class,"container")][1]');
  const chartHeight = (await ((element) => element.clientHeight)(container.element())) - 40;
  const pixelsPerSecond = chartHeight / (30 * 60);
  const activityRows = page.getBySelector(
    'div[class*="activityIndicators"] > div[class*="activityIndicator"]'
  );
  await expect.poll(() => activityRows.length).toBe(5);
  await expect
    .poll(() => Number.parseFloat((activityRows.nth(1).element() as HTMLElement).style.top))
    .toBeGreaterThan(0);
  const actualRows = await ((elements) =>
    elements.map((element) => {
      const activity = element as HTMLElement;
      return {
        top: Number.parseFloat(activity.style.top),
        height: Number.parseFloat(activity.style.height),
        color: activity.style.backgroundColor,
        crewProgress: [...activity.querySelectorAll('[class*="progressIndicator"]')].map(
          (indicator) => (indicator as HTMLElement).style.height
        ),
        numbering: [...activity.querySelectorAll('[class*="activityNumber"]')].map((item) =>
          item.textContent?.trim()
        ),
        colorStrips: [...activity.querySelectorAll('[class*="evBoxColorLine"]')].map(
          (strip) => (strip as HTMLElement).style.backgroundColor
        ),
      };
    }))(activityRows.elements());
  const expectedMinutes = [
    { start: 0, duration: 4 },
    { start: 4, duration: 6 },
    { start: 10, duration: 8 },
    { start: 18, duration: 5 },
    { start: 23, duration: 2 },
  ];
  // Browsers serialize fractional CSS pixels to fewer decimals than the calculation.
  for (const [index, expected] of expectedMinutes.entries()) {
    expect(actualRows[index].top).toBeCloseTo(expected.start * 60 * pixelsPerSecond, 2);
    expect(actualRows[index].height).toBeCloseTo(expected.duration * 60 * pixelsPerSecond, 2);
  }
  expect(actualRows.map((row) => row.numbering)).toEqual([
    ["1", "1"],
    ["T-9", "T-9"],
    ["B-7", "B-7"],
    ["4", "4"],
    ["5", "5"],
  ]);
  expect(actualRows[0].color).toBe("var(--grey4)");
  expect(actualRows[1].color).toBe("");
  expect(actualRows[2].color).toBe("var(--rex)");
  expect(actualRows[3].color).toBe("var(--grey4)");
  expect(actualRows[4].color).toBe("var(--grey4)");
  expect(actualRows[1].crewProgress).toEqual(["40%", "75%"]);
  expect(actualRows[2].crewProgress).toEqual(["25%", "60%"]);
  expect(actualRows[3].crewProgress).toEqual([]);
  expect(actualRows[2].colorStrips).toEqual(["rgb(19, 160, 111)", "rgb(19, 160, 111)"]);
  expect(actualRows[1].colorStrips).toEqual(["rgb(35, 69, 171)", "rgb(35, 69, 171)"]);

  const markers = page.getBySelector('div[class*="markerContainer"] > div[class*="marker"]');
  await expect.poll(() => markers.length).toBe(2);
  const expectedAllottedLine = chartHeight;
  const expectedPetLine = 12 * 60 * pixelsPerSecond;
  const markerData = await ((elements) =>
    elements.map((element) => {
      const marker = element as HTMLElement;
      const line = marker.querySelector('[class*="markerLine"]') as HTMLElement;
      return {
        top: Number.parseFloat(marker.style.top),
        border: line.style.borderTop,
        filter: line.style.filter,
      };
    }))(markers.elements());
  expect(markerData[0].top).toBeCloseTo(expectedAllottedLine, 2);
  expect(markerData[0].border).toBe("5px solid var(--grey3)");
  expect(markerData[1].top).toBeCloseTo(expectedPetLine, 2);
  expect(markerData[1].border).toBe("5px solid red");
  expect(markerData[1].filter).toBe("opacity(1)");

  const timeLabels = page.getBySelector('div[class*="timeLabels"] > div');
  await expect.poll(() => timeLabels.length).toBe(2);
  await expect.element(timeLabels.nth(0)).toHaveTextContent("0:00-");
  await expect.element(timeLabels.nth(1)).toHaveTextContent("0:30-");
  await expect
    .poll(() => getComputedStyle(timeLabels.nth(0).element()).getPropertyValue("filter"))
    .toBe("opacity(0.4)");
  await expect
    .poll(() => getComputedStyle(timeLabels.nth(1).element()).getPropertyValue("filter"))
    .toBe("opacity(1)");
  const persisted = await mission.read();
  expect(persisted.rexes[mission.ids.rexB].actionEntries?.[actionUuid].rexStatus).toBe("complete");
  expect(persisted.rexes[mission.ids.rexB].stationEntries?.[mission.ids.rexStationB]).toEqual({
    rexStatus: "in-progress",
    maestroPercentCompleteEv1: 25,
    maestroPercentCompleteEv2: 60,
  });
});
