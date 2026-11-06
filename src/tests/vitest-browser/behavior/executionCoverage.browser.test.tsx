import { vi } from "vitest";
import { exactText, isVisible } from "./browserAssertions";
import type { Locator, BrowserPage as Page } from "vitest/browser";
import { test as base, expect } from "./missionHarness";
import { readMapFeatures } from "./mapObserver";

const CLOCK_ORIGIN = "2026-10-24T12:00:00.000Z";
const SECOND_POS_TYPE = "30000000-0000-4000-8000-000000000011";
const THIRD_POS_TYPE = "30000000-0000-4000-8000-000000000012";
const SECOND_POS_SOURCE = "30000000-0000-4000-8000-000000000013";
const THIRD_POS_SOURCE = "30000000-0000-4000-8000-000000000014";

const test = base.extend({ scenario: "execution" as BehavioralScenario });

async function selectExecution(page: Page, plannedName: string, evaUuid: string): Promise<void> {
  await page.getByLabelText("evas Section", { exact: true }).click();
  const showAll = page.getByLabelText("Show All EVAs", { exact: true });
  if (await isVisible(showAll)) await showAll.click();
  const eva = page.getByLabelText("evaList-item", { exact: true }).filter({ hasText: plannedName });
  await expect.poll(() => eva.length).toBe(1);
  await eva.getBySelector("select").selectOptions(evaUuid);
}

async function openRexInfo(page: Page, plannedName: string, evaUuid: string): Promise<void> {
  await selectExecution(page, plannedName, evaUuid);
  await page.getByLabelText("rex_info_panel", { exact: true }).click();
  await expect.element(page.getByText("REX Information", { exact: true })).toBeVisible();
}

async function enableEditing(page: Page): Promise<void> {
  const toggle = page.getByLabelText("globalEditToggle", { exact: true });
  if ((await toggle.element().getAttribute("data-tooltip-content")) === "Turn On Edit Mode") {
    await toggle.click();
  }
  await expect.element(toggle).toHaveAttribute("data-tooltip-content", "Turn Off Edit Mode");
}

async function editPet(page: Page, value: string): Promise<Locator> {
  await page.getBySelector('div[aria-label="PET Timer"]').click();
  const dialog = page.getBySelector("dialog[open]");
  await expect.element(dialog).toBeInTheDocument();
  await dialog.getByLabelText("PET Timer", { exact: true }).fill(value);
  return dialog;
}

async function expectPositionAge(uuid: string, age: string): Promise<void> {
  await expect
    .poll(async () => {
      const label = (await readMapFeatures()).find(
        (feature) => feature.id === `pos-${uuid}` && feature.labelType === "pos" && feature.visible
      );
      return label?.name.split(" / ")[0] ?? null;
    })
    .toBe(age);
}
function stabilizeClock(): void {
  sessionStorage.setItem("timeOffsetMs", "0");
  vi.setSystemTime(new Date(CLOCK_ORIGIN));
}

test.describe("Execution creation and view state", () => {
  test("first start seeds one egress position per configured source and restart reuses them", async ({
    page,
    mission,
  }) => {
    await mission.change((doc) => {
      const rex = doc.rexes[mission.ids.rexB];
      rex.isRunning = false;
      rex.petRunning = false;
      rex.posEntries = [];
      rex.posTypes.push(
        {
          uuid: SECOND_POS_TYPE,
          name: "EV2",
          abbr: "2",
          icon: "1f469-200d-1f680",
          pathColor: "#0000ff",
        },
        {
          uuid: THIRD_POS_TYPE,
          name: "Cart",
          abbr: "C",
          icon: "1f6d2",
          pathColor: "#00ff00",
        }
      );
      rex.posSources.push(
        { uuid: SECOND_POS_SOURCE, name: "Task", abbr: "T", pathColor: "#0088ff" },
        { uuid: THIRD_POS_SOURCE, name: "Science", abbr: "S", pathColor: "#0088ff" }
      );
    });
    const before = await mission.read();
    const rexBefore = before.rexes[mission.ids.rexB];
    const plannedGraph = {
      evas: before.evas,
      stations: before.stations,
      traverses: before.traverses,
      actions: before.actions,
      rexes: { [mission.ids.rexA]: before.rexes[mission.ids.rexA] },
    };
    const egress = before.stations[mission.ids.egressB];

    await mission.open();
    await openRexInfo(page, "Survey Bravo", mission.ids.rexEvaB);
    await enableEditing(page);
    await page.getByLabelText("Execute EVA", { exact: true }).click();

    await expect
      .poll(async () => (await mission.read()).rexes[mission.ids.rexB].posEntries.length)
      .toBe(rexBefore.posSources.length);
    let started = (await mission.read()).rexes[mission.ids.rexB];
    expect(started.isRunning).toBe(true);
    expect(started.posEntries).toHaveLength(3);
    expect(started.posEntries.map((entry) => entry.posSourceUuid).sort()).toEqual(
      rexBefore.posSources.map((source) => source.uuid).sort()
    );
    for (const entry of started.posEntries) {
      expect(entry).toMatchObject({
        location: egress.location,
        petSeconds: 0,
        posTypeUuids: rexBefore.posTypes.map((type) => type.uuid),
      });
      expect(entry.uuid).toBeTruthy();
    }
    expect((await mission.read()).evas).toEqual(plannedGraph.evas);
    expect((await mission.read()).stations).toEqual(plannedGraph.stations);
    expect((await mission.read()).traverses).toEqual(plannedGraph.traverses);
    expect((await mission.read()).actions).toEqual(plannedGraph.actions);
    expect((await mission.read()).rexes[mission.ids.rexA]).toEqual(
      plannedGraph.rexes[mission.ids.rexA]
    );

    await page.getByLabelText("Stop Execution", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).rexes[mission.ids.rexB].isRunning)
      .toBe(false);
    const stoppedEntries = (await mission.read()).rexes[mission.ids.rexB].posEntries;
    await page.getByLabelText("Execute EVA", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).rexes[mission.ids.rexB].isRunning)
      .toBe(true);
    started = (await mission.read()).rexes[mission.ids.rexB];
    expect(started.posEntries).toEqual(stoppedEntries);
    expect(started.posEntries.map((entry) => entry.uuid)).toHaveLength(3);
    expect(started.posEntries.map((entry) => entry.uuid)).toEqual(
      stoppedEntries.map((entry) => entry.uuid)
    );
    expect((await mission.read()).evas).toEqual(plannedGraph.evas);
  });
});

test.describe("PET manual edit boundaries", () => {
  for (const valueCase of [
    { title: "positive", typed: "+12:34:56", saved: "+12:34:56", seconds: 45_296 },
    { title: "negative", typed: "-12:34:56", saved: "-12:34:56", seconds: -45_296 },
    { title: "zero", typed: "+00:00:00", saved: "+00:00:00", seconds: 0 },
    { title: "maximum two-digit hour", typed: "+99:59:59", saved: "+99:59:59", seconds: 359_999 },
    {
      title: "minute and second values above 59",
      typed: "+00:60:60",
      saved: "+00:60:60",
      seconds: 3_660,
    },
    {
      title: "typing filters non-time characters",
      typed: "+a01:02:03",
      saved: "+01:02:03",
      seconds: 3_723,
    },
  ]) {
    test(`accepts ${valueCase.title} PET according to the field's format and numeric semantics`, async ({
      page,
      mission,
    }) => {
      await stabilizeClock();
      const before = await mission.read();
      const untouchedRex = before.rexes[mission.ids.rexA];
      await mission.open();
      await openRexInfo(page, "Survey Bravo", mission.ids.rexEvaB);
      await enableEditing(page);
      const dialog = await editPet(page, valueCase.typed);
      await dialog.getByText("Save", { exact: true }).click();
      await expect.poll(() => dialog.length).toBe(0);
      await expect.element(page.getByTestId("rex-pet-clock")).toHaveTextContent(valueCase.saved);
      await expect
        .element(page.getByTestId("header-pet-clock"))
        .toHaveTextContent(exactText(valueCase.saved));
      await expectPositionAge(mission.ids.posB, petAge(Math.max(0, valueCase.seconds - 120)));
      await expect
        .poll(async () => (await mission.read()).rexes[mission.ids.rexB].petValueAtStartStop)
        .toBe(valueCase.saved);
      expect((await mission.read()).rexes[mission.ids.rexA]).toEqual(untouchedRex);
      expect((await mission.read()).rexes[mission.ids.rexB].posEntries).toEqual(
        before.rexes[mission.ids.rexB].posEntries
      );

      await mission.open();
      await openRexInfo(page, "Survey Bravo", mission.ids.rexEvaB);
      await expect.element(page.getByTestId("rex-pet-clock")).toHaveTextContent(valueCase.saved);
      await expectPositionAge(mission.ids.posB, petAge(Math.max(0, valueCase.seconds - 120)));
      expect((await mission.read()).rexes[mission.ids.rexA]).toEqual(untouchedRex);
    });
  }

  for (const invalid of [
    {
      title: "hour exceeds the two-digit maximum",
      value: "+100:00:00",
      error: "Must be at no more than 9 characters",
    },
    {
      title: "value exceeds nine-character input limit",
      value: "+123:45:67",
      error: "Must be at no more than 9 characters",
    },
    { title: "incomplete field", value: "+12:3", error: "Must be in HH:MM:SS format" },
    { title: "empty field", value: "", error: "Required" },
  ]) {
    test(`rejects an invalid PET ${invalid.title} without replacing committed clocks`, async ({
      page,
      mission,
    }) => {
      const before = await mission.read();
      await mission.open();
      await openRexInfo(page, "Survey Bravo", mission.ids.rexEvaB);
      await enableEditing(page);
      const dialog = await editPet(page, invalid.value);
      await expect.element(dialog.getByText(invalid.error, { exact: true })).toBeVisible();
      await expect
        .element(dialog.getByRole("button", { name: "Save", exact: true }))
        .toBeDisabled();
      await expect.element(dialog).toBeInTheDocument();
      expect((await mission.read()).rexes[mission.ids.rexB].petValueAtStartStop).toBe(
        before.rexes[mission.ids.rexB].petValueAtStartStop
      );
      expect((await mission.read()).rexes[mission.ids.rexA]).toEqual(
        before.rexes[mission.ids.rexA]
      );
      await dialog.getByText("Cancel", { exact: true }).click();
      await expect
        .element(page.getByTestId("rex-pet-clock"))
        .toHaveTextContent(before.rexes[mission.ids.rexB].petValueAtStartStop);
      await expectPositionAge(mission.ids.posB, "+00:03:00");
      await mission.open();
      await openRexInfo(page, "Survey Bravo", mission.ids.rexEvaB);
      await expect
        .element(page.getByTestId("rex-pet-clock"))
        .toHaveTextContent(before.rexes[mission.ids.rexB].petValueAtStartStop);
    });
  }
});

function petAge(seconds: number): string {
  const sign = seconds < 0 ? "-" : "+";
  const absolute = Math.abs(seconds);
  const hours = Math.floor(absolute / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((absolute % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const remainder = (absolute % 60).toString().padStart(2, "0");
  return `${sign}${hours}:${minutes}:${remainder}`;
}
