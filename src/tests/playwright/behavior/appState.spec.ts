import { randomUUID } from "node:crypto";
import { test, expect } from "../fixtures/behavioralTest";
import { seedFolder } from "../fixtures/entitySeeds";
import { openPlanningSection, selectPlanningStation } from "./planningHelpers";

test("layout, section selection, and collapsed folders follow their local persistence boundaries", async ({
  page,
  request,
  mission,
}) => {
  const folderUuid = randomUUID();
  const secondMissionName = `Local layout mission ${randomUUID()}`;
  let secondMissionId: number | undefined;

  await mission.change((doc) => {
    for (const folder of Object.values(doc.folders)) {
      if (folder.type === "station") {
        folder.items = folder.items.filter((itemUuid) => itemUuid !== mission.ids.stationA);
      }
    }
    doc.folders[folderUuid] = seedFolder({
      uuid: folderUuid,
      name: "Local state folder",
      type: "station",
      items: [mission.ids.stationA],
    });
  });
  const missionBeforeUiChanges = await mission.read();

  try {
    const created = await request.post("/api/v1/missionAutomerge", { data: {} });
    expect(created.ok()).toBe(true);
    secondMissionId = ((await created.json()) as WrappedResponse<AutomergeDocListing>).data
      .missionId;
    const named = await request.post("/api/v1/missionAutomerge/fields", {
      data: { missionId: secondMissionId, fields: { name: secondMissionName } },
    });
    expect(named.ok()).toBe(true);

    await mission.open(page);
    const layout = page.getByTestId("mission-dockview");
    const panelWidth = async (testId: string) =>
      page.getByTestId(testId).evaluate((element) => element.getBoundingClientRect().width);
    const panelHeight = async (testId: string) =>
      page.getByTestId(testId).evaluate((element) => element.getBoundingClientRect().height);

    await expect(layout).toBeVisible();
    await expect.poll(() => panelWidth("mission-panel-left")).toBeGreaterThan(200);
    await expect.poll(() => panelWidth("mission-panel-right")).toBeGreaterThan(200);
    if ((await panelHeight("mission-panel-bottom")) < 100) {
      await page.getByTestId("mission-drawer-bottom").click();
    }
    await expect.poll(() => panelHeight("mission-panel-bottom")).toBeGreaterThan(100);

    const splitter = page.locator(".dv-split-view-container.dv-horizontal .dv-sash").first();
    await expect(splitter).toBeVisible();
    const leftWidthBeforeDrag = await panelWidth("mission-panel-left");
    const splitterBounds = await splitter.boundingBox();
    expect(splitterBounds).not.toBeNull();
    await page.mouse.move(
      splitterBounds!.x + splitterBounds!.width / 2,
      splitterBounds!.y + splitterBounds!.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      splitterBounds!.x + splitterBounds!.width / 2 + 90,
      splitterBounds!.y + splitterBounds!.height / 2,
      { steps: 8 }
    );
    await page.mouse.up();
    await expect.poll(() => panelWidth("mission-panel-left")).toBe(leftWidthBeforeDrag);

    await page.getByTestId("mission-drawer-left").click();
    await expect.poll(() => panelWidth("mission-panel-left")).toBeLessThan(60);
    await page.getByTestId("mission-drawer-left").click();
    await expect.poll(() => panelWidth("mission-panel-left")).toBeGreaterThan(200);
    await page.getByTestId("mission-drawer-right").click();
    await expect.poll(() => panelWidth("mission-panel-right")).toBeLessThan(5);
    await page.getByTestId("mission-drawer-right").click();
    await expect.poll(() => panelWidth("mission-panel-right")).toBeGreaterThan(200);
    await page.getByTestId("mission-drawer-bottom").click();
    await expect.poll(() => panelHeight("mission-panel-bottom")).toBeLessThan(5);
    await page.getByTestId("mission-drawer-bottom").click();
    await expect.poll(() => panelHeight("mission-panel-bottom")).toBeGreaterThan(100);

    await openPlanningSection(page, "station");
    await selectPlanningStation(page, "Alpha station");
    const folder = page
      .locator('[class*="folderContainer"]')
      .filter({ hasText: "Local state folder" });
    await expect(folder.getByLabel("stationList-item", { exact: true })).toHaveCount(1);
    await folder.getByText("Local state folder", { exact: true }).click();
    await expect(folder.getByLabel("stationList-item", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("station Section", { exact: true })).toHaveAttribute(
      "class",
      /iconContainerSelected/
    );
    await page.getByTestId("mission-drawer-left").click();
    await expect.poll(() => panelWidth("mission-panel-left")).toBeLessThan(60);
    await page.getByTestId("mission-drawer-right").click();
    await expect.poll(() => panelWidth("mission-panel-right")).toBeLessThan(5);

    await page.reload();
    await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(mission.name);
    await expect.poll(() => panelWidth("mission-panel-left")).toBeGreaterThan(200);
    await expect.poll(() => panelWidth("mission-panel-right")).toBeGreaterThan(200);
    await expect(page.getByLabel("preset Section", { exact: true })).toHaveAttribute(
      "class",
      /iconContainerSelected/
    );
    await openPlanningSection(page, "station");
    const reloadedFolder = page
      .locator('[class*="folderContainer"]')
      .filter({ hasText: "Local state folder" });
    await expect(reloadedFolder.getByLabel("stationList-item", { exact: true })).toHaveCount(0);

    await page.goto("/");
    const secondMissionRow = page
      .locator("tr")
      .filter({ has: page.getByText(secondMissionName, { exact: true }) });
    await secondMissionRow.getByRole("button", { name: "Select", exact: true }).click();
    await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(
      secondMissionName
    );
    await expect(page.getByLabel("preset Section", { exact: true })).toHaveAttribute(
      "class",
      /iconContainerSelected/
    );

    await page.goto("/");
    await page
      .locator("tr")
      .filter({ has: page.getByText(mission.name, { exact: true }) })
      .getByRole("button", { name: "Select", exact: true })
      .click();
    await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(mission.name);
    await expect(page.getByLabel("preset Section", { exact: true })).toHaveAttribute(
      "class",
      /iconContainerSelected/
    );
    await openPlanningSection(page, "station");
    await expect(
      page
        .locator('[class*="folderContainer"]')
        .filter({ hasText: "Local state folder" })
        .getByLabel("stationList-item", { exact: true })
    ).toHaveCount(0);

    const missionAfterUiChanges = await mission.read();
    expect(missionAfterUiChanges).toEqual(missionBeforeUiChanges);
  } finally {
    if (secondMissionId !== undefined) {
      const deleted = await request.delete("/api/v1/missionAutomerge", {
        data: { missionIds: [secondMissionId] },
      });
      expect(deleted.ok()).toBe(true);
    }
  }
});

test("mission edit controls stay gated during doc hydration and a failed request can be retried", async ({
  page,
  mission,
}) => {
  const missionBeforeHydration = await mission.read();
  let releaseDocListing!: () => void;
  let docListingRequested!: () => void;
  const docListingGate = new Promise<void>((resolve) => {
    releaseDocListing = resolve;
  });
  const docListingObserved = new Promise<void>((resolve) => {
    docListingRequested = resolve;
  });
  const docListingRoute = (url: URL) => {
    return (
      url.pathname === "/api/v1/docListing" && url.searchParams.get("missionId") === `${mission.id}`
    );
  };

  await page.route(docListingRoute, async (route) => {
    docListingRequested();
    await docListingGate;
    await route.continue();
  });
  await page.goto(mission.url);
  await docListingObserved;
  await expect(page.getByLabel("loading-overlay", { exact: true })).toBeVisible();
  await expect(page.getByText("Loading mission data...", { exact: true })).toBeVisible();
  await expect(page.getByLabel("globalEditToggle", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("mission-panel-map")).toHaveCount(0);
  releaseDocListing();
  await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(mission.name);
  await expect(page.getByLabel("globalEditToggle", { exact: true })).toBeEnabled();
  await page.unroute(docListingRoute);

  let allRequests = 0;
  await page.route(
    (url) =>
      url.pathname === "/api/v1/all" && url.searchParams.get("missionId") === `${mission.id}`,
    async (route) => {
      allRequests++;
      if (allRequests === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ status: "error", message: "Temporary fixture outage" }),
        });
      } else {
        await route.continue();
      }
    }
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Mission data could not be loaded");
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  await expect(page.getByLabel("globalEditToggle", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("mission-panel-map")).toHaveCount(0);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(mission.name);
  await expect(page.getByLabel("globalEditToggle", { exact: true })).toBeEnabled();
  expect(allRequests).toBe(2);
  expect(await mission.read()).toEqual(missionBeforeHydration);
});

test("a delayed hydration from a previous mission cannot replace the newly selected mission", async ({
  page,
  request,
  mission,
}) => {
  const nextMissionName = `Hydration target ${randomUUID()}`;
  const missionBeforeSwitch = await mission.read();
  const created = await request.post("/api/v1/missionAutomerge", { data: {} });
  expect(created.ok()).toBe(true);
  const nextMissionId = ((await created.json()) as WrappedResponse<AutomergeDocListing>).data
    .missionId;
  const named = await request.post("/api/v1/missionAutomerge/fields", {
    data: { missionId: nextMissionId, fields: { name: nextMissionName } },
  });
  expect(named.ok()).toBe(true);

  let releasePreviousHydration!: () => void;
  let previousRequestArrived!: () => void;
  let previousRequestsCompleted = 0;
  const previousHydrationGate = new Promise<void>((resolve) => {
    releasePreviousHydration = resolve;
  });
  const previousHydrationArrived = new Promise<void>((resolve) => {
    previousRequestArrived = resolve;
  });
  const previousMissionMatcher = (url: URL) =>
    url.pathname === "/api/v1/all" && url.searchParams.get("missionId") === `${mission.id}`;

  try {
    await page.goto("/");
    await page.route(previousMissionMatcher, async (route) => {
      previousRequestArrived();
      await previousHydrationGate;
      await route.continue();
      previousRequestsCompleted++;
    });
    await page
      .locator("tr")
      .filter({ has: page.getByText(mission.name, { exact: true }) })
      .getByRole("button", { name: "Select", exact: true })
      .click();
    await previousHydrationArrived;
    await expect(page.getByLabel("loading-overlay", { exact: true })).toBeVisible();
    await expect(page.getByLabel("globalEditToggle", { exact: true })).toHaveCount(0);

    await page.goBack();
    await expect(page.getByText("Select a Mission", { exact: true })).toBeVisible();
    await page
      .locator("tr")
      .filter({ has: page.getByText(nextMissionName, { exact: true }) })
      .getByRole("button", { name: "Select", exact: true })
      .click();
    await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(nextMissionName);
    await expect(page.getByLabel("globalEditToggle", { exact: true })).toBeEnabled();

    releasePreviousHydration();
    await expect.poll(() => previousRequestsCompleted).toBeGreaterThan(0);
    await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(nextMissionName);
    await expect(page.getByLabel("globalEditToggle", { exact: true })).toBeEnabled();
    await expect(
      page.getByText("Mission data could not be loaded. Please retry.", { exact: true })
    ).toHaveCount(0);
    expect(await mission.read()).toEqual(missionBeforeSwitch);
  } finally {
    releasePreviousHydration();
    const deleted = await request.delete("/api/v1/missionAutomerge", {
      data: { missionIds: [nextMissionId] },
    });
    expect(deleted.ok()).toBe(true);
  }
});

test("a failed document-list request shows a retry action and recovers mission hydration", async ({
  page,
  mission,
}) => {
  const missionBeforeHydration = await mission.read();
  let listingRequests = 0;
  await page.route(
    (url) =>
      url.pathname === "/api/v1/docListing" &&
      url.searchParams.get("missionId") === `${mission.id}`,
    async (route) => {
      listingRequests++;
      if (listingRequests === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ status: "error", message: "Temporary document-list outage" }),
        });
      } else {
        await route.continue();
      }
    }
  );

  await page.goto(mission.url);
  await expect(page.getByRole("alert")).toContainText("Mission data could not be loaded");
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  await expect(page.getByLabel("globalEditToggle", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("mission-panel-map")).toHaveCount(0);

  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(mission.name);
  await expect(page.getByLabel("globalEditToggle", { exact: true })).toBeEnabled();
  expect(listingRequests).toBe(2);
  expect(await mission.read()).toEqual(missionBeforeHydration);
});
