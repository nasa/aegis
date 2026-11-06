import { test as base, expect } from "./missionHarness";
import { selectExecution } from "./executionHelpers";

const test = base.extend({ scenario: "execution" as BehavioralScenario });

test("Maestro crew completion overrides editor display while the dashboard retains stored pending status", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    const rex = doc.rexes[mission.ids.rexB];
    rex.maestroControlled = true;
    rex.stationEntries[mission.ids.rexStationB] = {
      rexStatus: "pending",
      maestroPercentCompleteEv1: 100,
      maestroPercentCompleteEv2: 100,
    };
  });
  const before = await mission.read();
  await mission.open();
  const row = await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
  const status = row
    .getByText("Bravo station", { exact: true })
    .getBySelector("xpath=ancestor::div[./div[contains(@class,'rexStatusWrapper')]][1]")
    .getBySelector('[class*="rexStatusWrapper"]');
  await expect.element(status).toHaveAttribute("data-tooltip-content", "Complete");
  await expect.poll(() => row.getBySelector('[class*="headingCompleted"]').length).toBe(1);
  expect(
    (await mission.read()).rexes[mission.ids.rexB].stationEntries[mission.ids.rexStationB].rexStatus
  ).toBe("pending");
  await mission.openDashboard();
  const activity = page
    .getBySelector('div[class*="activityIndicator"]:not([class*="activityIndicators"])')
    .nth(2);
  await expect
    .poll(() => (activity.element() as HTMLElement).style.backgroundColor)
    .toBe("var(--grey4)");
  expect(await mission.read()).toEqual(before);
});
