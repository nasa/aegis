import { readFile } from "node:fs/promises";
import type { BrowserContext } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";

test.use({ scenario: "execution" });

test("admin dump restores the same mission document through the supported Automerge import", async ({
  browser,
  baseURL,
  page,
  request,
  mission,
}, testInfo) => {
  let freshClient: BrowserContext | undefined;
  const listingBeforeResponse = await request.get(`/api/v1/docListing?missionId=${mission.id}`);
  expect(listingBeforeResponse.ok()).toBe(true);
  const listingBeforeBody = (await listingBeforeResponse.json()) as WrappedResponse<
    AutomergeDocListing[]
  >;
  expect(listingBeforeBody.status).toBe("success");
  expect(listingBeforeBody.data).toHaveLength(1);
  const originalListing = listingBeforeBody.data?.[0];
  expect(originalListing).toMatchObject({ missionId: mission.id, automergeUrl: mission.docUrl });

  try {
    await page.goto(`/admin/export/${mission.id}`);
    await expect(page.getByRole("heading", { name: "Export Mission", exact: true })).toBeVisible();
    await expect(page.getByText(mission.name, { exact: true })).toBeVisible();

    const pendingDump = page.waitForEvent("download");
    await page.getByRole("button", { name: "Dump Mission to JSON File", exact: true }).click();
    const dumpDownload = await pendingDump;
    expect(await dumpDownload.failure()).toBeNull();
    expect(dumpDownload.suggestedFilename()).toMatch(
      new RegExp(`^mission_${mission.id}_dump_.*\\.json$`)
    );
    const dump = JSON.parse(
      await readFile((await dumpDownload.path()) as string, "utf8")
    ) as MissionDump;
    const dumpedMission = dump.missionData.mission;
    expect(dump.missionData).toEqual({ mission: dumpedMission });
    expect(dumpedMission).toMatchObject({
      id: mission.id,
      name: mission.name,
      stations: { [mission.ids.stationA]: { name: "Alpha station" } },
      pois: { [mission.ids.poiA]: { name: "Reference POI" } },
      actions: { [mission.ids.actionA]: { name: "Sample regolith" } },
    });
    expect(dumpedMission.evas[mission.ids.evaA].sequence).toEqual(
      (await mission.read()).evas[mission.ids.evaA].sequence
    );
    expect(Object.keys(dump)).toEqual(["exportDate", "missionData"]);

    await mission.change((doc) => {
      doc.description = "Temporary post-dump mutation";
      doc.stations[mission.ids.stationA].name = "Changed after dump";
      doc.evas[mission.ids.evaA].name = "Changed after dump";
    });
    await expect
      .poll(async () => (await mission.read()).description)
      .toBe("Temporary post-dump mutation");

    await page.goto(`/admin/automerge/${mission.docUrl}`);
    await expect(
      page.getByRole("heading", { name: "Manage Automerge Data", exact: true })
    ).toBeVisible();
    await expect(page.getByText(mission.name, { exact: true }).first()).toBeVisible();
    await page.locator("textarea").fill(JSON.stringify(dumpedMission, null, 2));
    const importerLogs: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "log") importerLogs.push(message.text());
    });
    await page.getByRole("button", { name: "Import JSON as New Version", exact: true }).click();
    const importStatus = page.locator('p[class*="statusMessage"]');
    await expect(importStatus).toBeVisible();
    const importStatusText = await importStatus.innerText();
    if (!importStatusText.includes("Imported new version successfully")) {
      throw new Error(
        `Automerge import status: ${importStatusText}. Logs: ${importerLogs.join(" | ")}`
      );
    }
    await testInfo.attach("automerge-import-status-and-logs", {
      body: JSON.stringify({ status: importStatusText, logs: importerLogs }, null, 2),
      contentType: "application/json",
    });
    expect(importStatusText).toContain("Imported new version successfully");
    await expect.poll(mission.read).toEqual(dumpedMission);

    const listingAfterResponse = await request.get(`/api/v1/docListing?missionId=${mission.id}`);
    expect(listingAfterResponse.ok()).toBe(true);
    expect(await listingAfterResponse.json()).toMatchObject({
      status: "success",
      data: [originalListing],
    });

    freshClient = await browser.newContext({
      baseURL,
      storageState: await page.context().storageState(),
    });
    const freshPage = await freshClient.newPage();
    const pageErrors: string[] = [];
    freshPage.on("pageerror", (error) => pageErrors.push(error.message));
    await freshPage.goto(mission.url);
    await expect(freshPage.getByLabel("missionNameHeader", { exact: true })).toHaveText(
      dumpedMission.name
    );
    await expect(freshPage.locator(".ol-viewport")).toHaveCount(1);
    expect(pageErrors).toEqual([]);
    expect(await mission.read()).toEqual(dumpedMission);
  } finally {
    await freshClient?.close();
  }
});
