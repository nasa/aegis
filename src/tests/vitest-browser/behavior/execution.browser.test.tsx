import { vi } from "vitest";
import { exactText, isVisible } from "./browserAssertions";
import type { Locator, BrowserPage as Page } from "vitest/browser";
import { test as base, expect } from "./missionHarness";
import { readMapFeatures } from "./mapObserver";

const CLOCK_ORIGIN = "2026-10-24T12:00:00.000Z";

const test = base.extend({ scenario: "execution" as BehavioralScenario });

async function selectExecution(
  page: Page,
  asPlannedName: string,
  executionEvaUuid: string
): Promise<void> {
  await page.getByLabelText("evas Section", { exact: true }).click();
  const showAll = page.getByLabelText("Show All EVAs", { exact: true });
  if (await isVisible(showAll)) await showAll.click();
  const eva = page
    .getByLabelText("evaList-item", { exact: true })
    .filter({ hasText: asPlannedName });
  await expect.poll(() => eva.length).toBe(1);
  await eva.getBySelector("select").selectOptions(executionEvaUuid);
}

async function openExecutionInformation(
  page: Page,
  asPlannedName: string,
  executionEvaUuid: string,
  executionName: string
): Promise<void> {
  await selectExecution(page, asPlannedName, executionEvaUuid);
  await page.getByLabelText("rex_info_panel", { exact: true }).click();
  await expect
    .element(page.getBySelector('div[aria-label="REX Title"]'))
    .toHaveTextContent(exactText(executionName));
}

async function enableEditing(page: Page): Promise<void> {
  const toggle = page.getByLabelText("globalEditToggle", { exact: true });
  await expect.element(toggle).toHaveAttribute("data-tooltip-content", "Turn On Edit Mode");
  await toggle.click();
  await expect.element(toggle).toHaveAttribute("data-tooltip-content", "Turn Off Edit Mode");
}

async function expectPet(page: Page, pet: string): Promise<void> {
  await expect.element(page.getByTestId("rex-pet-clock")).toHaveTextContent(pet);
}

async function expectPositionAge(
  positionUuid: string,
  expectedAge: string,
  mode: MapMode = "editor"
): Promise<void> {
  await expect
    .poll(async () => {
      const feature = (await readMapFeatures(mode)).find(
        (item) => item.id === `pos-${positionUuid}` && item.labelType === "pos" && item.visible
      );
      return feature?.name.split(" / ")[0] ?? null;
    })
    .toBe(expectedAge);
}
function controlClock(): void {
  sessionStorage.setItem("timeOffsetMs", "0");
  vi.setSystemTime(new Date(CLOCK_ORIGIN));
}

function advanceClock(milliseconds: number): void {
  vi.setSystemTime(new Date(Date.now() + milliseconds));
}

async function observePetTickWindow(): Promise<void> {
  const startedAt = performance.now();
  // Observe more than two native 100 ms PET ticks before asserting that time stayed frozen.
  await expect.poll(() => performance.now() - startedAt).toBeGreaterThanOrEqual(250);
}

async function editPet(page: Page, value: string): Promise<Locator> {
  await page.getBySelector('div[aria-label="PET Timer"]').click();
  const dialog = page.getBySelector("dialog[open]");
  await expect.element(dialog).toBeInTheDocument();
  await dialog.getByLabelText("PET Timer", { exact: true }).fill(value);
  return dialog;
}

test.describe("Execution time ownership", () => {
  for (const otherExecutionRunning of [false, true]) {
    test(`stopped execution keeps its historical position age with ${otherExecutionRunning ? "another execution running" : "no execution running"}`, async ({
      page,
      mission,
    }) => {
      await mission.change((doc) => {
        doc.rexes[mission.ids.rexB].isRunning = otherExecutionRunning;
      });
      await mission.open();
      await openExecutionInformation(page, "Survey Alpha", mission.ids.rexEvaA, "Stopped Alpha");

      await expectPet(page, "+02:10:05");
      await expectPositionAge(mission.ids.posA, "+00:15:00");
      if (otherExecutionRunning) {
        await expect
          .element(page.getByTestId("header-pet-clock"))
          .toHaveTextContent(exactText("+00:05:00"));
      } else {
        await expect.poll(() => page.getByTestId("header-pet-clock").length).toBe(0);
      }

      await mission.open();
      await openExecutionInformation(page, "Survey Alpha", mission.ids.rexEvaA, "Stopped Alpha");
      await expectPet(page, "+02:10:05");
      await expectPositionAge(mission.ids.posA, "+00:15:00");
    });
  }

  test("switching executions A → B → A changes labels without leaking the other clock", async ({
    page,
    mission,
  }) => {
    await mission.open();
    await openExecutionInformation(page, "Survey Alpha", mission.ids.rexEvaA, "Stopped Alpha");
    await expectPositionAge(mission.ids.posA, "+00:15:00");

    await openExecutionInformation(page, "Survey Bravo", mission.ids.rexEvaB, "Active Bravo");
    await expectPet(page, "+00:05:00");
    await expectPositionAge(mission.ids.posB, "+00:03:00");
    await expect
      .poll(async () =>
        (await readMapFeatures()).filter(
          (feature) => feature.labelType === "pos" && feature.id === `pos-${mission.ids.posA}`
        )
      )
      .toHaveLength(0);

    await openExecutionInformation(page, "Survey Alpha", mission.ids.rexEvaA, "Stopped Alpha");
    await expectPet(page, "+02:10:05");
    await expectPositionAge(mission.ids.posA, "+00:15:00");
  });

  test("switching from historical execution to its plan removes execution position labels", async ({
    page,
    mission,
  }) => {
    await mission.open();
    await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);
    await expectPositionAge(mission.ids.posA, "+00:15:00");

    await selectExecution(page, "Survey Alpha", mission.ids.evaA);
    await expect
      .element(page.getBySelector('div[aria-label="EVA Title"]'))
      .toHaveTextContent(exactText("Survey Alpha"));
    await expect.poll(() => page.getByLabelText("rex_info_panel", { exact: true }).length).toBe(0);
    await expect
      .poll(async () => (await readMapFeatures()).filter((feature) => feature.labelType === "pos"))
      .toHaveLength(0);
  });

  test("paused running execution keeps its PET and position ages fixed as time passes", async ({
    page,
    mission,
  }) => {
    await controlClock();
    await mission.open();
    await openExecutionInformation(page, "Survey Bravo", mission.ids.rexEvaB, "Active Bravo");
    await expectPet(page, "+00:05:00");
    await expectPositionAge(mission.ids.posB, "+00:03:00");

    await advanceClock(120_000);
    await observePetTickWindow();
    await expectPet(page, "+00:05:00");
    await expectPositionAge(mission.ids.posB, "+00:03:00");
    await expect
      .element(page.getByTestId("header-pet-clock"))
      .toHaveTextContent(exactText("+00:05:00"));
  });

  test("stopped execution stays frozen while a different execution's clock advances", async ({
    page,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.rexes[mission.ids.rexB].petRunning = true;
      doc.rexes[mission.ids.rexB].petStartStopTimestamp = CLOCK_ORIGIN;
    });
    await controlClock();
    await mission.open();
    await openExecutionInformation(page, "Survey Alpha", mission.ids.rexEvaA, "Stopped Alpha");
    await expectPositionAge(mission.ids.posA, "+00:15:00");

    const headerPet = await page.getByTestId("header-pet-clock").element().textContent;
    await advanceClock(60_000);
    await expect
      .element(page.getByTestId("header-pet-clock"))
      .not.toHaveTextContent(exactText(headerPet ?? ""));
    await expectPet(page, "+02:10:05");
    await expectPositionAge(mission.ids.posA, "+00:15:00");
  });
});

test.describe("Execution lifecycle", () => {
  for (const boundary of [
    { name: "zero", initial: "-00:00:05", positionPet: -10, expected: "+00:00:05" },
    { name: "an hour", initial: "+00:59:55", positionPet: 3590, expected: "+01:00:05" },
  ]) {
    test(`PET crosses ${boundary.name} without resetting position ages`, async ({
      page,
      mission,
    }) => {
      await mission.change((doc) => {
        const rex = doc.rexes[mission.ids.rexB];
        rex.petValueAtStartStop = boundary.initial;
        rex.posEntries[0].petSeconds = boundary.positionPet;
      });
      await controlClock();
      await mission.open();
      await openExecutionInformation(page, "Survey Bravo", mission.ids.rexEvaB, "Active Bravo");
      await enableEditing(page);
      await expectPet(page, boundary.initial);
      await expectPositionAge(mission.ids.posB, "+00:00:05");

      await page.getByRole("button", { name: "Start PET timer", exact: true }).click();
      await advanceClock(10_000);
      await expectPet(page, boundary.expected);
      await expectPositionAge(mission.ids.posB, "+00:00:15");
      await expect
        .element(page.getByTestId("header-pet-clock"))
        .toHaveTextContent(exactText(boundary.expected));
    });
  }

  test("play, pause and resume advance only unpaused PET and persist the paused value", async ({
    page,
    mission,
  }) => {
    await controlClock();
    await mission.open();
    await openExecutionInformation(page, "Survey Bravo", mission.ids.rexEvaB, "Active Bravo");
    await enableEditing(page);
    await expectPet(page, "+00:05:00");

    await page.getByRole("button", { name: "Start PET timer", exact: true }).click();
    await expect
      .element(page.getByRole("button", { name: "Pause PET timer", exact: true }))
      .toBeVisible();
    await advanceClock(10_000);
    await expectPet(page, "+00:05:10");
    await expectPositionAge(mission.ids.posB, "+00:03:10");

    await page.getByRole("button", { name: "Pause PET timer", exact: true }).click();
    await expect
      .element(page.getByRole("button", { name: "Start PET timer", exact: true }))
      .toBeVisible();
    await advanceClock(60_000);
    await observePetTickWindow();
    await expectPet(page, "+00:05:10");
    await expectPositionAge(mission.ids.posB, "+00:03:10");

    await page.getByRole("button", { name: "Start PET timer", exact: true }).click();
    await advanceClock(5000);
    await expectPet(page, "+00:05:15");
    await page.getByRole("button", { name: "Pause PET timer", exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).rexes[mission.ids.rexB].petValueAtStartStop)
      .toBe("+00:05:15");

    await mission.open();
    await openExecutionInformation(page, "Survey Bravo", mission.ids.rexEvaB, "Active Bravo");
    await expectPet(page, "+00:05:15");
    await expectPositionAge(mission.ids.posB, "+00:03:15");
  });

  test("another executing REX prevents starting the historical execution", async ({
    page,
    mission,
  }) => {
    await mission.open();
    await openExecutionInformation(page, "Survey Alpha", mission.ids.rexEvaA, "Stopped Alpha");
    await enableEditing(page);

    await expect
      .element(
        page.getByText("Cannot start execution of this rex while another rex is running", {
          exact: true,
        })
      )
      .toBeVisible();
    await expect.poll(() => page.getByLabelText("Execute EVA", { exact: true }).length).toBe(0);
    const doc = await mission.read();
    expect(doc.rexes[mission.ids.rexA].isRunning).toBe(false);
    expect(doc.rexes[mission.ids.rexB].isRunning).toBe(true);
  });

  test("execution controls stay unavailable until Edit mode is enabled", async ({
    page,
    mission,
  }) => {
    await mission.open();
    await openExecutionInformation(page, "Survey Bravo", mission.ids.rexEvaB, "Active Bravo");
    await expect.poll(() => page.getByLabelText("Stop Execution", { exact: true }).length).toBe(0);
    await expect
      .poll(() => page.getByRole("button", { name: "Start PET timer", exact: true }).length)
      .toBe(0);

    await page.getBySelector('div[aria-label="PET Timer"]').click();
    await expect.poll(() => page.getBySelector("dialog[open]").length).toBe(0);
    await expectPet(page, "+00:05:00");

    await enableEditing(page);
    await expect.element(page.getByLabelText("Stop Execution", { exact: true })).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Start PET timer", exact: true }))
      .toBeVisible();
  });
});

test.describe("PET value editing", () => {
  test("saving a nonzero historical PET updates its position age and survives remount", async ({
    page,
    mission,
  }) => {
    await mission.open();
    await openExecutionInformation(page, "Survey Alpha", mission.ids.rexEvaA, "Stopped Alpha");
    await enableEditing(page);
    const dialog = await editPet(page, "+02:20:05");
    await dialog.getByText("Save", { exact: true }).click();
    await expect.poll(() => dialog.length).toBe(0);
    await expectPet(page, "+02:20:05");
    await expectPositionAge(mission.ids.posA, "+00:25:00");
    await expect
      .poll(async () => (await mission.read()).rexes[mission.ids.rexA].petValueAtStartStop)
      .toBe("+02:20:05");

    await mission.open();
    await openExecutionInformation(page, "Survey Alpha", mission.ids.rexEvaA, "Stopped Alpha");
    await expectPet(page, "+02:20:05");
    await expectPositionAge(mission.ids.posA, "+00:25:00");
  });

  test("Cancel preserves historical PET and labels in the document and after remount", async ({
    page,
    mission,
  }) => {
    await mission.open();
    await openExecutionInformation(page, "Survey Alpha", mission.ids.rexEvaA, "Stopped Alpha");
    await enableEditing(page);
    const dialog = await editPet(page, "+03:00:00");
    await dialog.getByText("Cancel", { exact: true }).click();
    await expect.poll(() => dialog.length).toBe(0);
    await expectPet(page, "+02:10:05");
    await expectPositionAge(mission.ids.posA, "+00:15:00");
    expect((await mission.read()).rexes[mission.ids.rexA].petValueAtStartStop).toBe("+02:10:05");

    await mission.open();
    await openExecutionInformation(page, "Survey Alpha", mission.ids.rexEvaA, "Stopped Alpha");
    await expectPet(page, "+02:10:05");
    await expectPositionAge(mission.ids.posA, "+00:15:00");
  });

  for (const invalidPet of ["12:3", ""]) {
    test(`invalid PET ${invalidPet ? "format" : "empty value"} cannot replace the saved time`, async ({
      page,
      mission,
    }) => {
      await mission.open();
      await openExecutionInformation(page, "Survey Alpha", mission.ids.rexEvaA, "Stopped Alpha");
      await enableEditing(page);
      const dialog = await editPet(page, invalidPet);
      await expect
        .element(
          dialog.getByText(invalidPet ? "Must be in HH:MM:SS format" : "Required", { exact: true })
        )
        .toBeVisible();
      await expect.element(dialog.getByText("Save", { exact: true })).toBeDisabled();
      await expect.element(dialog).toBeInTheDocument();
      expect((await mission.read()).rexes[mission.ids.rexA].petValueAtStartStop).toBe("+02:10:05");
      await dialog.getByText("Cancel", { exact: true }).click();
      await expectPet(page, "+02:10:05");
      await expectPositionAge(mission.ids.posA, "+00:15:00");
    });
  }

  for (const acceptReset of [false, true]) {
    test(`${acceptReset ? "confirming" : "cancelling"} reset ${acceptReset ? "sets PET to zero" : "preserves the PET"}`, async ({
      page,
      mission,
    }) => {
      await mission.open();
      await openExecutionInformation(page, "Survey Bravo", mission.ids.rexEvaB, "Active Bravo");
      await enableEditing(page);
      const confirmation = vi.spyOn(window, "confirm").mockReturnValueOnce(acceptReset);
      await page.getByRole("button", { name: "Reset PET timer", exact: true }).click();
      expect(confirmation).toHaveBeenCalledWith("Are you sure you want to reset the PET timer?");
      const expected = acceptReset ? "+00:00:00" : "+00:05:00";
      await expectPet(page, expected);
      await expectPositionAge(mission.ids.posB, acceptReset ? "+00:00:00" : "+00:03:00");
      await expect
        .poll(async () => (await mission.read()).rexes[mission.ids.rexB].petValueAtStartStop)
        .toBe(expected);

      await mission.open();
      await openExecutionInformation(page, "Survey Bravo", mission.ids.rexEvaB, "Active Bravo");
      await expectPet(page, expected);
      await expectPositionAge(mission.ids.posB, acceptReset ? "+00:00:00" : "+00:03:00");
    });
  }
});
