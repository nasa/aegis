import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { installMapObserver, readMapFeatures } from "../fixtures/mapAssertions";

const CLOCK_ORIGIN = "2026-10-24T12:00:00.000Z";

test.use({ scenario: "execution" });

async function selectExecution(
  page: Page,
  asPlannedName: string,
  executionEvaUuid: string
): Promise<void> {
  await page.getByLabel("evas Section", { exact: true }).click();
  const showAll = page.getByLabel("Show All EVAs", { exact: true });
  if (await showAll.isVisible()) await showAll.click();
  const eva = page.getByLabel("evaList-item", { exact: true }).filter({ hasText: asPlannedName });
  await expect(eva).toHaveCount(1);
  await eva.locator("select").selectOption(executionEvaUuid);
}

async function openExecutionInformation(
  page: Page,
  asPlannedName: string,
  executionEvaUuid: string,
  executionName: string
): Promise<void> {
  await selectExecution(page, asPlannedName, executionEvaUuid);
  await page.getByLabel("rex_info_panel", { exact: true }).click();
  await expect(page.locator('div[aria-label="REX Title"]')).toHaveText(executionName);
}

async function enableEditing(page: Page): Promise<void> {
  const toggle = page.getByLabel("globalEditToggle", { exact: true });
  await expect(toggle).toHaveAttribute("data-tooltip-content", "Turn On Edit Mode");
  await toggle.click();
  await expect(toggle).toHaveAttribute("data-tooltip-content", "Turn Off Edit Mode");
}

async function expectPet(page: Page, pet: string): Promise<void> {
  await expect(page.getByTestId("rex-pet-clock")).toContainText(pet);
}

async function expectPositionAge(
  page: Page,
  positionUuid: string,
  expectedAge: string,
  mode: MapMode = "editor"
): Promise<void> {
  await expect
    .poll(async () => {
      const feature = (await readMapFeatures(page, mode)).find(
        (item) => item.id === `pos-${positionUuid}` && item.labelType === "pos" && item.visible
      );
      return feature?.name.split(" / ")[0] ?? null;
    })
    .toBe(expectedAge);
}

async function controlClock(page: Page): Promise<void> {
  // Browser time owns these scenarios; neutralize only the external server-clock correction.
  await page.context().addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string): void {
      setItem.call(this, key, key === "timeOffsetMs" ? "0" : value);
    };
    sessionStorage.setItem("timeOffsetMs", "0");
  });
  // Keep real timers and animation frames so Automerge can synchronize and maps can paint.
  await page.clock.setFixedTime(new Date(CLOCK_ORIGIN));
}

async function advanceClock(page: Page, milliseconds: number): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.setFixedTime(new Date(now + milliseconds));
}

async function observePetTickWindow(page: Page): Promise<void> {
  const startedAt = await page.evaluate(() => performance.now());
  // Observe more than two native 100 ms PET ticks before asserting that time stayed frozen.
  await expect
    .poll(() => page.evaluate((startedAt) => performance.now() - startedAt, startedAt))
    .toBeGreaterThanOrEqual(250);
}

async function editPet(page: Page, value: string): Promise<Locator> {
  await page.locator('div[aria-label="PET Timer"]').click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeAttached();
  await dialog.getByLabel("PET Timer", { exact: true }).fill(value);
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
      await mission.open(page);
      await openExecutionInformation(page, "Survey Alpha", mission.ids.rexEvaA, "Stopped Alpha");

      await expectPet(page, "+02:10:05");
      await expectPositionAge(page, mission.ids.posA, "+00:15:00");
      if (otherExecutionRunning) {
        await expect(page.getByTestId("header-pet-clock")).toHaveText("+00:05:00");
      } else {
        await expect(page.getByTestId("header-pet-clock")).toHaveCount(0);
      }

      await page.reload();
      await openExecutionInformation(page, "Survey Alpha", mission.ids.rexEvaA, "Stopped Alpha");
      await expectPet(page, "+02:10:05");
      await expectPositionAge(page, mission.ids.posA, "+00:15:00");
    });
  }

  test("switching executions A → B → A changes labels without leaking the other clock", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    await openExecutionInformation(page, "Survey Alpha", mission.ids.rexEvaA, "Stopped Alpha");
    await expectPositionAge(page, mission.ids.posA, "+00:15:00");

    await openExecutionInformation(page, "Survey Bravo", mission.ids.rexEvaB, "Active Bravo");
    await expectPet(page, "+00:05:00");
    await expectPositionAge(page, mission.ids.posB, "+00:03:00");
    await expect
      .poll(async () =>
        (await readMapFeatures(page)).filter(
          (feature) => feature.labelType === "pos" && feature.id === `pos-${mission.ids.posA}`
        )
      )
      .toHaveLength(0);

    await openExecutionInformation(page, "Survey Alpha", mission.ids.rexEvaA, "Stopped Alpha");
    await expectPet(page, "+02:10:05");
    await expectPositionAge(page, mission.ids.posA, "+00:15:00");
  });

  test("switching from historical execution to its plan removes execution position labels", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);
    await expectPositionAge(page, mission.ids.posA, "+00:15:00");

    await selectExecution(page, "Survey Alpha", mission.ids.evaA);
    await expect(page.locator('div[aria-label="EVA Title"]')).toHaveText("Survey Alpha");
    await expect(page.getByLabel("rex_info_panel", { exact: true })).toHaveCount(0);
    await expect
      .poll(async () =>
        (await readMapFeatures(page)).filter((feature) => feature.labelType === "pos")
      )
      .toHaveLength(0);
  });

  test("paused running execution keeps its PET and position ages fixed as time passes", async ({
    page,
    mission,
  }) => {
    await controlClock(page);
    await mission.open(page);
    await openExecutionInformation(page, "Survey Bravo", mission.ids.rexEvaB, "Active Bravo");
    await expectPet(page, "+00:05:00");
    await expectPositionAge(page, mission.ids.posB, "+00:03:00");

    await advanceClock(page, 120_000);
    await observePetTickWindow(page);
    await expectPet(page, "+00:05:00");
    await expectPositionAge(page, mission.ids.posB, "+00:03:00");
    await expect(page.getByTestId("header-pet-clock")).toHaveText("+00:05:00");
  });

  test("stopped execution stays frozen while a different execution's clock advances", async ({
    page,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.rexes[mission.ids.rexB].petRunning = true;
      doc.rexes[mission.ids.rexB].petStartStopTimestamp = CLOCK_ORIGIN;
    });
    await controlClock(page);
    await mission.open(page);
    await openExecutionInformation(page, "Survey Alpha", mission.ids.rexEvaA, "Stopped Alpha");
    await expectPositionAge(page, mission.ids.posA, "+00:15:00");

    const headerPet = await page.getByTestId("header-pet-clock").textContent();
    await advanceClock(page, 60_000);
    await expect(page.getByTestId("header-pet-clock")).not.toHaveText(headerPet ?? "");
    await expectPet(page, "+02:10:05");
    await expectPositionAge(page, mission.ids.posA, "+00:15:00");
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
      await controlClock(page);
      await mission.open(page);
      await openExecutionInformation(page, "Survey Bravo", mission.ids.rexEvaB, "Active Bravo");
      await enableEditing(page);
      await expectPet(page, boundary.initial);
      await expectPositionAge(page, mission.ids.posB, "+00:00:05");

      await page.getByRole("button", { name: "Start PET timer", exact: true }).click();
      await advanceClock(page, 10_000);
      await expectPet(page, boundary.expected);
      await expectPositionAge(page, mission.ids.posB, "+00:00:15");
      await expect(page.getByTestId("header-pet-clock")).toHaveText(boundary.expected);
    });
  }

  test("play, pause and resume advance only unpaused PET and persist the paused value", async ({
    page,
    mission,
  }) => {
    await controlClock(page);
    await mission.open(page);
    await openExecutionInformation(page, "Survey Bravo", mission.ids.rexEvaB, "Active Bravo");
    await enableEditing(page);
    await expectPet(page, "+00:05:00");

    await page.getByRole("button", { name: "Start PET timer", exact: true }).click();
    await expect(page.getByRole("button", { name: "Pause PET timer", exact: true })).toBeVisible();
    await advanceClock(page, 10_000);
    await expectPet(page, "+00:05:10");
    await expectPositionAge(page, mission.ids.posB, "+00:03:10");

    await page.getByRole("button", { name: "Pause PET timer", exact: true }).click();
    await expect(page.getByRole("button", { name: "Start PET timer", exact: true })).toBeVisible();
    await advanceClock(page, 60_000);
    await observePetTickWindow(page);
    await expectPet(page, "+00:05:10");
    await expectPositionAge(page, mission.ids.posB, "+00:03:10");

    await page.getByRole("button", { name: "Start PET timer", exact: true }).click();
    await advanceClock(page, 5000);
    await expectPet(page, "+00:05:15");
    await page.getByRole("button", { name: "Pause PET timer", exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).rexes[mission.ids.rexB].petValueAtStartStop)
      .toBe("+00:05:15");

    await page.reload();
    await openExecutionInformation(page, "Survey Bravo", mission.ids.rexEvaB, "Active Bravo");
    await expectPet(page, "+00:05:15");
    await expectPositionAge(page, mission.ids.posB, "+00:03:15");
  });

  test("stopping execution also freezes its running PET and removes the live dashboard", async ({
    page,
    mission,
    context,
  }) => {
    await controlClock(page);
    await mission.open(page);
    await openExecutionInformation(page, "Survey Bravo", mission.ids.rexEvaB, "Active Bravo");
    await enableEditing(page);
    const dashboard = await context.newPage();
    await installMapObserver(dashboard);
    await dashboard.goto(mission.dashboardUrl);
    await expect(dashboard.getByTestId("dashboard-pet-clock")).toHaveText("+00:05:00");
    await expect(dashboard.locator(".ol-viewport")).toHaveCount(2);

    await page.getByRole("button", { name: "Start PET timer", exact: true }).click();
    await advanceClock(page, 20_000);
    await expectPet(page, "+00:05:20");
    await page.getByLabel("Stop Execution", { exact: true }).click();
    await expect(page.getByLabel("Execute EVA", { exact: true })).toBeVisible();
    await expect
      .poll(async () => {
        const rex = (await mission.read()).rexes[mission.ids.rexB];
        return {
          isRunning: rex.isRunning,
          petRunning: rex.petRunning,
          pet: rex.petValueAtStartStop,
        };
      })
      .toEqual({ isRunning: false, petRunning: false, pet: "+00:05:20" });
    await advanceClock(page, 60_000);
    await observePetTickWindow(page);
    await expectPet(page, "+00:05:20");
    await expectPositionAge(page, mission.ids.posB, "+00:03:20");
    await expect(
      dashboard.getByText("No EVA is currently running.", { exact: true })
    ).toBeVisible();
    await expect(dashboard.locator(".ol-viewport")).toHaveCount(0);
    await expect(dashboard.getByTestId("dashboard-pet-clock")).toHaveCount(0);
    await dashboard.close();
  });

  test("another executing REX prevents starting the historical execution", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    await openExecutionInformation(page, "Survey Alpha", mission.ids.rexEvaA, "Stopped Alpha");
    await enableEditing(page);

    await expect(
      page.getByText("Cannot start execution of this rex while another rex is running", {
        exact: true,
      })
    ).toBeVisible();
    await expect(page.getByLabel("Execute EVA", { exact: true })).toHaveCount(0);
    const doc = await mission.read();
    expect(doc.rexes[mission.ids.rexA].isRunning).toBe(false);
    expect(doc.rexes[mission.ids.rexB].isRunning).toBe(true);
  });

  test("starting a stopped REX publishes its own frozen PET to an already-open dashboard", async ({
    page,
    mission,
    context,
  }) => {
    await mission.change((doc) => {
      doc.rexes[mission.ids.rexB].isRunning = false;
    });
    await mission.open(page);
    await openExecutionInformation(page, "Survey Alpha", mission.ids.rexEvaA, "Stopped Alpha");
    await enableEditing(page);
    const dashboard = await context.newPage();
    await installMapObserver(dashboard);
    await dashboard.goto(mission.dashboardUrl);
    await expect(
      dashboard.getByText("No EVA is currently running.", { exact: true })
    ).toBeVisible();

    await page.getByLabel("Execute EVA", { exact: true }).click();
    await expect(page.getByLabel("Stop Execution", { exact: true })).toBeVisible();
    await expect(dashboard.getByTestId("dashboard-pet-clock")).toHaveText("+02:10:05");
    await expect(dashboard.getByText("Stopped Alpha", { exact: true })).toBeVisible();
    await expect(dashboard.locator(".ol-viewport")).toHaveCount(2);
    await expectPositionAge(dashboard, mission.ids.posA, "+00:15:00", "dashboard");
    await expectPositionAge(page, mission.ids.posA, "+00:15:00");
    await expect
      .poll(async () => (await mission.read()).rexes[mission.ids.rexA].isRunning)
      .toBe(true);
    await dashboard.close();
  });

  test("execution controls stay unavailable until Edit mode is enabled", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    await openExecutionInformation(page, "Survey Bravo", mission.ids.rexEvaB, "Active Bravo");
    await expect(page.getByLabel("Stop Execution", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Start PET timer", exact: true })).toHaveCount(0);

    await page.locator('div[aria-label="PET Timer"]').click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expectPet(page, "+00:05:00");

    await enableEditing(page);
    await expect(page.getByLabel("Stop Execution", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start PET timer", exact: true })).toBeVisible();
  });
});

test.describe("PET value editing", () => {
  test("saving a nonzero historical PET updates its position age and survives reload", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    await openExecutionInformation(page, "Survey Alpha", mission.ids.rexEvaA, "Stopped Alpha");
    await enableEditing(page);
    const dialog = await editPet(page, "+02:20:05");
    await dialog.getByText("Save", { exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expectPet(page, "+02:20:05");
    await expectPositionAge(page, mission.ids.posA, "+00:25:00");
    await expect
      .poll(async () => (await mission.read()).rexes[mission.ids.rexA].petValueAtStartStop)
      .toBe("+02:20:05");

    await page.reload();
    await openExecutionInformation(page, "Survey Alpha", mission.ids.rexEvaA, "Stopped Alpha");
    await expectPet(page, "+02:20:05");
    await expectPositionAge(page, mission.ids.posA, "+00:25:00");
  });

  test("Cancel preserves historical PET and labels in the document and after reload", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    await openExecutionInformation(page, "Survey Alpha", mission.ids.rexEvaA, "Stopped Alpha");
    await enableEditing(page);
    const dialog = await editPet(page, "+03:00:00");
    await dialog.getByText("Cancel", { exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expectPet(page, "+02:10:05");
    await expectPositionAge(page, mission.ids.posA, "+00:15:00");
    expect((await mission.read()).rexes[mission.ids.rexA].petValueAtStartStop).toBe("+02:10:05");

    await page.reload();
    await openExecutionInformation(page, "Survey Alpha", mission.ids.rexEvaA, "Stopped Alpha");
    await expectPet(page, "+02:10:05");
    await expectPositionAge(page, mission.ids.posA, "+00:15:00");
  });

  for (const invalidPet of ["12:3", ""]) {
    test(`invalid PET ${invalidPet ? "format" : "empty value"} cannot replace the saved time`, async ({
      page,
      mission,
    }) => {
      await mission.open(page);
      await openExecutionInformation(page, "Survey Alpha", mission.ids.rexEvaA, "Stopped Alpha");
      await enableEditing(page);
      const dialog = await editPet(page, invalidPet);
      await expect(
        dialog.getByText(invalidPet ? "Must be in HH:MM:SS format" : "Required", { exact: true })
      ).toBeVisible();
      await dialog.getByText("Save", { exact: true }).click();
      await expect(dialog).toBeAttached();
      expect((await mission.read()).rexes[mission.ids.rexA].petValueAtStartStop).toBe("+02:10:05");
      await dialog.getByText("Cancel", { exact: true }).click();
      await expectPet(page, "+02:10:05");
      await expectPositionAge(page, mission.ids.posA, "+00:15:00");
    });
  }

  for (const acceptReset of [false, true]) {
    test(`${acceptReset ? "confirming" : "cancelling"} reset ${acceptReset ? "sets PET to zero" : "preserves the PET"}`, async ({
      page,
      mission,
    }) => {
      await mission.open(page);
      await openExecutionInformation(page, "Survey Bravo", mission.ids.rexEvaB, "Active Bravo");
      await enableEditing(page);
      page.once("dialog", async (dialog) => {
        expect(dialog.type()).toBe("confirm");
        expect(dialog.message()).toBe("Are you sure you want to reset the PET timer?");
        if (acceptReset) await dialog.accept();
        else await dialog.dismiss();
      });
      await page.getByRole("button", { name: "Reset PET timer", exact: true }).click();
      const expected = acceptReset ? "+00:00:00" : "+00:05:00";
      await expectPet(page, expected);
      await expectPositionAge(page, mission.ids.posB, acceptReset ? "+00:00:00" : "+00:03:00");
      await expect
        .poll(async () => (await mission.read()).rexes[mission.ids.rexB].petValueAtStartStop)
        .toBe(expected);

      await page.reload();
      await openExecutionInformation(page, "Survey Bravo", mission.ids.rexEvaB, "Active Bravo");
      await expectPet(page, expected);
      await expectPositionAge(page, mission.ids.posB, acceptReset ? "+00:00:00" : "+00:03:00");
    });
  }
});
