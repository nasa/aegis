import { commands } from "vitest/browser";
import { test as base, expect } from "./missionHarness";
import { seedFolder } from "tests/playwright/fixtures/entitySeeds";
import { openPlanningSection, selectPlanningStation } from "./planningHelpers";
import { exactText } from "./browserAssertions";
const items: Array<{ id: number; name: string; runningRex: null }> = [];
const test = base.extend({
  requestHandlers: {
    "/api/v1/version": () =>
      Response.json({
        version: __APP_VERSION__,
        gitCommit: __GIT_COMMIT__,
        serverEpochUuid: "browser-test-epoch",
      }),
    "/api/v1/missionHomepageItems": () => Response.json({ status: "success", data: items }),
  },
});
test("layout, section selection, and collapsed folders follow their local persistence boundaries", async ({
  page,
  mission,
}) => {
  const folderUuid = crypto.randomUUID();
  const secondMissionName = `Local layout mission ${crypto.randomUUID()}`;
  const secondMission = await mission.addMission(secondMissionName);
  items.push(
    { id: mission.id, name: mission.name, runningRex: null },
    { id: secondMission.id, name: secondMissionName, runningRex: null }
  );

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
    await mission.open();
    const layout = page.getByTestId("mission-dockview");
    const panelWidth = async (testId: string) =>
      page.getByTestId(testId).element().getBoundingClientRect().width;
    const panelHeight = async (testId: string) =>
      page.getByTestId(testId).element().getBoundingClientRect().height;

    await expect.element(layout).toBeVisible();
    await expect.poll(() => panelWidth("mission-panel-left")).toBeGreaterThan(200);
    await expect.poll(() => panelWidth("mission-panel-right")).toBeGreaterThan(200);
    if ((await panelHeight("mission-panel-bottom")) < 100) {
      await page.getByTestId("mission-drawer-bottom").click();
    }
    await expect.poll(() => panelHeight("mission-panel-bottom")).toBeGreaterThan(100);

    const splitter = page.getBySelector(".dv-split-view-container.dv-horizontal .dv-sash").first();
    await expect.element(splitter).toBeVisible();
    const leftWidthBeforeDrag = await panelWidth("mission-panel-left");
    const splitterBounds = splitter.element().getBoundingClientRect();
    expect(splitterBounds).not.toBeNull();
    await commands.mapPointer(
      "move",
      splitterBounds.x + splitterBounds.width / 2,
      splitterBounds.y + splitterBounds.height / 2
    );
    await commands.mapPointer("down");
    await commands.mapPointer(
      "move",
      splitterBounds.x + splitterBounds.width / 2 + 90,
      splitterBounds.y + splitterBounds.height / 2,
      8
    );
    await commands.mapPointer("up");
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
      .getBySelector('[class*="folderContainer"]')
      .filter({ hasText: "Local state folder" });
    await expect
      .poll(() => folder.getByLabelText("stationList-item", { exact: true }).length)
      .toBe(1);
    await folder.getByText("Local state folder", { exact: true }).click();
    await expect
      .poll(() => folder.getByLabelText("stationList-item", { exact: true }).length)
      .toBe(0);
    await expect
      .element(page.getByLabelText("station Section", { exact: true }))
      .toHaveClass(/iconContainerSelected/);
    await page.getByTestId("mission-drawer-left").click();
    await expect.poll(() => panelWidth("mission-panel-left")).toBeLessThan(60);
    await page.getByTestId("mission-drawer-right").click();
    await expect.poll(() => panelWidth("mission-panel-right")).toBeLessThan(5);

    await mission.open();
    await expect
      .element(page.getByLabelText("missionNameHeader", { exact: true }))
      .toMatchTextContent(exactText(mission.name));
    await expect.poll(() => panelWidth("mission-panel-left")).toBeGreaterThan(200);
    await expect.poll(() => panelWidth("mission-panel-right")).toBeGreaterThan(200);
    await expect
      .element(page.getByLabelText("preset Section", { exact: true }))
      .toHaveClass(/iconContainerSelected/);
    await openPlanningSection(page, "station");
    const reloadedFolder = page
      .getBySelector('[class*="folderContainer"]')
      .filter({ hasText: "Local state folder" });
    await expect
      .poll(() => reloadedFolder.getByLabelText("stationList-item", { exact: true }).length)
      .toBe(0);

    await mission.navigate("/");
    const secondMissionRow = page
      .getBySelector("tr")
      .filter({ has: page.getByText(secondMissionName, { exact: true }) });
    await secondMissionRow.getByRole("button", { name: "Select", exact: true }).click();
    await expect
      .element(page.getByLabelText("missionNameHeader", { exact: true }))
      .toMatchTextContent(exactText(secondMissionName));
    await expect
      .element(page.getByLabelText("preset Section", { exact: true }))
      .toHaveClass(/iconContainerSelected/);

    await mission.navigate("/");
    await page
      .getBySelector("tr")
      .filter({ has: page.getByText(mission.name, { exact: true }) })
      .getByRole("button", { name: "Select", exact: true })
      .click();
    await expect
      .element(page.getByLabelText("missionNameHeader", { exact: true }))
      .toMatchTextContent(exactText(mission.name));
    await expect
      .element(page.getByLabelText("preset Section", { exact: true }))
      .toHaveClass(/iconContainerSelected/);
    await openPlanningSection(page, "station");
    await expect
      .poll(
        () =>
          page
            .getBySelector('[class*="folderContainer"]')
            .filter({ hasText: "Local state folder" })
            .getByLabelText("stationList-item", { exact: true }).length
      )
      .toBe(0);

    const missionAfterUiChanges = await mission.read();
    expect(missionAfterUiChanges).toEqual(missionBeforeUiChanges);
  } finally {
    items.length = 0;
  }
});
